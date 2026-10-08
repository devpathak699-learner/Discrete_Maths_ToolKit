/**
 * MODULE 3 -- GRAPH THEORY
 * ==============================================================
 * Parses an edge list into an undirected weighted graph and runs:
 *
 *   Dijkstra's algorithm  -- repeatedly settle the unvisited vertex with the
 *                            smallest known distance and relax its neighbours.
 *                            Correct only for non-negative weights.
 *   Kruskal's algorithm   -- sort edges by weight and add each one unless it
 *                            would close a cycle (tested with union-find),
 *                            yielding a minimum spanning tree/forest.
 *
 * Also exposes the weighted adjacency matrix, which is symmetric because the
 * graph is undirected.
 */

import { springLayout } from "./layout.js";

export class GraphInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "GraphInputError";
  }
}

/** Whole-number weights print without a trailing .0; others to 4 significant digits. */
export function formatWeight(w) {
  if (Number.isInteger(w)) return String(w);
  return String(Number(w.toPrecision(4)));
}

/**
 * Parse lines of 'Source Target Weight' into an undirected weighted graph.
 * Blank lines and lines starting with '#' are ignored.
 * Returns { nodes, edges, warnings }; throws GraphInputError on bad input.
 */
export function parseGraph(text) {
  const errors = [];
  const warnings = [];
  const edges = [];
  const edgeIndex = new Map(); // canonical pair key -> position in `edges`
  const nodes = [];
  const nodeSeen = new Set();

  const addNode = (name) => {
    if (nodeSeen.has(name)) return;
    nodeSeen.add(name);
    nodes.push(name);
  };
  const edgeKey = (u, v) => JSON.stringify([u, v].sort());

  String(text ?? "")
    .split(/\r?\n/)
    .forEach((raw, i) => {
      const lineNo = i + 1;
      const line = raw.trim();
      if (line === "" || line.startsWith("#")) return;

      const parts = line.split(/\s+/);
      if (parts.length !== 3) {
        errors.push(`Line ${lineNo}: expected 'Source Target Weight' but got '${line}'.`);
        return;
      }

      const [u, v, weightText] = parts;
      const w = Number(weightText);
      if (!Number.isFinite(w)) {
        errors.push(`Line ${lineNo}: weight '${weightText}' is not a valid finite number.`);
        return;
      }
      if (u === v) {
        warnings.push(
          `Line ${lineNo}: self-loop ${u}-${v} ignored (it never helps a shortest path or MST).`
        );
        return;
      }

      const existing = edgeIndex.get(edgeKey(u, v));
      if (existing !== undefined) {
        if (w < edges[existing].weight) edges[existing].weight = w;
        warnings.push(`Line ${lineNo}: duplicate edge ${u}-${v}; keeping the smaller weight.`);
        return;
      }

      addNode(u);
      addNode(v);
      edgeIndex.set(edgeKey(u, v), edges.length);
      edges.push({ u, v, weight: w });
    });

  if (errors.length > 0) throw new GraphInputError(errors.join("\n"));
  if (edges.length === 0) {
    throw new GraphInputError("No edges found. Enter at least one line such as 'A B 5'.");
  }

  return { nodes, edges, warnings };
}

/** Adjacency list: node -> [{ to, weight }]. */
function adjacencyList(nodes, edges) {
  const adj = new Map(nodes.map((n) => [n, []]));
  for (const { u, v, weight } of edges) {
    adj.get(u).push({ to: v, weight });
    adj.get(v).push({ to: u, weight });
  }
  return adj;
}

/** Minimal binary min-heap keyed by distance, the priority queue for Dijkstra. */
class MinHeap {
  constructor() {
    this.items = [];
  }
  get size() {
    return this.items.length;
  }
  push(item) {
    this.items.push(item);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].dist <= this.items[i].dist) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }
  pop() {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let small = i;
        if (left < this.items.length && this.items[left].dist < this.items[small].dist) small = left;
        if (right < this.items.length && this.items[right].dist < this.items[small].dist) small = right;
        if (small === i) break;
        [this.items[small], this.items[i]] = [this.items[i], this.items[small]];
        i = small;
      }
    }
    return top;
  }
}

/**
 * Dijkstra's shortest path. Returns { ok: true, path, cost }, or
 * { ok: false, reason } when the vertices lie in different components.
 */
export function dijkstra(nodes, edges, start, end) {
  const adj = adjacencyList(nodes, edges);
  const dist = new Map(nodes.map((n) => [n, Infinity]));
  const prev = new Map();
  const settled = new Set();

  dist.set(start, 0);
  const heap = new MinHeap();
  heap.push({ node: start, dist: 0 });

  while (heap.size > 0) {
    const { node } = heap.pop();
    if (settled.has(node)) continue;
    settled.add(node);
    if (node === end) break;

    for (const { to, weight } of adj.get(node) ?? []) {
      const candidate = dist.get(node) + weight;
      if (candidate < dist.get(to)) {
        dist.set(to, candidate);
        prev.set(to, node);
        heap.push({ node: to, dist: candidate });
      }
    }
  }

  if (!Number.isFinite(dist.get(end))) {
    return {
      ok: false,
      reason:
        `No path exists between ${start} and ${end} ` +
        "(they lie in different connected components).",
    };
  }

  const path = [end];
  while (path[0] !== start) path.unshift(prev.get(path[0]));
  return { ok: true, path, cost: dist.get(end) };
}

