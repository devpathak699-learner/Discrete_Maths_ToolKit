/**
 * DETERMINISTIC FORCE-DIRECTED LAYOUT
 * ==============================================================
 * A Fruchterman-Reingold spring layout, the same family of algorithm as
 * networkx.spring_layout. Vertices repel one another (force k^2/d) while
 * edges pull their endpoints together (force d^2/k); a cooling "temperature"
 * caps how far a vertex may move each iteration so the system settles.
 *
 * The random number generator is seeded, so the same graph always produces
 * exactly the same picture -- switching between views never makes the
 * vertices jump around.
 */

/** Small, fast, seedable PRNG (mulberry32). */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Lay out `nodes` connected by `edges` ([u, v] pairs).
 * Returns { nodeName: { x, y } } with every coordinate in [0, 1].
 */
export function springLayout(nodes, edges, { seed = 42, iterations = 320 } = {}) {
  const n = nodes.length;
  if (n === 0) return {};
  if (n === 1) return { [nodes[0]]: { x: 0.5, y: 0.5 } };

  const rand = mulberry32(seed);
  const index = new Map(nodes.map((v, i) => [v, i]));
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    px[i] = rand();
    py[i] = rand();
  }

  const links = edges
    .map(([u, v]) => [index.get(u), index.get(v)])
    .filter(([a, b]) => a !== undefined && b !== undefined);

  const k = Math.sqrt(1 / n); // ideal edge length
  let temperature = 0.1;
  const cooling = temperature / (iterations + 1);
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);

  for (let step = 0; step < iterations; step += 1) {
    dx.fill(0);
    dy.fill(0);

    // Repulsion between every pair of vertices.
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        let ex = px[i] - px[j];
        let ey = py[i] - py[j];
        let d2 = ex * ex + ey * ey;
        if (d2 < 1e-12) {
          // Coincident vertices: nudge them apart deterministically.
          ex = (rand() - 0.5) * 1e-4;
          ey = (rand() - 0.5) * 1e-4;
          d2 = ex * ex + ey * ey + 1e-12;
        }
        const d = Math.sqrt(d2);
        const force = (k * k) / d;
        const fx = (ex / d) * force;
        const fy = (ey / d) * force;
        dx[i] += fx;
        dy[i] += fy;
        dx[j] -= fx;
        dy[j] -= fy;
      }
    }

    // Attraction along edges.
    for (const [a, b] of links) {
      const ex = px[a] - px[b];
      const ey = py[a] - py[b];
      const d = Math.sqrt(ex * ex + ey * ey) || 1e-9;
      const force = (d * d) / k;
      const fx = (ex / d) * force;
      const fy = (ey / d) * force;
      dx[a] -= fx;
      dy[a] -= fy;
      dx[b] += fx;
      dy[b] += fy;
    }

    // Move each vertex, but never further than the current temperature.
    for (let i = 0; i < n; i += 1) {
      const d = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]);
      if (d < 1e-12) continue;
      const limit = Math.min(d, temperature) / d;
      px[i] += dx[i] * limit;
      py[i] += dy[i] * limit;
    }
    temperature -= cooling;
  }

  return normalize(nodes, px, py);
}

/** Rescale the final coordinates into the unit square. */
function normalize(nodes, px, py) {
  const minX = Math.min(...px);
  const maxX = Math.max(...px);
  const minY = Math.min(...py);
  const maxY = Math.max(...py);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  const positions = {};
  nodes.forEach((name, i) => {
    positions[name] = {
      x: maxX - minX < 1e-9 ? 0.5 : (px[i] - minX) / spanX,
      y: maxY - minY < 1e-9 ? 0.5 : (py[i] - minY) / spanY,
    };
  });
  return positions;
}
