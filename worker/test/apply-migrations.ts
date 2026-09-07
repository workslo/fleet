import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { testAccessIssuer, testPrincipal } from "./access-fixture";

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

await env.DB.batch(["shane", "codex", "claude", "agentslo", "juniorslo"].map((actorId) => {
  const principal = testPrincipal(actorId);
  return env.DB.prepare(
    "INSERT OR IGNORE INTO actor_principals (provider, issuer, kind, subject, actor_id) VALUES ('cloudflare_access', ?, ?, ?, ?)",
  ).bind(testAccessIssuer, principal.kind, principal.subject, actorId);
}));
