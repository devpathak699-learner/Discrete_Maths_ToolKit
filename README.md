# Discrete Math Toolkit

An interactive problem solver covering three discrete-mathematics units:

1. **Logic Analyzer** — truth tables, normal forms and logical equivalence
2. **Relation Checker** — reflexive / symmetric / antisymmetric / transitive, equivalence relation, POSET, matrix
3. **Graph Visualizer** — Dijkstra shortest path and Minimum Spanning Tree

The project ships in **two independent versions** that do the same mathematics:

| Version | Stack | Run it with |
|---|---|---|
| **Node.js** (recommended) | Plain Node.js + HTML/CSS/JS, **zero dependencies** | `npm start` |
| Python | Streamlit + SymPy + NetworkX + Matplotlib | `streamlit run app.py` |

---

## Run the Node.js version

**Requirements:** [Node.js](https://nodejs.org/) 18 or newer. Nothing else — there are
no npm packages to install, so it works offline and `npm install` is not needed.

**Easiest:** double-click `start.bat` (Windows) or run `./start.sh` (macOS/Linux).
The browser opens by itself.

**From a terminal, inside this folder:**

```
npm start
```

Then open <http://localhost:3000>.

Useful variations:

```
node server.js --open      start and open the browser automatically
PORT=4000 npm start        use a different port
npm run dev                restart automatically when a file changes
npm test                   run the test suite
```

If port 3000 is already busy the server simply steps to the next free port and
prints the address it actually used.

### Files

| File | Purpose |
|---|---|
| `server.js` | HTTP server: serves `public/` and the three JSON endpoints |
| `src/logic.js` | Parser, truth tables, Quine–McCluskey DNF/CNF minimiser |
| `src/relations.js` | Relation property checks, equivalence classes, matrix |
| `src/graph.js` | Edge-list parsing, Dijkstra, Kruskal, adjacency matrix |
| `src/layout.js` | Deterministic force-directed layout for drawing the graph |
| `public/` | The browser interface (`index.html`, `styles.css`, `app.js`) |
| `test/` | 52 tests: unit tests per module plus end-to-end API tests |
| `start.bat` / `start.sh` | One-click launchers (Windows / macOS–Linux) |

All mathematics runs on the server; the browser only renders the results.
There is no `eval()` anywhere — expressions are tokenised and parsed by hand,
so pasted input can never execute code.

---

## Run the Python version

**Requirements:** Python with the packages in `requirements.txt`.

> **Note:** on Python 3.13+ some of these packages may not have prebuilt wheels
> yet and `pip install` can fail. The Node.js version above has no such issue.

**Easiest:** double-click `run.bat` (Windows) or run `./run.sh` (macOS/Linux).

**Manually:**

```
python -m pip install -r requirements.txt
python -m streamlit run app.py
```

The app opens at <http://localhost:8501>.

> Do not use the VS Code "Run" button or `python app.py`; Streamlit apps must be
> started with `streamlit run`.

| File | Purpose |
|---|---|
| `app.py` | The Streamlit application |
| `requirements.txt` | Python dependencies |
| `test_app.py` | Headless smoke tests — `python test_app.py` |
| `run.bat` / `run.sh` | One-click launchers |

---

## Input syntax

**Logic**

| Meaning | Accepted spellings |
|---|---|
| NOT | `~` `!` `not` `¬` |
| AND | `&` `&&` `and` `∧` |
| OR | `\|` `\|\|` `or` `∨` |
| XOR | `^` `xor` `⊕` |
| IMPLIES | `->` `=>` `>>` `implies` `→` |
| IFF | `<->` `<=>` `iff` `↔` |
| Constants | `True` `False` `1` `0` |

Precedence, highest first: `~` > `&` > `^` > `|` > `->` > `<->`.
Use parentheses when in doubt. Example: `(p & q) | r`. At most 8 variables (256 rows).

**Relations** — domain `1, 2, 3, 4`; pairs `(1,1), (2,2), (1,2)`.
Letters such as `a, b, c` work as well as numbers.

**Graph** — one edge per line, `Source Target Weight`, e.g. `A B 5`.
Lines starting with `#` are ignored, self-loops are dropped, and a repeated edge
keeps its smallest weight. The graph is undirected.

---

## What each module computes

**Logic Analyzer.** Both expressions are parsed into an expression tree, then
evaluated on all 2ⁿ assignments of their *n* variables. Two statements are
logically equivalent exactly when their columns agree in every row (that is,
when `A ↔ B` is a tautology); when they differ, the first disagreeing row is
reported as a counter-example. Each formula is also classified as a tautology,
contradiction or contingency, and minimised into DNF and CNF with the
Quine–McCluskey algorithm.

**Relation Checker.** Each of the four properties is tested from its definition,
and any failure is explained by the specific pairs responsible — the missing
loops, the missing mirror pairs, the pairs violating antisymmetry, or the pairs
missing for transitivity. A relation that is reflexive, symmetric and transitive
is reported as an equivalence relation together with the partition it induces.

**Graph Visualizer.** Dijkstra's algorithm settles vertices in order of distance
using a binary heap; Kruskal's algorithm sorts the edges and joins components
with union-find. On a disconnected graph the result is a minimum spanning
*forest*, and this is stated explicitly. Negative weights disable the shortest
path (Dijkstra's correctness assumes non-negative weights) while leaving the
spanning tree available.
