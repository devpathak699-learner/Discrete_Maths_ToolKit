/**
 * Discrete Math Toolkit -- browser front end
 * ==============================================================
 * Collects input, posts it to the JSON API, and renders the results.
 * All mathematics happens on the server (src/logic.js, src/relations.js,
 * src/graph.js); this file is presentation only.
 */

const $ = (id) => document.getElementById(id);

/** Escape text before putting it into innerHTML. */
const esc = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

/** POST a payload and return the parsed result, or throw with the API message. */
async function callApi(route, payload) {
  const response = await fetch(route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({ error: "Malformed server response." }));
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status}).`);
  return data;
}

const banner = (kind, mark, html) =>
  `<div class="banner banner-${kind}"><span class="banner-mark">${mark}</span><div>${html}</div></div>`;

const errorBanner = (message) =>
  banner("bad", "&#9888;&#65039;", `<strong>Input error</strong><pre>${esc(message)}</pre>`);

/** Run `work` on every input event, debounced, and show failures as a banner. */
function liveUpdate(inputs, outputEl, work) {
  let timer = null;
  const run = async () => {
    try {
      await work();
    } catch (err) {
      outputEl.innerHTML = errorBanner(err.message);
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(run, 220);
  };
  for (const el of inputs) {
    el.addEventListener("input", schedule);
    el.addEventListener("change", schedule);
  }
  return run;
}

// ==========================================================================
// Sidebar navigation
// ==========================================================================
for (const button of $("nav").querySelectorAll(".nav-item")) {
  button.addEventListener("click", () => {
    for (const other of $("nav").querySelectorAll(".nav-item")) {
      other.classList.toggle("is-active", other === button);
    }
    for (const section of document.querySelectorAll(".module")) {
      section.classList.toggle("is-active", section.id === `module-${button.dataset.module}`);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

// ==========================================================================
// MODULE 1 -- Logic Analyzer
// ==========================================================================
const logicOut = $("logic-out");

function renderLogic(data, asBinary) {
  const show = (b) => (asBinary ? (b ? "1" : "0") : b ? "T" : "F");
  const cell = (b) => `<td class="${b ? "t" : "f"}">${show(b)}</td>`;

  const parsedCards = data.parsed
    .map(
      (p, i) => `
      <div class="tile">
        <h3>Expression ${i + 1}</h3>
        <pre class="formula">${esc(p.pretty)}</pre>
        <p class="formula-note"><b>DNF</b> <span>${esc(p.dnf)}</span></p>
        <p class="formula-note"><b>CNF</b> <span>${esc(p.cnf)}</span></p>
      </div>`
    )
    .join("");

  const header = data.variables.length
    ? data.variables.map((v) => `<th class="var">${esc(v)}</th>`).join("")
    : '<th class="var">(no variables)</th>';

  const body = data.rows
    .map((row) => {
      const values = data.variables.length
        ? row.values.map(cell).join("")
        : '<td class="f">&mdash;</td>';
      const mark = row.match
        ? '<td class="t">&#10003;</td>'
        : '<td class="f">&#10007;</td>';
      return `<tr class="${row.match ? "" : "mismatch"}">${values}${cell(row.e1)}${cell(row.e2)}${mark}</tr>`;
    })
    .join("");

  let verdict;
  if (data.equivalent) {
    verdict = banner(
      "good",
      "&#9989;",
      "<strong>The two statements are LOGICALLY EQUIVALENT.</strong><br />" +
        `Their truth values agree in all ${data.rowCount} rows.`
    );
  } else {
    const ce = data.counterExample;
    const assignment =
      ce.assignment.map((a) => `${a.name}=${show(a.value)}`).join(", ") || "(no variables)";
    verdict = banner(
      "bad",
      "&#10060;",
      "<strong>The statements are NOT logically equivalent.</strong><br />" +
        `They differ in ${data.mismatchCount} of ${data.rowCount} rows.<br />` +
        `<b>Counter-example:</b> with <span class="mono">${esc(assignment)}</span> &rarr; ` +
        `Expr 1 = <span class="mono">${show(ce.e1)}</span>, Expr 2 = <span class="mono">${show(ce.e2)}</span>.`
    );
  }

  logicOut.innerHTML = `
    <section>
      <h2>Parsed formulas</h2>
      <div class="grid">${parsedCards}</div>
    </section>
    <section>
      <h2>Truth table <span class="mono" style="text-transform:none;font-weight:400">
        (${data.rowCount} row${data.rowCount === 1 ? "" : "s"})</span></h2>
      <div class="table-wrap scroll-tall">
        <table>
          <thead><tr>${header}<th>Expr 1</th><th>Expr 2</th><th>Match</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      <p class="table-cap">Rows where the two expressions disagree are highlighted.</p>
    </section>
    <section>
      <h2>Classification</h2>
      <div class="grid">
        <div class="tile"><div class="tile-label">Expression 1</div>
          <div class="tile-value">${esc(data.classification[0])}</div></div>
        <div class="tile"><div class="tile-label">Expression 2</div>
          <div class="tile-value">${esc(data.classification[1])}</div></div>
      </div>
    </section>
    <section><h2>Verdict</h2>${verdict}</section>`;
}

const refreshLogic = liveUpdate(
  [$("logic-e1"), $("logic-e2"), $("logic-binary")],
  logicOut,
  async () => {
    const data = await callApi("/api/logic", {
      expr1: $("logic-e1").value,
      expr2: $("logic-e2").value,
    });
    renderLogic(data, $("logic-binary").checked);
  }
);

for (const chip of document.querySelectorAll("#module-logic .chip")) {
  chip.addEventListener("click", () => {
    $("logic-e1").value = chip.dataset.e1;
    $("logic-e2").value = chip.dataset.e2;
    refreshLogic();
  });
}

// ==========================================================================
// MODULE 2 -- Relation Checker
// ==========================================================================
const relOut = $("rel-out");

const WITNESS_LABEL = {
  reflexive: "Missing loops",
  symmetric: "Missing mirror pairs",
  antisymmetric: "Violating pairs",
  transitive: "Missing pairs for transitivity",
};

function renderRelation(data) {
  const tiles = Object.entries(data.properties)
    .map(([name, result]) => {
      const note = result.ok
        ? ""
        : `<div class="tile-note">${WITNESS_LABEL[name]}:
             <span class="mono">${esc(result.witnesses)}</span></div>`;
      return `<div class="tile">
          <div class="tile-label">${esc(name)}</div>
          <div class="tile-value ${result.ok ? "ok" : "no"}">
            ${result.ok ? "&#10003; Yes" : "&#10007; No"}</div>
          ${note}</div>`;
    })
    .join("");

  const equivalence = data.isEquivalence
    ? banner(
        "good",
        "&#9989;",
        "<strong>R is an Equivalence Relation</strong> (reflexive, symmetric, transitive).<br />" +
          "It partitions the domain into these equivalence classes: " +
          `<span class="mono">${data.equivalenceClasses
            .map((c) => `{${c.map(esc).join(", ")}}`)
            .join(", ")}</span>`
      )
    : banner("bad", "&#10060;", "<strong>R is not an Equivalence Relation.</strong>");

  const poset = data.isPoset
    ? banner(
        "good",
        "&#9989;",
        "<strong>R is a Partial Order (POSET)</strong> (reflexive, antisymmetric, transitive)."
      )
    : banner("bad", "&#10060;", "<strong>R is not a Partial Order (POSET).</strong>");

  const head = data.domain.map((d) => `<th class="var">${esc(d)}</th>`).join("");
  const rows = data.matrix
    .map(
      (row, i) =>
        `<tr><td class="rowhead">${esc(data.domain[i])}</td>` +
        row.map((v, j) => `<td class="${v && i === j ? "diag" : ""}">${v}</td>`).join("") +
        "</tr>"
    )
    .join("");

  const emptyNote = data.empty
    ? banner(
        "info",
        "&#8505;&#65039;",
        "The relation is empty (no ordered pairs). The results below describe the empty relation."
      )
    : "";

  relOut.innerHTML = `
    ${emptyNote}
    <section>
      <h2>Property checks
        <span style="text-transform:none;font-weight:400">
          &mdash; |A| = ${data.domain.length}, |R| = ${data.pairCount}</span></h2>
      <div class="grid-props">${tiles}</div>
    </section>
    <section><h2>Classification</h2>${equivalence}<div style="height:12px"></div>${poset}</section>
    <section>
      <h2>Matrix representation</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th class="corner">R</th>${head}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="table-cap">Entry <span class="mono">M[i][j] = 1</span> when
        <span class="mono">(i, j) &isin; R</span>, otherwise 0.
        Rows are the first element, columns the second; the shaded diagonal entries are the loops.</p>
    </section>`;
}

const refreshRelation = liveUpdate([$("rel-domain"), $("rel-pairs")], relOut, async () => {
  renderRelation(
    await callApi("/api/relation", {
      domain: $("rel-domain").value,
      pairs: $("rel-pairs").value,
    })
  );
});

for (const chip of document.querySelectorAll("#module-relation .chip")) {
  chip.addEventListener("click", () => {
    $("rel-domain").value = chip.dataset.domain;
    $("rel-pairs").value = chip.dataset.pairs;
    refreshRelation();
  });
}

// ==========================================================================
// MODULE 3 -- Graph Visualizer
// ==========================================================================
const graphOut = $("graph-out");
const WIDTH = 760;
const HEIGHT = 520;
const PAD = 46;
const RADIUS = 21;

/** The server sends layout coordinates in [0,1]; map them into the viewBox. */
const place = (layout, name) => ({
  x: PAD + layout[name].x * (WIDTH - 2 * PAD),
  y: PAD + layout[name].y * (HEIGHT - 2 * PAD),
});

const edgeId = (u, v) => [u, v].slice().sort().join("↔");

/**
 * Draw the graph as SVG. `hotEdges` is a Set of edge ids drawn thick and red;
 * `hotNodes` a Set of vertices drawn gold.
 */
function drawGraph(data, { hotEdges = new Set(), hotNodes = new Set(), start, end } = {}) {
  const parts = [];

  for (const edge of data.edges) {
    const a = place(data.layout, edge.u);
    const b = place(data.layout, edge.v);
    const hot = hotEdges.has(edgeId(edge.u, edge.v));
    parts.push(
      `<line class="edge${hot ? " hot" : ""}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`
    );
  }

  // Weight labels go above the edges but below the vertices.
  for (const edge of data.edges) {
    const a = place(data.layout, edge.u);
    const b = place(data.layout, edge.v);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const w = 11 + edge.label.length * 7;
    parts.push(
      `<g class="weight"><rect x="${mx - w / 2}" y="${my - 9}" width="${w}" height="18" />` +
        `<text x="${mx}" y="${my}">${esc(edge.label)}</text></g>`
    );
  }

  for (const node of data.nodes) {
    const p = place(data.layout, node);
    const role =
      node === start ? "start" : node === end ? "end" : hotNodes.has(node) ? "on" : "";
    parts.push(
      `<g class="node ${role}"><circle cx="${p.x}" cy="${p.y}" r="${RADIUS}" />` +
        `<text x="${p.x}" y="${p.y}">${esc(node)}</text></g>`
    );
  }

  return `<div class="graph-stage">
      <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img"
           aria-label="Weighted graph with ${data.nodeCount} vertices and ${data.edgeCount} edges">
        ${parts.join("")}
      </svg>
    </div>`;
}

