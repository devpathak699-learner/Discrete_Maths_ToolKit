/**
 * Discrete Math Toolkit -- local web server
 * ==============================================================
 * A dependency-free HTTP server (Node's built-in modules only) that serves the
 * browser UI from public/ and exposes three JSON endpoints:
 *
 *   POST /api/logic     { expr1, expr2 }        -> truth table + equivalence
 *   POST /api/relation  { domain, pairs }       -> properties + classification
 *   POST /api/graph     { edges, start, end }   -> Dijkstra + MST + layout
 *
 * Start with:  npm start        (or: node server.js)
 * Options:     PORT=4000 npm start        choose a port
 *              node server.js --open      open the browser automatically
 */

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { analyzeLogic, LogicParseError } from "./src/logic.js";
import { analyzeRelation, RelationInputError } from "./src/relations.js";
import { analyzeGraph, GraphInputError } from "./src/graph.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, "public");
const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const MAX_BODY_BYTES = 256 * 1024;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

/** Input errors our modules raise deliberately; these become HTTP 400, not 500. */
const INPUT_ERRORS = [LogicParseError, RelationInputError, GraphInputError];

const API_ROUTES = {
  "/api/logic": analyzeLogic,
  "/api/relation": analyzeRelation,
  "/api/graph": analyzeGraph,
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

/** Collect a request body, refusing anything unreasonably large. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleApi(req, res, route) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Use POST for this endpoint." });
    return;
  }

  let payload;
  try {
    const raw = await readBody(req);
    payload = raw.trim() === "" ? {} : JSON.parse(raw);
  } catch (err) {
    sendJson(res, 400, { error: `Could not read request body: ${err.message}` });
    return;
  }

  try {
    sendJson(res, 200, API_ROUTES[route](payload));
  } catch (err) {
    const expected = INPUT_ERRORS.some((E) => err instanceof E);
    if (!expected) console.error(`[${route}]`, err);
    sendJson(res, expected ? 400 : 500, {
      error: expected ? err.message : `Unexpected server error: ${err.message}`,
      kind: expected ? "input" : "internal",
    });
  }
}

/** Serve a file from public/, rejecting any path that escapes the directory. */
async function serveStatic(req, res, urlPath) {
  const relative = urlPath === "/" ? "index.html" : decodeURIComponent(urlPath).replace(/^\/+/, "");
  const target = path.resolve(PUBLIC_DIR, relative);
  if (target !== PUBLIC_DIR && !target.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(target);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(target).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": data.length,
      "Cache-Control": "no-cache",
    });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 Not Found");
  }
}

export function createServer() {
  return http.createServer((req, res) => {
    const urlPath = new URL(req.url, "http://localhost").pathname;
    if (Object.hasOwn(API_ROUTES, urlPath)) {
      handleApi(req, res, urlPath).catch((err) => {
        console.error(err);
        sendJson(res, 500, { error: "Unexpected server error." });
      });
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Method Not Allowed");
      return;
    }
    serveStatic(req, res, urlPath);
  });
}

/**
 * Listen on `port`, stepping to the next free port if it is already taken,
 * so a stale server never blocks a fresh start.
 */
export function listen(port = DEFAULT_PORT, attemptsLeft = 10) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE" && attemptsLeft > 0) {
        console.log(`Port ${port} is busy, trying ${port + 1}...`);
        listen(port + 1, attemptsLeft - 1).then(resolve, reject);
      } else {
        reject(err);
      }
    });
    server.listen(port, () => resolve(server));
  });
}

/** Open the given URL in the user's default browser. */
function openBrowser(url) {
  const command =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : process.platform === "darwin" ? ["open", [url]]
    : ["xdg-open", [url]];
  try {
    spawn(command[0], command[1], { stdio: "ignore", detached: true }).unref();
  } catch {
    /* Opening a browser is a convenience; never fail the server over it. */
  }
}

// Start only when run directly (`node server.js`), not when imported by tests.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await listen(DEFAULT_PORT);
  const { port } = server.address();
  const url = `http://localhost:${port}`;
  console.log("");
  console.log("  Discrete Math Toolkit is running");
  console.log(`  ->  ${url}`);
  console.log("");
  console.log("  Press Ctrl+C to stop.");
  if (process.argv.includes("--open")) openBrowser(url);
}
