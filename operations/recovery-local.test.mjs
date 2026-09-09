import assert from "node:assert/strict";
import { mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { compareSnapshots } from "./recovery-database.mjs";
import { childEnvironment, createRun, digest, failureDetails, parseArguments, requireCondition, verifyToolchain, writeJson } from "./recovery-local.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function fixtureDirectory() {
  const fixture = (await createRun(root)).run;
  await writeJson(join(fixture, "helper-test.json"), { purpose: "Recovery helper test fixture; not a rehearsal result" });
  return fixture;
}

test("the rehearsal refuses remote targets, paths, credentials and extra switches", () => {
  assert.deepEqual(parseArguments([]), { serve: false });
  assert.deepEqual(parseArguments(["--serve"]), { serve: true });
  for (const args of [["--remote"], ["--config", "/tmp/existing.json"], ["--persist-to", "/tmp/existing"], ["--token", "synthetic"], ["--serve", "--remote"], ["--serve", "--serve"]]) {
    assert.throws(() => parseArguments(args), /not supported/);
  }
});

test("a linked output directory cannot redirect a rehearsal into another database location", async () => {
  const fixture = await fixtureDirectory();
  const target = join(fixture, "existing-data");
  await mkdir(target);
  await symlink(target, join(fixture, "recovery-runs"));
  await assert.rejects(createRun(fixture), /real directory/);
  assert.deepEqual(await readdir(target), []);
});

test("an existing file at the output directory is preserved and rejected", async () => {
  const fixture = await fixtureDirectory();
  await writeFile(join(fixture, "recovery-runs"), "owner data");
  await assert.rejects(createRun(fixture), /real directory/);
  assert.equal(await readFile(join(fixture, "recovery-runs"), "utf8"), "owner data");
});

test("Wrangler children receive no inherited credential or Node injection settings", () => {
  const env = childEnvironment("/synthetic/rehearsal");
  for (const key of ["GH_TOKEN", "GITHUB_TOKEN", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_API_KEY", "CF_API_TOKEN", "CF_ACCESS_CLIENT_SECRET", "NODE_OPTIONS", "NODE_PATH", "HOME"]) {
    assert.equal(Object.hasOwn(env, key), false, `${key} must not reach the Wrangler child`);
  }
  assert.equal(env.WRANGLER_SEND_METRICS, "false");
  assert.equal(env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV, "false");
});

test("content digests ignore object key order but distinguish stored value types", () => {
  assert.equal(digest({ state: "Accepted", version: 2 }), digest({ version: 2, state: "Accepted" }));
  assert.notEqual(digest({ version: 2n }), digest({ version: "2" }));
  assert.notEqual(digest({ data: new Uint8Array([1, 2]) }), digest({ data: "AQI=" }));
});

test("same-size restores fail when schema, content or sequence counters differ", () => {
  const source = { schema_sha256: "schema", rows_sha256: "rows", sequences: [{ name: "activity_events", seq: 40 }] };
  assert.doesNotThrow(() => compareSnapshots(source, structuredClone(source)));
  assert.throws(() => compareSnapshots(source, { ...source, schema_sha256: "missing-trigger" }), /tables, indexes, or triggers/);
  assert.throws(() => compareSnapshots(source, { ...source, rows_sha256: "changed-content-same-row-count" }), /row counts or contents/);
  assert.throws(() => compareSnapshots(source, { ...source, sequences: [{ name: "activity_events", seq: 1 }] }), /high-water marks/);
});

test("failure receipts retain owned assertions without copying external error content", () => {
  let owned;
  try { requireCondition(false, "Restored schema differs"); } catch (error) { owned = error; }
  assert.deepEqual(failureDetails(owned), { check: "Restored schema differs" });
  for (const external of [new Error("synthetic-secret-value"), { message: "synthetic-secret-value", name: "RecoveryCheckError" }, "synthetic-secret-value"]) {
    assert.equal(JSON.stringify(failureDetails(external)).includes("synthetic-secret-value"), false);
    assert.match(failureDetails(external).check, /External operation failed/);
  }
});

test("a mismatched recovery dependency fails before a database can be created", async () => {
  const fixture = await fixtureDirectory();
  const packages = {};
  for (const name of ["wrangler", "esbuild", "miniflare"]) {
    packages[`node_modules/${name}`] = { version: "1.0.0" };
    await mkdir(join(fixture, "node_modules", name), { recursive: true });
    await writeJson(join(fixture, "node_modules", name, "package.json"), { version: "1.0.0" });
  }
  await writeJson(join(fixture, "package-lock.json"), { packages });
  assert.equal((await verifyToolchain(fixture)).miniflare, "1.0.0");
  for (const name of ["wrangler", "esbuild", "miniflare"]) {
    const path = join(fixture, "node_modules", name, "package.json");
    await writeFile(path, JSON.stringify({ version: "2.0.0" }));
    await assert.rejects(verifyToolchain(fixture), new RegExp(`Installed ${name} must match`));
    await writeFile(path, JSON.stringify({ version: "1.0.0" }));
  }
  assert.equal((await readdir(fixture)).includes("recovery-runs"), false);
});