const legend = (items) =>
  `<div class="legend">${items
    .map(
      ([cls, color, label]) =>
        `<span><i class="swatch ${cls}" style="background:${color}"></i>${label}</span>`
    )
    .join("")}</div>`;

const NODE_LEGEND = [
  ["", "#2a9d8f", "start"],
  ["", "#9d4edd", "end"],
  ["", "#ffb703", "on the solution"],
  ["", "#8ecae6", "other vertices"],
];

/** Build the right-hand panel for the currently selected view. */
function graphSidePanel(data, mode) {
  if (mode === "original") {
    return `
      <div class="tile"><div class="tile-label">Vertices</div>
        <div class="tile-value">${data.nodeCount}</div></div>
      <div class="tile"><div class="tile-label">Edges</div>
        <div class="tile-value">${data.edgeCount}</div></div>
      <div class="tile"><div class="tile-label">Connected</div>
        <div class="tile-value ${data.connected ? "ok" : "no"}">
          ${data.connected ? "&#10003; Yes" : `&#10007; ${data.componentCount} components`}</div></div>
      ${legend([...NODE_LEGEND])}`;
  }

  if (mode === "path") {
    const sp = data.shortestPath;
    if (!sp.ok) return banner("bad", "&#10060;", esc(sp.reason));
    const chain = sp.path.map((n) => `<b>${esc(n)}</b>`).join('<i>&rarr;</i>');
    const steps = sp.steps
      .map((s) => `<tr><td>${esc(s.from)}</td><td>${esc(s.to)}</td><td>${esc(s.weight)}</td></tr>`)
      .join("");
    return `
      ${banner("good", "&#9989;", `<strong>Shortest path</strong><div class="path-chain">${chain}</div>`)}
      <div class="tile"><div class="tile-label">Total cost</div>
        <div class="tile-value">${esc(sp.costLabel)}</div></div>
      ${
        sp.steps.length > 0
          ? `<div class="table-wrap"><table>
               <thead><tr><th>From</th><th>To</th><th>Weight</th></tr></thead>
               <tbody>${steps}</tbody></table></div>`
          : '<p class="table-cap">Start and end are the same vertex, so the cost is 0.</p>'
      }
      ${legend([...NODE_LEGEND, ["line", "#e5484d", "path edges"]])}`;
  }

  const mst = data.mst;
  const rows = mst.edges
    .map((e) => `<tr><td>${esc(e.u)} &ndash; ${esc(e.v)}</td><td>${esc(e.label)}</td></tr>`)
    .join("");
  const forestNote = mst.isForest
    ? banner(
        "warn",
        "&#9888;&#65039;",
        `The graph has ${mst.componentCount} components, so this is a ` +
          "<strong>minimum spanning forest</strong> (one tree per component)."
      )
    : "";
  return `
    ${forestNote}
    ${banner("good", "&#9989;", "<strong>Minimum spanning tree computed</strong> (Kruskal&rsquo;s algorithm).")}
    <div class="tile"><div class="tile-label">Total weight</div>
      <div class="tile-value">${esc(mst.totalLabel)}</div>
      <div class="tile-note">${mst.edges.length} of ${data.edgeCount} edges kept</div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Edge</th><th>Weight</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    ${legend([["line", "#e5484d", "edges in the tree"], ["", "#ffb703", "spanned vertices"]])}`;
}

function renderGraph(data, mode) {
  let options = { start: data.start, end: data.end };
  if (mode === "path" && data.shortestPath.ok) {
    options = {
      ...options,
      hotEdges: new Set(
        data.shortestPath.path.slice(0, -1).map((u, i) => edgeId(u, data.shortestPath.path[i + 1]))
      ),
      hotNodes: new Set(data.shortestPath.path),
    };
  } else if (mode === "mst") {
    options = {
      start: null,
      end: null,
      hotEdges: new Set(data.mst.edges.map((e) => edgeId(e.u, e.v))),
      hotNodes: new Set(data.nodes),
    };
  }

  const warnings = data.warnings.map((w) => banner("warn", "&#9888;&#65039;", esc(w))).join("");
  const adjHead = data.nodes.map((n) => `<th class="var">${esc(n)}</th>`).join("");
  const adjRows = data.adjacency
    .map(
      (row, i) =>
        `<tr><td class="rowhead">${esc(data.nodes[i])}</td>` +
        row.map((v) => `<td>${esc(v)}</td>`).join("") +
        "</tr>"
    )
    .join("");

  graphOut.innerHTML = `
    ${warnings}
    <div class="graph-layout">
      ${drawGraph(data, options)}
      <div class="graph-side">${graphSidePanel(data, mode)}</div>
    </div>
    <details class="extra">
      <summary>Show the adjacency matrix</summary>
      <p class="table-cap">Entry <span class="mono">[i][j]</span> is <span class="mono">1</span> when there is an edge between
        <span class="mono">i&ndash;j</span>; <span class="mono">&infin;</span> means there is no edge.
        The matrix is symmetric because the graph is undirected.</p>
      <div class="table-wrap">
        <table><thead><tr><th class="corner">&nbsp;</th>${adjHead}</tr></thead>
        <tbody>${adjRows}</tbody></table>
      </div>
    </details>`;
}

let graphMode = "original";
let graphData = null;

/** Keep the start/end dropdowns in sync with the vertices of the current graph. */
function syncNodeSelects(nodes, start, end) {
  for (const [select, chosen] of [[$("graph-start"), start], [$("graph-end"), end]]) {
    const options = nodes.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
    if (select.dataset.nodes !== nodes.join(",")) {
      select.innerHTML = options;
      select.dataset.nodes = nodes.join(",");
    }
    select.value = chosen;
  }
}

const refreshGraph = liveUpdate(
  [$("graph-edges"), $("graph-start"), $("graph-end")],
  graphOut,
  async () => {
    graphData = await callApi("/api/graph", {
      edges: $("graph-edges").value,
      start: $("graph-start").value || null,
      end: $("graph-end").value || null,
    });
    syncNodeSelects(graphData.nodes, graphData.start, graphData.end);
    renderGraph(graphData, graphMode);
  }
);

for (const button of $("graph-mode").querySelectorAll("button")) {
  button.addEventListener("click", () => {
    graphMode = button.dataset.mode;
    for (const other of $("graph-mode").querySelectorAll("button")) {
      other.classList.toggle("is-active", other === button);
    }
    // Every view is already in `graphData`, so switching needs no new request.
    if (graphData) renderGraph(graphData, graphMode);
  });
}

// ==========================================================================
// First render
// ==========================================================================
refreshLogic();
refreshRelation();
refreshGraph();
