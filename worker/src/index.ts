import { resolveCaller } from "./auth";
import { error, isResponse, json } from "./http";
import { acceptOwnership, authorizeProject, createProject, getProject, portfolio } from "./projects";
import type { Env } from "./types";

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ service: "fleet", status: "ok" });
    }

    const caller = await resolveCaller(request, env);
    if (isResponse(caller)) return caller;
    if (request.method === "GET" && url.pathname === "/v1/portfolio") return portfolio(env);
    if (request.method === "POST" && url.pathname === "/v1/projects") return createProject(request, env, caller);

    const match = url.pathname.match(/^\/v1\/projects\/([^/]+)(?:\/(authorize|owner-accept))?$/);
    if (!match) return error("not_found", "route does not exist", 404);
    const idSegment = match[1];
    if (!idSegment) return error("not_found", "route does not exist", 404);
    const projectId = decodeURIComponent(idSegment);
    const action = match[2];
    if (request.method === "GET" && !action) return getProject(env, projectId);
    if (request.method === "POST" && action === "authorize") return authorizeProject(request, env, caller, projectId);
    if (request.method === "POST" && action === "owner-accept") return acceptOwnership(request, env, caller, projectId);
    return error("not_found", "route does not exist", 404);
  },
} satisfies ExportedHandler<Env>;
