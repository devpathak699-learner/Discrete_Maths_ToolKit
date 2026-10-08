/**
 * End-to-end tests: start the real server on an ephemeral port and exercise
 * every endpoint, mirroring the scenarios covered by test_app.py.
 */
import test, { after, before } from "node:test";
import assert from "node:assert/strict";

import { createServer } from "../server.js";

let server;
let base;

before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server?.close());

async function post(route, payload) {
  const response = await fetch(base + route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: response.status, body: await response.json() };
}

test("the page and its assets are served", async () => {
  for (const [path, type] of [
    ["/", "text/html"],
    ["/styles.css", "text/css"],
    ["/app.js", "text/javascript"],
  ]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type"), new RegExp(type), path);
  }
});

test("unknown paths give 404", async () => {
  assert.equal((await fetch(`${base}/nope.html`)).status, 404);
});

test("directory traversal never serves a file from outside public/", async () => {
  const attempts = [
    "/../package.json",
    "/..%2fserver.js",
    "/%2e%2e%2fserver.js",
    "/public/../server.js",
    "/src/logic.js",
  ];
  for (const target of attempts) {
    const response = await fetch(base + target);
    assert.ok([403, 404].includes(response.status), `${target} returned ${response.status}`);
    const text = await response.text();
    assert.doesNotMatch(text, /createServer|discrete-math-toolkit|LogicParser/, target);
  }
});

test("POST /api/logic: default pair is equivalent", async () => {
  const { status, body } = await post("/api/logic", { expr1: "p -> q", expr2: "~p | q" });
  assert.equal(status, 200);
  assert.equal(body.equivalent, true);
  assert.equal(body.rows.length, 4);
  assert.equal(body.rows.every((r) => r.match), true);
});

test("POST /api/logic: non-equivalent pair returns a counter-example", async () => {
  const { body } = await post("/api/logic", { expr1: "p -> q", expr2: "p & q" });
  assert.equal(body.equivalent, false);
  assert.ok(body.counterExample);
});

test("POST /api/logic: bad syntax and bad characters give 400, never 500", async () => {
  for (const expr1 of ["p & & (q", "p $ q", "(p", ""]) {
    const { status, body } = await post("/api/logic", { expr1, expr2: "q" });
    assert.equal(status, 400, expr1);
    assert.equal(body.kind, "input", expr1);
    assert.ok(body.error.length > 0);
  }
});

test("POST /api/relation: equivalence relation and POSET are identified", async () => {
  const equivalence = await post("/api/relation", {
    domain: "1, 2, 3, 4",
    pairs: "(1,1), (2,2), (3,3), (4,4), (1,2), (2,1)",
  });
  assert.equal(equivalence.body.isEquivalence, true);
  assert.deepEqual(equivalence.body.equivalenceClasses, [["1", "2"], ["3"], ["4"]]);

  const poset = await post("/api/relation", {
    domain: "1, 2, 3, 4",
    pairs: "(1,1),(2,2),(3,3),(4,4),(1,2),(1,3),(2,3)",
  });
  assert.equal(poset.body.isPoset, true);
  assert.equal(poset.body.isEquivalence, false);
});

test("POST /api/relation: bad input gives 400", async () => {
  for (const payload of [
    { domain: "1,2,3", pairs: "(1,9)" },
    { domain: "1,2,3", pairs: "hello" },
    { domain: "", pairs: "(1,1)" },
  ]) {
    const { status, body } = await post("/api/relation", payload);
    assert.equal(status, 400, JSON.stringify(payload));
    assert.equal(body.kind, "input");
  }
});

test("POST /api/graph: the default graph yields a path, an MST and a layout", async () => {
  const { body } = await post("/api/graph", {
    edges: "A B 4\nA C 2\nB C 1\nB D 5\nC D 8\nC E 10\nD E 2\nD F 6\nE F 3",
    start: "A",
    end: "F",
  });
  assert.deepEqual(body.nodes, ["A", "B", "C", "D", "E", "F"]);
  assert.equal(body.connected, true);
  assert.equal(body.shortestPath.ok, true);
  assert.equal(body.shortestPath.costLabel, "13");
  assert.equal(body.shortestPath.steps.length, 5);
  assert.equal(body.mst.totalLabel, "13");
  assert.equal(Object.keys(body.layout).length, 6);
  assert.equal(body.adjacency.length, 6);
});

test("POST /api/graph: disconnected graphs report no path and a forest", async () => {
  const { body } = await post("/api/graph", { edges: "A B 1\nC D 2", start: "A", end: "D" });
  assert.equal(body.connected, false);
  assert.equal(body.componentCount, 2);
  assert.equal(body.shortestPath.ok, false);
  assert.equal(body.mst.isForest, true);
});

test("POST /api/graph: negative weights disable Dijkstra but keep the MST", async () => {
  const { body } = await post("/api/graph", { edges: "A B -1\nB C 2", start: "A", end: "C" });
  assert.equal(body.hasNegative, true);
  assert.equal(body.shortestPath.ok, false);
  assert.match(body.shortestPath.reason, /non-negative/);
  assert.equal(body.mst.edges.length, 2);
});

test("POST /api/graph: warnings travel to the client", async () => {
  const { body } = await post("/api/graph", { edges: "A A 1\nA B 2\nB A 5", start: "A", end: "B" });
  assert.equal(body.warnings.length, 2);
});

test("POST /api/graph: bad input gives 400", async () => {
  for (const edges of ["A B x", "", "A B"]) {
    const { status, body } = await post("/api/graph", { edges });
    assert.equal(status, 400, edges);
    assert.equal(body.kind, "input");
  }
});

test("GET on an API route is rejected and malformed JSON gives 400", async () => {
  assert.equal((await fetch(`${base}/api/logic`)).status, 405);
  const response = await fetch(`${base}/api/logic`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not json",
  });
  assert.equal(response.status, 400);
});