/** Union-find (disjoint set) with path compression, used by Kruskal. */
class DisjointSet {
  constructor(items) {
    this.parent = new Map(items.map((x) => [x, x]));
    this.rank = new Map(items.map((x) => [x, 0]));
  }
  find(x) {
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root);
    while (this.parent.get(x) !== root) {
      const next = this.parent.get(x);
      this.parent.set(x, root);
      x = next;
    }
    return root;
  }
  /** Returns false when x and y were already joined (so this edge closes a cycle). */
  union(x, y) {
    const a = this.find(x);
    const b = this.find(y);
    if (a === b) return false;
    const ra = this.rank.get(a);
    const rb = this.rank.get(b);
    if (ra < rb) this.parent.set(a, b);
    else if (ra > rb) this.parent.set(b, a);
    else {
      this.parent.set(b, a);
      this.rank.set(a, ra + 1);
    }
    return true;
  }
}

/** Kruskal's minimum spanning tree (a spanning forest if the graph is disconnected). */
export function minimumSpanningTree(nodes, edges) {
  const sorted = edges
    .map((e, i) => ({ ...e, order: i }))
    .sort((a, b) => a.weight - b.weight || a.order - b.order);

  const sets = new DisjointSet(nodes);
  const chosen = [];
  for (const edge of sorted) {
    if (sets.union(edge.u, edge.v)) chosen.push({ u: edge.u, v: edge.v, weight: edge.weight });
  }
  return { edges: chosen, total: chosen.reduce((sum, e) => sum + e.weight, 0) };
}

/** Count connected components with the same union-find structure. */
export function connectedComponents(nodes, edges) {
  const sets = new DisjointSet(nodes);
  for (const { u, v } of edges) sets.union(u, v);
  return new Set(nodes.map((n) => sets.find(n))).size;
}

/** Weighted adjacency matrix; 0 means "no edge". Symmetric, since undirected. */
export function adjacencyMatrix(nodes, edges) {
  const lookup = new Map();
  for (const { u, v, weight } of edges) {
    lookup.set(JSON.stringify([u, v]), weight);
    lookup.set(JSON.stringify([v, u]), weight);
  }
  return nodes.map((a) => nodes.map((b) => lookup.get(JSON.stringify([a, b])) ?? 0));
}

// --------------------------------------------------------------------------
// Public entry point used by the HTTP API
// --------------------------------------------------------------------------
/**
 * Build the graph and compute every view at once (original / shortest path /
 * MST) so the browser can switch between them without another request.
 */
export function analyzeGraph({ edges: edgeText = "", start = null, end = null } = {}) {
  const { nodes: insertionOrder, edges, warnings } = parseGraph(edgeText);
  const nodes = [...insertionOrder].sort();

  // Fall back to the first/last vertex when the requested endpoints are gone.
  const source = nodes.includes(start) ? start : nodes[0];
  const target = nodes.includes(end) ? end : nodes[nodes.length - 1];

  const componentCount = connectedComponents(nodes, edges);
  const hasNegative = edges.some((e) => e.weight < 0);

  // -- shortest path -------------------------------------------------------
  let shortestPath;
  if (hasNegative) {
    shortestPath = {
      ok: false,
      reason:
        "Dijkstra's algorithm requires non-negative edge weights. " +
        "Remove the negative weights and retry.",
    };
  } else {
    const result = dijkstra(nodes, edges, source, target);
    if (!result.ok) {
      shortestPath = result;
    } else {
      const weightOf = (u, v) =>
        edges.find((e) => (e.u === u && e.v === v) || (e.u === v && e.v === u)).weight;
      shortestPath = {
        ok: true,
        path: result.path,
        cost: result.cost,
        costLabel: formatWeight(result.cost),
        steps: result.path.slice(0, -1).map((u, i) => {
          const v = result.path[i + 1];
          return { from: u, to: v, weight: formatWeight(weightOf(u, v)) };
        }),
      };
    }
  }

  // -- minimum spanning tree ------------------------------------------------
  const mstResult = minimumSpanningTree(nodes, edges);
  const mst = {
    edges: mstResult.edges
      .map((e) => ({ ...e, label: formatWeight(e.weight) }))
      .sort((a, b) => a.weight - b.weight),
    total: mstResult.total,
    totalLabel: formatWeight(mstResult.total),
    isForest: componentCount > 1,
    componentCount,
  };

  return {
    nodes,
    edges: edges.map((e) => ({ ...e, label: formatWeight(e.weight) })),
    layout: springLayout(insertionOrder, edges.map((e) => [e.u, e.v])),
    warnings,
    start: source,
    end: target,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    connected: componentCount === 1,
    componentCount,
    hasNegative,
    shortestPath,
    mst,
    adjacency: adjacencyMatrix(nodes, edges).map((row) => row.map(formatWeight)),
  };
}
