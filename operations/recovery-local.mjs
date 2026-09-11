import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

class RecoveryCheckError extends Error {}

export function requireCondition(condition, message) {
  if (!condition) throw new RecoveryCheckError(message);
}

export function failureDetails(error) {
  // Only runner-authored assertions may enter the receipt; external errors can contain secrets.
  return error instanceof RecoveryCheckError ? { check: error.message } : { check: "External operation failed; inspect local diagnostics" };
}

export function parseArguments(args) {
  requireCondition(args.length === 0 || (args.length === 1 && args[0] === "--serve"), "Usage: node operations/rehearse-recovery.mjs [--serve]; remote targets and custom paths are not supported");
  return { serve: args[0] === "--serve" };
}

export function canonical(value) {
  if (typeof value === "bigint") return { integer: value.toString() };
  if (value instanceof Uint8Array) return { blob: Buffer.from(value).toString("base64") };
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

export function digest(value) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export async function writeJson(path, value) {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}

export async function createRun(root) {
  root = await realpath(root);
  const parent = join(root, "recovery-runs");
  try { await mkdir(parent, { mode: 0o700 }); } catch (error) { if (error.code !== "EEXIST") throw error; }
  const stat = await lstat(parent);
  requireCondition(stat.isDirectory() && !stat.isSymbolicLink() && await realpath(parent) === parent, "recovery-runs must be a real directory directly inside the repository");
  const run = await mkdtemp(join(parent, new Date().toISOString().replaceAll(":", "-") + "-"));
  const databaseId = randomUUID();
  for (const name of ["source", "destination", "logs", "config-home", "cache-home"]) await mkdir(join(run, name), { mode: 0o700 });
  const config = {
    name: "fleet-recovery-local", compatibility_date: "2026-08-31", workers_dev: false, preview_urls: false,
    d1_databases: [{ binding: "DB", database_name: "fleet-recovery-local", database_id: databaseId, migrations_dir: join(root, "worker/migrations") }],
  };
  for (const name of ["source", "destination"]) await writeJson(join(run, name, "wrangler.json"), config);
  return { root, run, databaseId };
}

export function childEnvironment(run) {
  return {
    PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, CI: "true", LANG: "C.UTF-8",
    XDG_CONFIG_HOME: join(run, "config-home"), XDG_CACHE_HOME: join(run, "cache-home"),
    WRANGLER_SEND_METRICS: "false", WRANGLER_LOG_PATH: join(run, "logs/wrangler.log"),
    CLOUDFLARE_CF_FETCH_ENABLED: "false", CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
  };
}

export function persistence(run, side) {
  requireCondition(side === "source" || side === "destination", "Unknown local database side");
  // Wrangler export has no --persist-to flag: use its config-relative default.
  return join(run, side, ".wrangler/state");
}

export async function runWrangler(context, side, operation) {
  const config = join(context.run, side, "wrangler.json");
  const common = ["DB", "--local", "--config", config];
  const output = join(context.run, "export.sql");
  const commands = {
    migrate: ["d1", "migrations", "apply", ...common, "--persist-to", persistence(context.run, side)],
    export: ["d1", "export", ...common, "--output", output],
    restore: ["d1", "execute", ...common, "--persist-to", persistence(context.run, side), "--file", output],
  };
  requireCondition(Object.hasOwn(commands, operation), "Unknown local recovery operation");
  requireCondition((operation === "restore") === (side === "destination"), "Recovery operation targets the wrong local database");
  const args = commands[operation];
  const code = await new Promise((resolveStatus, reject) => {
    const child = spawn(process.execPath, [join(context.root, "node_modules/wrangler/bin/wrangler.js"), ...args], {
      cwd: join(context.run, side), env: childEnvironment(context.run), stdio: ["ignore", "ignore", "ignore"],
    });
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`Local Wrangler ${operation} timed out`)); }, 60_000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (status) => { clearTimeout(timer); resolveStatus(status); });
  });
  requireCondition(code === 0, `Local Wrangler ${operation} failed; inspect this run's local logs`);
  if (operation === "export") requireCondition((await readFile(output)).length > 0, "Wrangler produced an empty export");
  return { operation, side, command: ["node", "node_modules/wrangler/bin/wrangler.js", ...args], exit_code: code };
}

export async function verifyToolchain(root) {
  requireCondition(Number(process.versions.node.split(".")[0]) >= 24, "Node.js 24 or newer is required");
  const lock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8"));
  const versions = { node: process.versions.node };
  for (const name of ["wrangler", "esbuild", "miniflare"]) {
    const installed = JSON.parse(await readFile(join(root, "node_modules", name, "package.json"), "utf8"));
    requireCondition(installed.version === lock.packages[`node_modules/${name}`]?.version, `Installed ${name} must match package-lock.json; run npm ci`);
    versions[name] = installed.version;
  }
  return versions;
}
