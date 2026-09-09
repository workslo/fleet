import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { compareSnapshots, snapshotDatabase, verifyRestoredConstraints } from "./recovery-database.mjs";
import { advanceRestoredWork, apiClient, createIdentity, enrollSyntheticActors, httpSnapshot, populateFixture, startWorker, verifyRestoredHttp } from "./recovery-fixture.mjs";
import { createRun, parseArguments, runWrangler, verifyToolchain, writeJson } from "./recovery-local.mjs";
import { servePreview } from "./recovery-preview.mjs";

async function fileHash(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function sourceEvidence(root, run) {
  const hashes = [];
  for (const directory of ["operations", "worker/migrations"]) {
    for (const name of (await readdir(join(root, directory))).sort()) {
      if (name.endsWith(".mjs") || name.endsWith(".sql")) hashes.push({ path: `${directory}/${name}`, sha256: await fileHash(join(root, directory, name)) });
    }
  }
  return {
    commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    working_tree_dirty: execFileSync("git", ["-c", "core.fsmonitor=false", "status", "--porcelain=v1"], { cwd: root, encoding: "utf8" }).trim().length > 0,
    worker_bundle_sha256: await fileHash(join(run, "worker.mjs")), files: hashes,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
  const toolchain = await verifyToolchain(root);
  const context = await createRun(root);
  let worker;
  let preview;
  let stage = "initialize";
  try {
    const commands = [];
    await build({ entryPoints: [join(root, "worker/src/index.ts")], outfile: join(context.run, "worker.mjs"), bundle: true, format: "esm", platform: "browser", target: "es2024", logLevel: "silent" });
    const source = await sourceEvidence(root, context.run);
    const identity = await createIdentity();
    stage = "migrate source";
    commands.push(await runWrangler(context, "source", "migrate"));
    worker = startWorker(context, "source", identity);
    await enrollSyntheticActors(await worker.getD1Database("DB"));
    stage = "populate source through Worker HTTP";
    const sourceApi = apiClient(worker, identity);
    const fixture = await populateFixture(sourceApi);
    const beforeHttp = await httpSnapshot(sourceApi, fixture);
    await worker.dispose(); worker = undefined;
    const before = await snapshotDatabase(context.run, "source");
    await writeJson(join(context.run, "source-snapshot.json"), before);
    await writeJson(join(context.run, "fixture.json"), fixture);
    await writeJson(join(context.run, "http-snapshot.json"), beforeHttp);
    console.log(`Source ready: ${before.tables.length} tables, ${before.tables.reduce((sum, table) => sum + table.rows, 0)} rows; synthetic data only.`);

    stage = "export and restore into empty destination";
    commands.push(await runWrangler(context, "source", "export"));
    commands.push(await runWrangler(context, "destination", "restore"));
    const restored = await snapshotDatabase(context.run, "destination");
    compareSnapshots(before, restored);
    await writeJson(join(context.run, "restored-snapshot.json"), restored);

    stage = "verify restored HTTP and enforcement";
    worker = startWorker(context, "destination", identity);
    const restoredApi = apiClient(worker, identity);
    const http = await verifyRestoredHttp(restoredApi, fixture, beforeHttp);
    const constraints = await verifyRestoredConstraints(await worker.getD1Database("DB"), fixture);
    await worker.dispose(); worker = undefined;
    // Replays and rejected writes must leave every persisted application row unchanged.
    compareSnapshots(before, await snapshotDatabase(context.run, "destination"));

    stage = "advance restored work";
    worker = startWorker(context, "destination", identity);
    const progress = await advanceRestoredWork(apiClient(worker, identity), fixture, http.cursor);
    await worker.dispose(); worker = undefined;
    const advanced = await snapshotDatabase(context.run, "destination");
    await writeJson(join(context.run, "advanced-snapshot.json"), advanced);
    const report = {
      status: "passed", verified_at: new Date().toISOString(), commit: source.commit, source, toolchain, run_directory: context.run,
      scope: "Local-only rehearsal using the real Worker, local Miniflare D1, and synthetic signed identities",
      commands, export: { path: "export.sql", bytes: (await readFile(join(context.run, "export.sql"))).length, sha256: await fileHash(join(context.run, "export.sql")) },
      tables: before.tables.length, rows: before.tables.reduce((sum, table) => sum + table.rows, 0),
      schema_objects: before.schema.length, schema_sha256: before.schema_sha256, rows_sha256: before.rows_sha256,
      schema_and_rows_preserved: true, sqlite_sequence_preserved: true, foreign_key_violations: 0, integrity_check: "ok",
      http, constraints, progress,
      limitations: ["Synthetic local identities do not prove native Access transport or provider policy", "No production credentials, provisioning, deployment, or data were used", "This automated rehearsal does not record Shane's owner rehearsal or Product V1 acceptance"],
    };
    await writeJson(join(context.run, "report.json"), report);
    console.log(`Recovery passed: ${report.tables} tables, ${report.rows} rows, ${report.schema_objects} schema objects; ${http.http_reads_compared} HTTP reads; ${constraints.length} constraints; cursor ${progress.previous_cursor} -> ${progress.next_cursor}.`);
    console.log(`Report: ${join(context.run, "report.json")}`);
    if (options.serve) {
      stage = "serve restored Board";
      worker = startWorker(context, "destination", identity);
      preview = await servePreview(context, worker, identity);
      console.log(`Local recovery rehearsal — synthetic data: ${preview.origin}`);
      console.log("Ctrl+C stops the loopback preview; all run artifacts remain on disk.");
      await new Promise((resolveStop) => { process.once("SIGINT", resolveStop); process.once("SIGTERM", resolveStop); });
    }
  } catch (error) {
    await writeJson(join(context.run, "failure.json"), { status: "failed", stage, verified_at: new Date().toISOString() });
    // Error messages are bounded statements generated by this runner; no HTTP headers or bodies are logged.
    console.error(`Recovery failed during ${stage}. Diagnostic: ${join(context.run, "failure.json")}`);
    throw error;
  } finally {
    if (preview) await preview.close();
    if (worker) await worker.dispose();
  }
}

main().catch(() => {
  console.error("Recovery runner could not complete. Use Node.js 24+, npm ci, and: node operations/rehearse-recovery.mjs [--serve]. If a run began, its failure.json identifies the stage; Wrangler diagnostics remain in that run's local logs.");
  process.exitCode = 1;
});
