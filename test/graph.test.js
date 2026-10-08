import test from "node:test";
import assert from "node:assert/strict";

import {
  adjacencyMatrix,
  analyzeGraph,
  connectedComponents,
  dijkstra,
  formatWeight,
  GraphInputError,
  minimumSpanningTree,
  parseGraph,
} from "../src/graph.js";
import { springLayout } from "../src/layout.js";

const SAMPLE = "A B 4\nA C 2\nB C 1\nB D 5\nC D 8\nC E 10\nD E 2\nD F 6\nE F 3";

test("weights print without a trailing .0", () => {
  assert.equal(formatWeight(5), "5");
  assert.equal(formatWeight(2.5), "2.5");
  assert.equal(formatWeight(1 / 3), "0.3333");
});

test("the edge list is parsed into an undirected weighted graph", () => {
  const { nodes, edges, warnings } = parseGraph(SAMPLE);
  assert.deepEqual([...nodes].sort(), ["A", "B", "C", "D", "E", "F"]);
  assert.equal(edges.length, 9);
  assert.deepEqual(warnings, []);
});

test("blank lines and # comments are ignored", () => {
  const { edges } = parseGraph("# a comment\n\nA B 1\n   \nB C 2\n");
  assert.equal(edges.length, 2);
});

test("malformed lines are reported with their line number", () => {
  assert.throws(() => parseGraph("A B x"), /Line 1: weight 'x' is not a valid finite number/);
  assert.throws(() => parseGraph("A B"), /Line 1: expected 'Source Target Weight'/);
  assert.throws(() => parseGraph("A B 1 2"), /Line 1/);
  assert.throws(() => parseGraph(""), /No edges found/);
  assert.throws(() => parseGraph("# only a comment"), GraphInputError);
});

test("self-loops are dropped and duplicate edges keep the smaller weight", () => {
  const { edges, warnings } = parseGraph("A A 3\nA B 7\nB A 2");
  assert.equal(edges.length, 1);
  assert.equal(edges[0].weight, 2);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /self-loop/);
  assert.match(warnings[1], /duplicate edge/);
});

test("Dijkstra finds the cheapest route, not the shortest hop count", () => {
  const { nodes, edges } = parseGraph(SAMPLE);
  const result = dijkstra(nodes, edges, "A", "F");
  assert.equal(result.ok, true);
  assert.equal(result.cost, 13);
  assert.deepEqual(result.path, ["A", "C", "B", "D", "E", "F"]);
});

test("Dijkstra handles trivial and unreachable targets", () => {
  const { nodes, edges } = parseGraph(SAMPLE);
  const same = dijkstra(nodes, edges, "A", "A");
  assert.equal(same.cost, 0);
  assert.deepEqual(same.path, ["A"]);

  const split = parseGraph("A B 1\nC D 2");
  const none = dijkstra(split.nodes, split.edges, "A", "D");
  assert.equal(none.ok, false);
  assert.match(none.reason, /different connected components/);
});

test("Kruskal returns a spanning tree of minimum total weight", () => {
  const { nodes, edges } = parseGraph(SAMPLE);
  const mst = minimumSpanningTree(nodes, edges);
  assert.equal(mst.total, 13);
  assert.equal(mst.edges.length, nodes.length - 1);
  // No edge heavier than the alternatives it replaced: 8 and 10 must be excluded.
  assert.equal(mst.edges.some((e) => e.weight === 8 || e.weight === 10), false);
});

test("Kruskal produces a forest when the graph is disconnected", () => {
  const { nodes, edges } = parseGraph("A B 1\nC D 2");
  const mst = minimumSpanningTree(nodes, edges);
  assert.equal(mst.total, 3);
  assert.equal(mst.edges.length, 2);
  assert.equal(connectedComponents(nodes, edges), 2);
});

test("a triangle graph keeps the two lightest edges", () => {
  const { nodes, edges } = parseGraph("A B 1\nB C 2\nA C 3");
  const mst = minimumSpanningTree(nodes, edges);
  assert.equal(mst.total, 3);
  assert.deepEqual(mst.edges.map((e) => e.weight).sort(), [1, 2]);
});

test("the adjacency matrix is symmetric, with ∞ for absent edges and 1 for present edges", () => {
  const nodes = ["A", "B", "C"];
  const { edges } = parseGraph("A B 4\nB C 5");
  const m = adjacencyMatrix(nodes, edges);
  assert.deepEqual(m, [["∞", 1, "∞"], [1, "∞", 1], ["∞", 1, "∞"]]);
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) assert.equal(m[i][j], m[j][i]);
  }
});

test("the layout is deterministic and inside the unit square", () => {
  const { nodes, edges } = parseGraph(SAMPLE);
  const pairs = edges.map((e) => [e.u, e.v]);
  const first = springLayout(nodes, pairs);
  const second = springLayout(nodes, pairs);
  assert.deepEqual(first, second);
  for (const name of nodes) {
    assert.ok(first[name].x >= 0 && first[name].x <= 1, `x of ${name}`);
    assert.ok(first[name].y >= 0 && first[name].y <= 1, `y of ${name}`);
  }
  assert.deepEqual(springLayout(["A"], []), { A: { x: 0.5, y: 0.5 } });
});
