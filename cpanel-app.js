import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import worker from "./dist/server/index.js";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(projectRoot, "dist", "client");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function staticAssetFetcher() {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      const requested = path.resolve(publicRoot, `.${url.pathname}`);
      if (requested !== publicRoot && !requested.startsWith(`${publicRoot}${path.sep}`)) {
        return new Response("Not found", { status: 404 });
      }
      try {
        const body = await readFile(requested);
        return new Response(body, {
          headers: { "content-type": contentTypes[path.extname(requested)] ?? "application/octet-stream" },
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    },
  };
}

const server = http.createServer(async (incoming, outgoing) => {
  try {
    const host = incoming.headers.host ?? "localhost";
    const request = new Request(`http://${host}${incoming.url ?? "/"}`, {
      method: incoming.method ?? "GET",
      headers: incoming.headers,
    });
    const response = await worker.fetch(
      request,
      { ASSETS: staticAssetFetcher() },
      { waitUntil() {}, passThroughOnException() {} },
    );
    outgoing.statusCode = response.status;
    response.headers.forEach((value, key) => outgoing.setHeader(key, value));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    outgoing.statusCode = 500;
    outgoing.end("Internal Server Error");
  }
});

server.listen(Number(process.env.PORT ?? 3000), "0.0.0.0");
