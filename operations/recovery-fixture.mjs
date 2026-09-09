import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { digest, persistence, requireCondition } from "./recovery-local.mjs";

const issuer = "https://fleet-local-recovery.cloudflareaccess.com";
const audience = "fleet-local-recovery-only";
export const actors = ["shane", "codex", "juniorslo"];
const principal = (actor) => actor === "shane" ? { kind: "human", subject: "synthetic-human-shane" } : { kind: "service", subject: `${actor}-synthetic.access` };

export async function createIdentity() {
  const keys = await generateKeyPair("RS256", { extractable: true });
  const publicKey = { ...await exportJWK(keys.publicKey), alg: "RS256", kid: "local-recovery", use: "sig" };
  return {
    publicKey,
    async token(actor) {
      requireCondition(actors.includes(actor), "Unknown synthetic actor");
      const identity = principal(actor);
      const claims = identity.kind === "human" ? { sub: identity.subject, type: "app" } : { sub: "", common_name: identity.subject, type: "app" };
      return new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "local-recovery", typ: "JWT" })
        .setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime("10m").sign(keys.privateKey);
    },
  };
}

export function startWorker(context, side, identity) {
  return new Miniflare(convertV4MiniflareOptions({
    cf: false, host: "127.0.0.1", resourcePersistencePath: join(persistence(context.run, side), "v3"),
    workers: [{ name: "fleet-recovery-worker", modules: true, scriptPath: join(context.run, "worker.mjs"),
      compatibilityDate: "2026-08-31", compatibilityFlags: ["nodejs_compat"], d1Databases: { DB: context.databaseId },
      bindings: { FLEET_ACCESS_ISSUER: issuer, FLEET_ACCESS_AUDIENCE: audience, FLEET_ACCESS_JWKS_URL: `${issuer}/cdn-cgi/access/certs` },
      outboundService: (request) => request.url === `${issuer}/cdn-cgi/access/certs`
        ? Response.json({ keys: [identity.publicKey] }) : new Response("Outbound requests are disabled in the recovery rehearsal", { status: 502 }),
    }],
  }));
}

export async function enrollSyntheticActors(db) {
  for (const actor of actors) {
    const identity = principal(actor);
    await db.prepare("INSERT INTO actor_principals (provider, issuer, kind, subject, actor_id) VALUES ('cloudflare_access', ?, ?, ?, ?)")
      .bind(issuer, identity.kind, identity.subject, actor).run();
  }
}

