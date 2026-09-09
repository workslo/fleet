import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { actors } from "./recovery-fixture.mjs";

function banner(actor) {
  return `<aside style="padding:14px;background:#fff0b3;color:#241c00;font:16px system-ui"><strong>Local recovery rehearsal — synthetic data</strong><br>Viewing as ${actor}. Synthetic identities; actual local Worker and restored D1. Switch seat: ${actors.map((seat) => `<a href="/?seat=${seat}">${seat}</a>`).join(" · ")}</aside>`;
}

export async function servePreview(context, worker, identity) {
  const assets = await realpath(join(context.root, "dist/client"));
  let origin;
  const server = createServer(async (request, response) => {
    try {
      if (request.headers.host !== new URL(origin).host) { response.writeHead(403); response.end(); return; }
      const url = new URL(request.url, origin);
      const selected = url.searchParams.get("seat");
      const cookieActor = request.headers.cookie?.match(/(?:^|;\s*)fleet_recovery_seat=(shane|codex|juniorslo)(?:;|$)/)?.[1];
      const actor = actors.includes(selected) ? selected : cookieActor ?? "codex";
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("X-Content-Type-Options", "nosniff");
      if (url.pathname === "/" && actors.includes(selected)) response.setHeader("Set-Cookie", `fleet_recovery_seat=${actor}; HttpOnly; SameSite=Strict; Path=/`);
      if (url.pathname.startsWith("/v1/")) {
        if (!["GET", "HEAD"].includes(request.method) && request.headers.origin !== origin) { response.writeHead(403); response.end(); return; }
        const chunks = [];
        let length = 0;
        for await (const chunk of request) {
          length += chunk.length;
          if (length > 64 * 1024) { response.writeHead(413); response.end(); return; }
          chunks.push(chunk);
        }
        const body = Buffer.concat(chunks);
        const headers = new Headers({ "Cf-Access-Jwt-Assertion": await identity.token(actor) });
        for (const name of ["content-type", "origin", "idempotency-key", "if-match"]) {
          if (typeof request.headers[name] === "string") headers.set(name, request.headers[name]);
        }
        const result = await worker.dispatchFetch(origin + url.pathname + url.search, { method: request.method, headers, ...(body.length ? { body } : {}) });
        response.writeHead(result.status, Object.fromEntries(result.headers));
        response.end(Buffer.from(await result.arrayBuffer()));
        return;
      }
      if (request.method !== "GET" && request.method !== "HEAD") { response.writeHead(405); response.end(); return; }
      const target = resolve(assets, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).slice(1));
      const realTarget = await realpath(target);
      if (!realTarget.startsWith(assets + "/")) { response.writeHead(403); response.end(); return; }
      let contents = await readFile(realTarget);
      if (realTarget === join(assets, "index.html")) contents = Buffer.from(contents.toString().replace("<body>", `<body>${banner(actor)}`));
      response.writeHead(200, { "Content-Type": { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" }[extname(realTarget)] ?? "application/octet-stream" });
      response.end(contents);
    } catch {
      response.writeHead(404);
      response.end("Local recovery preview resource unavailable");
    }
  });
  await new Promise((resolveReady, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      origin = `http://127.0.0.1:${server.address().port}`;
      resolveReady();
    });
  });
  return { origin, close: () => new Promise((resolveClosed) => { server.closeAllConnections(); server.close(resolveClosed); }) };
}
