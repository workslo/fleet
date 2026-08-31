import { error } from "./http";
import type { Actor, Env } from "./types";

export async function resolveCaller(request: Request, env: Env): Promise<Actor | Response> {
  const forceProduction = request.headers.get("X-Fleet-Auth-Mode") === "production";
  if (env.FLEET_AUTH_MODE !== "test" || forceProduction) {
    return error("auth_unavailable", "production authentication is not configured", 503);
  }

  const subject = request.headers.get("X-Fleet-Principal");
  if (!subject) {
    return error("unauthorized", "X-Fleet-Principal is required in test mode", 401);
  }

  const actor = await env.DB.prepare(
    `SELECT actors.id, actors.display_name
       FROM actor_principals
       JOIN actors ON actors.id = actor_principals.actor_id
      WHERE actor_principals.provider = 'test'
        AND actor_principals.subject = ?
        AND actor_principals.active = 1
        AND actors.active = 1`,
  )
    .bind(subject)
    .first<Actor>();

  return actor ?? error("unauthorized", "principal is not an active Fleet actor", 401);
}
