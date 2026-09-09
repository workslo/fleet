import { enforceSameOriginMutation, resolveCaller } from "./auth";
import { error, isResponse, json } from "./http";
import { createDecision, getDecision, listDecisions, transitionDecision } from "./decisions";
import { acceptOwnership, authorizeProject, createProject, getProject, portfolio } from "./projects";
import { transitionRequest, activity, createPullCandidate, createRequest, getRequest, myWork } from "./work";
import type { Env } from "./types";

function decodeRouteId(value: string): string | Response {
  try {
    return decodeURIComponent(value);
  } catch {
    return error("invalid_request", "route id has invalid percent encoding", 400);
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ service: "fleet", status: "ok" });
    }

    const caller = await resolveCaller(request, env);
    if (isResponse(caller)) return caller;
    const originFailure = enforceSameOriginMutation(request, caller);
    if (originFailure) return originFailure;
    if (request.method === "GET" && url.pathname === "/v1/me") {
      return json({
        actor: { id: caller.id, display_name: caller.display_name },
        principal: caller.principal,
      });
    }
    if (request.method === "GET" && url.pathname === "/v1/portfolio") return portfolio(env);
    if (request.method === "GET" && url.pathname === "/v1/me/work") return myWork(env, caller, url.searchParams.get("after"));
    if (request.method === "GET" && url.pathname === "/v1/activity") return activity(env, url.searchParams.get("after"));
    if (request.method === "GET" && url.pathname === "/v1/decisions") return listDecisions(env, url.searchParams.get("state"));
    if (request.method === "POST" && url.pathname === "/v1/decisions") return createDecision(request, env, caller);
    if (request.method === "POST" && url.pathname === "/v1/projects") return createProject(request, env, caller);
    if (request.method === "POST" && url.pathname === "/v1/requests") return createRequest(request, env, caller);
    if (request.method === "POST" && url.pathname === "/v1/pull-candidates") return createPullCandidate(request, env, caller);

    const decisionMatch = url.pathname.match(/^\/v1\/decisions\/([^/]+)(?:\/(decide|complete-action|delegate-action))?$/);
    if (decisionMatch) {
      const decisionId = decodeRouteId(decisionMatch[1] ?? "");
      if (isResponse(decisionId)) return decisionId;
      if (request.method === "GET" && !decisionMatch[2]) return getDecision(env, decisionId);
      const action = decisionMatch[2];
      if (request.method === "POST" && (action === "decide" || action === "complete-action" || action === "delegate-action")) {
        return transitionDecision(request, env, caller, decisionId, action);
      }
      return error("not_found", "route does not exist", 404);
    }

    const requestMatch = url.pathname.match(/^\/v1\/requests\/([^/]+)(?:\/(accept|fulfill|decline|withdraw|return|expire|block|unblock))?$/);
    if (requestMatch) {
      const requestId = decodeRouteId(requestMatch[1] ?? "");
      if (isResponse(requestId)) return requestId;
      if (request.method === "GET" && !requestMatch[2]) return getRequest(env, requestId);
      if (request.method === "POST" && requestMatch[2]) {
        const action = requestMatch[2] as "accept" | "fulfill" | "decline" | "withdraw" | "return" | "expire" | "block" | "unblock";
        return transitionRequest(request, env, caller, requestId, action);
      }
      return error("not_found", "route does not exist", 404);
    }

    const match = url.pathname.match(/^\/v1\/projects\/([^/]+)(?:\/(authorize|owner-accept|requests))?$/);
    if (!match) return error("not_found", "route does not exist", 404);
    const idSegment = match[1];
    if (!idSegment) return error("not_found", "route does not exist", 404);
    const projectId = decodeRouteId(idSegment);
    if (isResponse(projectId)) return projectId;
    const action = match[2];
    if (request.method === "GET" && !action) return getProject(env, projectId);
    if (request.method === "POST" && action === "authorize") return authorizeProject(request, env, caller, projectId);
    if (request.method === "POST" && action === "owner-accept") return acceptOwnership(request, env, caller, projectId);
    if (request.method === "POST" && action === "requests") return createRequest(request, env, caller, projectId);
    return error("not_found", "route does not exist", 404);
  },
} satisfies ExportedHandler<Env>;