export function apiClient(worker, identity) {
  return async (actor, path, body, version, key = randomUUID(), expectedStatus) => {
    const origin = "http://127.0.0.1";
    const headers = { "Cf-Access-Jwt-Assertion": await identity.token(actor) };
    if (body !== undefined) Object.assign(headers, { "Content-Type": "application/json", Origin: origin, "Idempotency-Key": key });
    if (version !== undefined) headers["If-Match"] = `"${version}"`;
    const response = await worker.dispatchFetch(origin + path, { method: body === undefined ? "GET" : "POST", headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    requireCondition(expectedStatus === undefined ? response.ok : response.status === expectedStatus, `Synthetic ${actor} ${path} returned unexpected status ${response.status}`);
    const text = await response.text();
    return { body: JSON.parse(text), text, status: response.status };
  };
}

export async function populateFixture(api) {
  const post = async (actor, path, body, version) => (await api(actor, path, body, version)).body;
  const project = await post("shane", "/v1/projects", { slug: "local-recovery-rehearsal", title: "Local recovery rehearsal — synthetic project", originator_id: "shane" });
  await post("shane", `/v1/projects/${project.id}/authorize`, {
    proposed_owner_id: "codex", outcome: "Verify local registry recovery", scope: ["Synthetic local D1 data"], exclusions: ["Production resources"],
    delegated_actions: ["Bounded synthetic requests"], gates: ["No deployment"], validation_evidence: ["Local recovery report"], plan: "Export, restore, compare, and resume locally.",
  }, 1);
  await post("codex", `/v1/projects/${project.id}/owner-accept`, {}, 2);

  const create = (title, projectLinked = false) => post("juniorslo", projectLinked ? `/v1/projects/${project.id}/requests` : "/v1/requests", {
    recipient_id: "codex", title, detail: "Synthetic bounded work for the local recovery rehearsal.",
    ...(projectLinked ? { expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() } : {}),
  });
  const blocked = await create("Recover an accepted blocked request", true);
  await post("codex", `/v1/requests/${blocked.id}/accept`, {}, 1);
  await post("codex", `/v1/requests/${blocked.id}/block`, { reason: "Synthetic review input is unavailable", resolution_condition: "The synthetic input is available" }, 2);
  const returned = await create("Recover a returned review");
  await post("codex", `/v1/requests/${returned.id}/accept`, {}, 1);
  const replay = {
    actor: "codex", path: `/v1/requests/${returned.id}/return`, version: 2, key: "recovery-return-original-key",
    body: { reason: "Synthetic time limit", unfinished_work: "Review the final section", evidence: [{ uri: "https://example.test/partial-review", summary: "Synthetic partial review" }] },
  };
  replay.response = await api(replay.actor, replay.path, replay.body, replay.version, replay.key);

  const fulfilled = await create("Recover fulfillment evidence", true);
  await post("codex", `/v1/requests/${fulfilled.id}/accept`, {}, 1);
  await post("codex", `/v1/requests/${fulfilled.id}/fulfill`, { evidence: [{ uri: "https://example.test/complete-review", summary: "Synthetic completed review" }] }, 2);
  const withdrawn = await create("Recover a withdrawn invitation");
  await post("juniorslo", `/v1/requests/${withdrawn.id}/withdraw`, { reason: "Synthetic invitation no longer needed" }, 1);
  const pending = await create("A pending invitation remains unowed");

  const pendingNeed = await post("codex", "/v1/decisions", { work_request_id: blocked.id, kind: "decision_and_action", question: "Approve and provide the synthetic review input", resolution_condition: "The local fixture input exists" });
  await post("shane", `/v1/decisions/${pendingNeed.id}/decide`, { choice: "approved", summary: "Approved for this synthetic local fixture" }, 1);
  const resolvedNeed = await post("codex", "/v1/decisions", { work_request_id: returned.id, kind: "action", question: "Record the synthetic handback", resolution_condition: "Handback is recorded" });
  await post("shane", `/v1/decisions/${resolvedNeed.id}/delegate-action`, { delegate_id: "codex", summary: "Record this synthetic handback only" }, 1);
  await post("codex", `/v1/decisions/${resolvedNeed.id}/complete-action`, { summary: "Synthetic handback recorded", evidence: [{ uri: "https://example.test/handback", summary: "Synthetic receipt" }] }, 2);
  await post("codex", "/v1/pull-candidates", { project_id: project.id, title: "A voluntary recovery improvement", detail: "Synthetic interest creates no obligation." });
  return { project, blocked, returned, fulfilled, withdrawn, pending, pendingNeed, resolvedNeed, replay };
}

export async function httpSnapshot(api, fixture) {
  const reads = [];
  for (const actor of actors) for (const path of ["/v1/me", "/v1/me/work?after=0"]) reads.push({ actor, path, value: (await api(actor, path)).body });
  const paths = ["/v1/portfolio", "/v1/decisions?state=all", "/v1/activity?after=0", `/v1/projects/${fixture.project.id}`,
    ...[fixture.blocked, fixture.returned, fixture.fulfilled, fixture.withdrawn, fixture.pending].map((request) => `/v1/requests/${request.id}`)];
  for (const path of paths) reads.push({ actor: "codex", path, value: (await api("codex", path)).body });
  return reads;
}

export async function verifyRestoredHttp(api, fixture, expected) {
  const restored = await httpSnapshot(api, fixture);
  requireCondition(digest(restored) === digest(expected), "Restored HTTP registry, obligations, outcomes, or history differ");
  const before = (await api("codex", "/v1/activity?after=0")).body;
  const replay = fixture.replay;
  const repeated = await api(replay.actor, replay.path, replay.body, replay.version, replay.key);
  requireCondition(repeated.status === replay.response.status && repeated.text === replay.response.text, "Restored replay changed the stored response bytes or status");
  await api("juniorslo", `/v1/requests/${fixture.blocked.id}/unblock`, { summary: "Unauthorized attempt" }, 3, "recovery-cross-seat-key", 403);
  const after = (await api("codex", "/v1/activity?after=0")).body;
  requireCondition(digest(before) === digest(after), "Replay or rejected cross-seat write created activity");
  requireCondition(digest(await httpSnapshot(api, fixture)) === digest(expected), "Replay or rejected write changed restored API state");
  return { http_reads_compared: restored.length, http_sha256: digest(restored), replay_bytes_preserved: true, cross_seat_rejected: true, cursor: before.next_cursor };
}

export async function advanceRestoredWork(api, fixture, cursor) {
  const changed = (await api("codex", `/v1/requests/${fixture.blocked.id}/unblock`, { summary: "Synthetic input is available after restore" }, 3, "recovery-post-restore-key")).body;
  requireCondition(changed.state === "Accepted" && changed.blocker === null && changed.version === 4, "Post-restore unblock did not retain the accepted obligation");
  const changes = (await api("codex", `/v1/activity?after=${cursor}`)).body;
  requireCondition(changes.activity.length === 1 && changes.activity[0].id > Number(cursor) && Number(changes.next_cursor) > Number(cursor), "Post-restore event did not advance the restored cursor exactly once");
  const caughtUp = (await api("codex", `/v1/me/work?after=${changes.next_cursor}`)).body;
  requireCondition(caughtUp.activity.length === 0 && caughtUp.obligations.some((item) => item.request_id === fixture.blocked.id), "Post-restore reconciliation lost the owed work or repeated activity");
  return { previous_cursor: cursor, next_cursor: changes.next_cursor, new_activity_events: 1, accepted_obligation_retained: true };
}
