export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export function error(error: string, message: string, status: number): Response {
  return json({ error, message }, status);
}

export async function requestJson(request: Request): Promise<unknown | Response> {
  try {
    return await request.json();
  } catch {
    return error("invalid_request", "request body must be valid JSON", 400);
  }
}

export function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}
