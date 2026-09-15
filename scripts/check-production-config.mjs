import { experimental_readRawConfig } from "wrangler";

const expected = {
  audience: "bb6bfbf478f4650dd587009161459616cece8ecb032d5dd0a6e7090ad21fa2fb",
  databaseId: "7132d7a7-6b2b-4caf-8986-f91c2c3292dd",
  databaseName: "fleet-state",
  hostname: "fleet.workslo.ai",
  issuer: "https://workslo.cloudflareaccess.com",
  runWorkerFirst: ["/health", "/v1/*"],
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const { configPath, rawConfig } = experimental_readRawConfig({ config: "wrangler.jsonc" });
const variables = rawConfig.vars ?? {};
const jwksUrl = `${expected.issuer}/cdn-cgi/access/certs`;
const canonicalRoutes = (rawConfig.routes ?? []).filter(
  (route) => typeof route === "object"
    && route.pattern === expected.hostname
    && route.custom_domain === true,
);
const fleetDatabases = (rawConfig.d1_databases ?? []).filter(
  (database) => database.binding === "DB"
    && database.database_name === expected.databaseName
    && database.database_id === expected.databaseId,
);

assert(rawConfig.name === "fleet", "wrangler.jsonc must name the Fleet Worker");
assert(rawConfig.workers_dev === false, "wrangler.jsonc must disable workers.dev");
assert(rawConfig.preview_urls === false, "wrangler.jsonc must disable preview URLs");
assert(
  JSON.stringify(rawConfig.assets?.run_worker_first) === JSON.stringify(expected.runWorkerFirst),
  "wrangler.jsonc must route /health and /v1/* through the Worker before static assets",
);
assert(variables.FLEET_ACCESS_ISSUER === expected.issuer, "wrangler.jsonc must use the approved Fleet Access issuer");
assert(variables.FLEET_ACCESS_AUDIENCE === expected.audience, "wrangler.jsonc must use the approved Fleet Access audience");
assert(variables.FLEET_ACCESS_JWKS_URL === jwksUrl, "wrangler.jsonc must derive the Fleet Access JWKS URL from its issuer");
assert(canonicalRoutes.length === 1, "wrangler.jsonc must configure one canonical Fleet custom-domain route");
assert(fleetDatabases.length === 1, "wrangler.jsonc must bind DB to the approved fleet-state database");

console.log(`Fleet production configuration is valid (${configPath})`);
