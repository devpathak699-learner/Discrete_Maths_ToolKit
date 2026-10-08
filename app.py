"""
Discrete Math Toolkit  --  app.py
=================================
An interactive Streamlit problem solver for three discrete-mathematics units:
    1. Propositional Logic   (truth tables, logical equivalence)
    2. Sets & Relations      (reflexive / symmetric / transitive, equivalence, POSET)
    3. Graph Theory          (Dijkstra shortest path, Minimum Spanning Tree)

Run with:   python -m streamlit run app.py
"""

import itertools
import math
import re

import matplotlib
matplotlib.use("Agg")  # non-interactive backend: safe for a web server
import matplotlib.pyplot as plt
import networkx as nx
import pandas as pd
import streamlit as st
from sympy import Symbol, true, false
from sympy.logic.boolalg import And, Or, Not, Xor, Implies, Equivalent, to_cnf, to_dnf

# --------------------------------------------------------------------------
# Page configuration (must be the first Streamlit call)
# --------------------------------------------------------------------------
st.set_page_config(page_title="Discrete Math Toolkit", page_icon="🧮", layout="wide")


# ==========================================================================
# MODULE 1 HELPERS -- SAFE PROPOSITIONAL-LOGIC PARSER
# ==========================================================================
# Instead of calling eval()/parse_expr() on raw user input (which can execute
# arbitrary code), we tokenise the string ourselves and build SymPy Boolean
# objects with a small recursive-descent parser. Precedence (high -> low):
#       ~ (NOT)  >  & (AND)  >  ^ (XOR)  >  | (OR)  >  -> (IMPLIES)  >  <-> (IFF)

class LogicParseError(Exception):
    """Raised when a propositional expression is malformed."""


# Every accepted spelling of an operator maps to one canonical symbol.
OPERATOR_ALIASES = {
    "&": "&", "&&": "&", "and": "&", "∧": "&",
    "|": "|", "||": "|", "or": "|", "∨": "|",
    "~": "~", "!": "~", "not": "~", "¬": "~",
    "^": "^", "xor": "^", "⊕": "^",
    "->": "->", "=>": "->", ">>": "->", "implies": "->", "→": "->",
    "<->": "<->", "<=>": "<->", "iff": "<->", "↔": "<->",
}

TOKEN_RE = re.compile(
    r"\s*(<->|<=>|->|=>|>>|&&|\|\||&|\||\^|~|!|\(|\)|"
    r"[A-Za-z_][A-Za-z0-9_]*|[01]|∧|∨|¬|→|↔|⊕)"
)


def tokenize(text: str):
    """Split the expression into tokens; reject any unknown character."""
    tokens, pos = [], 0
    text = text.strip()
    while pos < len(text):
        match = TOKEN_RE.match(text, pos)
        if not match:
            raise LogicParseError(f"Unexpected character '{text[pos:].strip()[0]}' in expression.")
        tokens.append(match.group(1))
        pos = match.end()
    return tokens


class LogicParser:
    """Recursive-descent parser turning tokens into a SymPy Boolean expression."""

    def __init__(self, text: str):
        self.tokens = tokenize(text)
        self.i = 0
        self.variables = set()  # names of every propositional variable seen
        if not self.tokens:
            raise LogicParseError("Expression is empty.")

    # -- token helpers ------------------------------------------------------
    def peek(self):
        if self.i >= len(self.tokens):
            return None
        tok = self.tokens[self.i]
        return OPERATOR_ALIASES.get(tok.lower(), tok)

    def advance(self):
        tok = self.peek()
        self.i += 1
        return tok

    # -- grammar rules (lowest precedence first) -------------------------------
    def parse(self):
        expr = self.parse_iff()
        if self.i != len(self.tokens):
            raise LogicParseError(f"Unexpected token '{self.tokens[self.i]}'. Check your parentheses/operators.")
        return expr, self.variables

    def parse_iff(self):
        left = self.parse_implies()
        while self.peek() == "<->":
            self.advance()
            left = Equivalent(left, self.parse_implies())
        return left

    def parse_implies(self):
        left = self.parse_or()
        if self.peek() == "->":  # right-associative: a -> b -> c == a -> (b -> c)
            self.advance()
            return Implies(left, self.parse_implies())
        return left

    def parse_or(self):
        left = self.parse_xor()
        while self.peek() == "|":
            self.advance()
            left = Or(left, self.parse_xor())
        return left

    def parse_xor(self):
        left = self.parse_and()
        while self.peek() == "^":
            self.advance()
            left = Xor(left, self.parse_and())
        return left

    def parse_and(self):
        left = self.parse_not()
        while self.peek() == "&":
            self.advance()
            left = And(left, self.parse_not())
        return left

    def parse_not(self):
        if self.peek() == "~":
            self.advance()
            return Not(self.parse_not())
        return self.parse_atom()

    def parse_atom(self):
        tok = self.peek()
        if tok is None:
            raise LogicParseError("Expression ended unexpectedly (missing operand?).")
        if tok == "(":
            self.advance()
            inner = self.parse_iff()
            if self.peek() != ")":
                raise LogicParseError("Missing closing parenthesis ')'.")
            self.advance()
            return inner
        if tok in {"&", "|", "^", "->", "<->", ")"}:
            raise LogicParseError(f"Operator '{tok}' is missing an operand.")
        self.advance()
        # Constants
        if tok == "1" or tok.lower() == "true":
            return true
        if tok == "0" or tok.lower() == "false":
            return false
        # Otherwise it's a propositional variable
        self.variables.add(tok)
        return Symbol(tok)


def parse_logic(text: str):
    """Public helper: returns (sympy_expression, set_of_variable_names)."""
    return LogicParser(text).parse()


def evaluate(expr, mapping) -> bool:
    """Substitute True/False for every variable and reduce to a Python bool."""
    result = expr.xreplace(mapping)
    if result == true:
        return True
    if result == false:
        return False
    raise ValueError("Expression could not be fully evaluated.")


def build_truth_table(e1, e2, variables):
    """Enumerate all 2^n assignments (TT..T first) and evaluate both expressions."""
    rows = []
    for values in itertools.product([True, False], repeat=len(variables)):
        mapping = {Symbol(v): (true if val else false) for v, val in zip(variables, values)}
        rows.append(list(values) + [evaluate(e1, mapping), evaluate(e2, mapping)])
    return pd.DataFrame(rows, columns=list(variables) + ["Expr 1", "Expr 2"])


def classify(column: pd.Series) -> str:
    """Tautology / contradiction / contingency check for one truth-table column."""
    if column.all():
        return "Tautology (always True)"
    if not column.any():
        return "Contradiction (always False)"
    return "Contingency (sometimes True, sometimes False)"


# ==========================================================================
# MODULE 1 -- LOGIC ANALYZER
# ==========================================================================
def render_logic_module():
    st.header("🔣 Logic Analyzer (Statement Calculus)")
    st.markdown(
        """
**What this does:** each expression is parsed into a SymPy Boolean formula. We then enumerate **all
2ⁿ truth assignments** of its *n* variables and evaluate both formulas on every row. Two statements are
**logically equivalent** exactly when their truth-table columns are identical for every row
(i.e. `A ↔ B` is a tautology).
        """
    )

    syntax_help = (
        "Variables: any letters (p, q, r, x1...). "
        "NOT: ~ ! not | AND: & and | OR: | or | XOR: ^ xor | "
        "IMPLIES: -> >> implies | IFF: <-> iff | Constants: True/False/1/0. "
        "Precedence: ~ > & > ^ > | > -> > <->. Use parentheses to be explicit."
    )

    col1, col2 = st.columns(2)
    with col1:
        text1 = st.text_input("Expression 1", value="p -> q", help=syntax_help, key="logic_e1")
    with col2:
        text2 = st.text_input("Expression 2", value="~p | q", help=syntax_help, key="logic_e2")

    show_binary = st.checkbox("Display truth values as 1/0 instead of T/F", value=False)

    try:
        expr1, vars1 = parse_logic(text1)
        expr2, vars2 = parse_logic(text2)
    except LogicParseError as exc:
        st.error(f"⚠️ Syntax error: {exc}")
        return
    except Exception as exc:  # last-resort safety net
        st.error(f"⚠️ Could not parse input: {exc}")
        return

    variables = sorted(vars1 | vars2)
    if len(variables) > 8:
        st.error(f"⚠️ Too many variables ({len(variables)}). Please use at most 8 (256 rows).")
        return

    try:
        table = build_truth_table(expr1, expr2, variables)
    except Exception as exc:
        st.error(f"⚠️ Evaluation failed: {exc}")
        return

    # ---- Parsed form + normal forms ----------------------------------------
    st.subheader("Parsed formulas")
    c1, c2 = st.columns(2)
    for col, label, expr in ((c1, "Expression 1", expr1), (c2, "Expression 2", expr2)):
        with col:
            st.markdown(f"**{label}** as SymPy sees it:")
            st.code(str(expr), language="text")
            try:
                st.caption(f"DNF: `{to_dnf(expr, simplify=True)}`  |  CNF: `{to_cnf(expr, simplify=True)}`")
            except Exception:
                st.caption("Normal forms unavailable for this expression.")

    # ---- Truth table --------------------------------------------------------
    st.subheader("Truth table")
    table["Match"] = table["Expr 1"] == table["Expr 2"]
    display = table.copy().astype(object)
    fmt = (lambda b: int(b)) if show_binary else (lambda b: "T" if b else "F")
    for col in display.columns:
        if col == "Match":
            display[col] = display[col].map(lambda b: "✓" if b else "✗")
        else:
            display[col] = display[col].map(fmt)

    # Highlight rows where the two expressions disagree
    def highlight_mismatch(row):
        return ["background-color: #ffd6d6; color: #000000" if row["Match"] == "✗" else "" for _ in row]

    st.dataframe(display.style.apply(highlight_mismatch, axis=1), hide_index=True)

    # ---- Classification -------------------------------------------------------
    k1, k2 = st.columns(2)
    k1.info(f"Expression 1 is a **{classify(table['Expr 1'])}**")
    k2.info(f"Expression 2 is a **{classify(table['Expr 2'])}**")

    # ---- Verdict --------------------------------------------------------------
    st.subheader("Verdict")
    if table["Match"].all():
        st.success("✅ The two statements are LOGICALLY EQUIVALENT (identical truth values in all rows).")
    else:
        bad = table[~table["Match"]]
        st.error(f"❌ The statements are NOT logically equivalent. They differ in {len(bad)} of {len(table)} rows.")
        first = bad.iloc[0]
        example = ", ".join(f"{v}={'T' if first[v] else 'F'}" for v in variables) or "(no variables)"
        e1v, e2v = ("T" if first["Expr 1"] else "F"), ("T" if first["Expr 2"] else "F")
        st.markdown(f"**Counter-example:** with `{example}` → Expr 1 = `{e1v}`, Expr 2 = `{e2v}`.")


# ==========================================================================
# MODULE 2 HELPERS -- RELATIONS
# ==========================================================================
PAIR_RE = re.compile(r"\(\s*([^,()]+?)\s*,\s*([^,()]+?)\s*\)")


def convert_token(tok: str):
    """Turn '3' into the int 3 so '3' in the domain matches '3' in a pair; otherwise keep the string."""
    tok = tok.strip().strip("'\"")
    try:
        return int(tok)
    except ValueError:
        return tok


def parse_domain(text: str):
    """Parse '1, 2, 3' into an ordered, de-duplicated list."""
    items = [convert_token(t) for t in text.split(",") if t.strip()]
    if not items:
        raise ValueError("The domain is empty. Enter comma-separated elements, e.g. 1, 2, 3.")
    return list(dict.fromkeys(items))  # preserves order, removes duplicates


def parse_pairs(text: str, domain):
    """Parse '(1,1), (1,2)' into a set of tuples, validating against the domain."""
    leftover = PAIR_RE.sub("", text)
    if leftover.replace(",", "").strip():
        raise ValueError(f"Could not understand part of the relation: '{leftover.strip()}'. Use the form (a,b), (c,d).")
    relation = set()
    for a, b in PAIR_RE.findall(text):
        a, b = convert_token(a), convert_token(b)
        for x in (a, b):
            if x not in domain:
                raise ValueError(f"Element '{x}' in pair ({a}, {b}) is not in the domain.")
        relation.add((a, b))
    return relation


def fmt_pairs(pairs):
    """Pretty-print a collection of ordered pairs in a stable order."""
    ordered = sorted(pairs, key=lambda p: (str(p[0]), str(p[1])))
    return ", ".join(f"({a}, {b})" for a, b in ordered) if ordered else "none"


def analyze_relation(domain, R):
    """Return a dict of property results plus the 'witnesses' explaining any failure."""
    # Reflexive: (a,a) in R for every a in the domain
    refl_missing = {(a, a) for a in domain if (a, a) not in R}
    # Symmetric: (a,b) in R  =>  (b,a) in R
    sym_missing = {(b, a) for (a, b) in R if (b, a) not in R}
    # Antisymmetric: (a,b) and (b,a) in R  =>  a == b
    anti_viol = {(a, b) for (a, b) in R if a != b and (b, a) in R}
    # Transitive: (a,b),(b,c) in R  =>  (a,c) in R
    trans_missing = {(a, d) for (a, b) in R for (c, d) in R if b == c and (a, d) not in R}
    return {
        "reflexive": (not refl_missing, refl_missing),
        "symmetric": (not sym_missing, sym_missing),
        "antisymmetric": (not anti_viol, anti_viol),
        "transitive": (not trans_missing, trans_missing),
    }


def relation_matrix(domain, R) -> pd.DataFrame:
    """Boolean (0/1) adjacency matrix: row a, column b is 1 iff (a,b) in R."""
    data = [[1 if (a, b) in R else 0 for b in domain] for a in domain]
    labels = [str(x) for x in domain]
    return pd.DataFrame(data, index=labels, columns=labels)


# ==========================================================================
# MODULE 2 -- RELATION CHECKER
# ==========================================================================
def render_relation_module():
    st.header("🔗 Relation Checker (Sets & Relations)")
    st.markdown(
        """
**What this does:** a relation *R* on a set *A* is a subset of *A × A*. We test the defining properties directly:

- **Reflexive:** every `a` satisfies `(a, a) ∈ R`
- **Symmetric:** `(a, b) ∈ R ⇒ (b, a) ∈ R`
- **Antisymmetric:** `(a, b) ∈ R` and `(b, a) ∈ R ⇒ a = b`
- **Transitive:** `(a, b) ∈ R` and `(b, c) ∈ R ⇒ (a, c) ∈ R`

An **equivalence relation** is reflexive + symmetric + transitive. A **partial order (POSET)** is reflexive + antisymmetric + transitive.
        """
    )

    col1, col2 = st.columns(2)
    with col1:
        domain_text = st.text_input("Domain (comma-separated)", value="1, 2, 3, 4",
                                    help="Example: 1, 2, 3, 4  (letters like a, b, c also work)")
    with col2:
        pairs_text = st.text_input("Relation (ordered pairs)", value="(1,1), (2,2), (3,3), (4,4), (1,2), (2,1)",
                                   help="Example: (1,1), (2,2), (1,2)")

    try:
        domain = parse_domain(domain_text)
        R = parse_pairs(pairs_text, domain)
    except ValueError as exc:
        st.error(f"⚠️ Input error: {exc}")
        return
    except Exception as exc:
        st.error(f"⚠️ Unexpected error while parsing: {exc}")
        return

    if not R:
        st.info("The relation is empty (it contains no ordered pairs). Results below reflect the empty relation.")

    try:
        props = analyze_relation(domain, R)
    except Exception as exc:
        st.error(f"⚠️ Could not analyze relation: {exc}")
        return

    # ---- Property results ----------------------------------------------------
    st.subheader("Property checks")
    cols = st.columns(4)
    messages = {
        "reflexive": "Missing loops",
        "symmetric": "Missing mirror pairs",
        "antisymmetric": "Violating pairs",
        "transitive": "Missing pairs for transitivity",
    }
    for col, (name, (ok, witnesses)) in zip(cols, props.items()):
        with col:
            st.metric(name.capitalize(), "✅ Yes" if ok else "❌ No")
            if not ok:
                st.caption(f"{messages[name]}: {fmt_pairs(witnesses)}")

    refl, sym, anti, trans = (props[k][0] for k in ("reflexive", "symmetric", "antisymmetric", "transitive"))

    # ---- Conclusions ----------------------------------------------------------
    st.subheader("Classification")
    if refl and sym and trans:
        st.success("✅ R is an **Equivalence Relation** (reflexive, symmetric, transitive).")
        classes = []
        for a in domain:
            cls = frozenset(b for b in domain if (a, b) in R)
            if cls not in classes:
                classes.append(cls)
        pretty = ", ".join("{" + ", ".join(map(str, sorted(c, key=str))) + "}" for c in classes)
        st.markdown(f"It partitions the domain into these **equivalence classes**: {pretty}")
    else:
        st.error("❌ R is **not** an Equivalence Relation.")

    if refl and anti and trans:
        st.success("✅ R is a **Partial Order (POSET)** (reflexive, antisymmetric, transitive).")
    else:
        st.error("❌ R is **not** a Partial Order (POSET).")

    # ---- Matrix ----------------------------------------------------------------
    st.subheader("Matrix representation")
    st.markdown("Entry `M[i][j] = 1` when `(i, j) ∈ R`, otherwise `0`. Rows = first element, columns = second.")
    st.dataframe(relation_matrix(domain, R))


# ==========================================================================
# MODULE 3 HELPERS -- GRAPHS
# ==========================================================================
def fmt_weight(w) -> str:
    """Show whole-number weights without a trailing .0"""
    return str(int(w)) if float(w).is_integer() else f"{w:.4g}"


def parse_graph(text: str):
    """
    Parse lines of 'Source Target Weight' into an undirected weighted NetworkX graph.
    Blank lines and lines starting with '#' are ignored. Returns (graph, warnings).
    """
    G = nx.Graph()
    errors, warnings = [], []
    for line_no, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) != 3:
            errors.append(f"Line {line_no}: expected 'Source Target Weight' but got '{line}'.")
            continue
        u, v, w_text = parts
        try:
            w = float(w_text)
            if not math.isfinite(w):
                raise ValueError
        except ValueError:
            errors.append(f"Line {line_no}: weight '{w_text}' is not a valid finite number.")
            continue
        if u == v:
            warnings.append(f"Line {line_no}: self-loop {u}-{v} ignored (it never helps a shortest path or MST).")
            continue
        if G.has_edge(u, v):
            if w < G[u][v]["weight"]:
                G[u][v]["weight"] = w
            warnings.append(f"Line {line_no}: duplicate edge {u}-{v}; keeping the smaller weight.")
            continue
        G.add_edge(u, v, weight=w)
    if errors:
        raise ValueError("\n".join(errors))
    if G.number_of_edges() == 0:
        raise ValueError("No edges found. Enter at least one line such as 'A B 5'.")
    return G, warnings


def draw_graph(G, pos, highlight_edges=None, highlight_nodes=None, start=None, end=None):
    """
    Draw the graph with Matplotlib. Edges in `highlight_edges` are thick and red;
    all other edges are thin and grey. Returns the figure.
    """
    highlight_edges = highlight_edges or set()
    highlight_nodes = highlight_nodes or set()

    fig, ax = plt.subplots(figsize=(8, 6))
    normal = [(u, v) for u, v in G.edges() if frozenset((u, v)) not in highlight_edges]
    special = [(u, v) for u, v in G.edges() if frozenset((u, v)) in highlight_edges]

    nx.draw_networkx_edges(G, pos, edgelist=normal, width=1.5, edge_color="#b0b0b0", ax=ax)
    nx.draw_networkx_edges(G, pos, edgelist=special, width=5, edge_color="#e63946", ax=ax)

    # Node colours: start = green, end = purple, on-solution = gold, others = light blue
    colors = []
    for n in G.nodes():
        if n == start:
            colors.append("#2a9d8f")
        elif n == end:
            colors.append("#9d4edd")
        elif n in highlight_nodes:
            colors.append("#ffb703")
        else:
            colors.append("#8ecae6")
    nx.draw_networkx_nodes(G, pos, node_color=colors, node_size=900, edgecolors="#333333", ax=ax)
    nx.draw_networkx_labels(G, pos, font_size=12, font_weight="bold", ax=ax)
    labels = {(u, v): fmt_weight(d["weight"]) for u, v, d in G.edges(data=True)}
    nx.draw_networkx_edge_labels(G, pos, edge_labels=labels, font_size=10, ax=ax,
                                 bbox=dict(boxstyle="round,pad=0.15", fc="white", ec="none", alpha=0.8))
    ax.axis("off")
    fig.tight_layout()
    return fig


# ==========================================================================
# MODULE 3 -- GRAPH ALGORITHM VISUALIZER
# ==========================================================================
def render_graph_module():
    st.header("🕸️ Graph Algorithm Visualizer")
    st.markdown(
        """
**What this does:** the edge list is converted into an **undirected weighted graph**.

- **Dijkstra's algorithm** greedily settles the unvisited vertex with the smallest known distance and
  *relaxes* its neighbours. It is correct only for **non-negative weights**.
- **Minimum Spanning Tree (Kruskal's algorithm)** sorts edges by weight and adds each one unless it would
  create a cycle (checked with union-find), producing a tree of minimum total weight that connects all vertices.
        """
    )

    default_edges = "A B 4\nA C 2\nB C 1\nB D 5\nC D 8\nC E 10\nD E 2\nD F 6\nE F 3"
    edge_text = st.text_area(
        "Weighted edges (one per line: Source Target Weight)",
        value=default_edges, height=200,
        help="Example line: A B 5. Lines starting with # are ignored. The graph is treated as undirected.",
    )

    try:
        G, warnings = parse_graph(edge_text)
    except ValueError as exc:
        st.error(f"⚠️ Input error:\n\n{exc}")
        return
    except Exception as exc:
        st.error(f"⚠️ Unexpected error while parsing graph: {exc}")
        return

    for w in warnings:
        st.warning(w)

    nodes = sorted(G.nodes(), key=str)
    c1, c2, c3 = st.columns([1, 1, 2])
    with c1:
        start = st.selectbox("Start node", nodes, index=0)
    with c2:
        end = st.selectbox("End node", nodes, index=len(nodes) - 1)
    with c3:
        view = st.radio("Visualization mode",
                        ["View Original Graph", "Highlight Shortest Path", "Highlight Minimum Spanning Tree"],
                        horizontal=True)

    # A fixed seed keeps node positions stable when the user switches views
    pos = nx.spring_layout(G, seed=42)

    # ---- Original graph --------------------------------------------------------
    if view == "View Original Graph":
        st.info(f"Graph has **{G.number_of_nodes()} vertices** and **{G.number_of_edges()} edges**.")
        fig = draw_graph(G, pos, start=start, end=end)
        st.pyplot(fig)
        plt.close(fig)

    # ---- Shortest path -----------------------------------------------------------
    elif view == "Highlight Shortest Path":
        if any(d["weight"] < 0 for _, _, d in G.edges(data=True)):
            st.error("⚠️ Dijkstra's algorithm requires non-negative edge weights. Remove negative weights and retry.")
            return
        try:
            path = nx.dijkstra_path(G, start, end, weight="weight")
            cost = nx.dijkstra_path_length(G, start, end, weight="weight")
        except nx.NetworkXNoPath:
            st.error(f"❌ No path exists between {start} and {end} (they lie in different connected components).")
            fig = draw_graph(G, pos, start=start, end=end)
            st.pyplot(fig)
            plt.close(fig)
            return
        except Exception as exc:
            st.error(f"⚠️ Could not compute shortest path: {exc}")
            return

        path_edges = {frozenset(e) for e in zip(path[:-1], path[1:])}
        left, right = st.columns([2, 1])
        with left:
            fig = draw_graph(G, pos, path_edges, set(path), start, end)
            st.pyplot(fig)
            plt.close(fig)
        with right:
            st.success(f"**Shortest path:** {' → '.join(path)}")
            st.metric("Total cost", fmt_weight(cost))
            if len(path) > 1:
                steps = pd.DataFrame(
                    [{"From": u, "To": v, "Weight": fmt_weight(G[u][v]["weight"])} for u, v in zip(path[:-1], path[1:])]
                )
                st.dataframe(steps, hide_index=True)
            else:
                st.caption("Start and end are the same vertex, so the cost is 0.")
            st.caption("🟢 start  🟣 end  🟡 on path  🔴 path edges")

    # ---- Minimum spanning tree -----------------------------------------------------
    else:
        try:
            mst = nx.minimum_spanning_tree(G, weight="weight", algorithm="kruskal")
        except Exception as exc:
            st.error(f"⚠️ Could not compute MST: {exc}")
            return

        total = sum(d["weight"] for _, _, d in mst.edges(data=True))
        if not nx.is_connected(G):
            st.warning(f"Graph has {nx.number_connected_components(G)} components, so this is a "
                       "**minimum spanning forest** (one tree per component).")

        mst_edges = {frozenset((u, v)) for u, v in mst.edges()}
        left, right = st.columns([2, 1])
        with left:
            fig = draw_graph(G, pos, mst_edges, set(mst.nodes()))
            st.pyplot(fig)
            plt.close(fig)
        with right:
            st.success("Minimum Spanning Tree computed.")
            st.metric("Total MST weight", fmt_weight(total))
            rows = sorted(({"Edge": f"{u} – {v}", "Weight": d["weight"]} for u, v, d in mst.edges(data=True)),
                          key=lambda r: r["Weight"])
            df = pd.DataFrame(rows)
            df["Weight"] = df["Weight"].map(fmt_weight)
            st.dataframe(df, hide_index=True)
            st.caption("🔴 edges in the MST")

    # ---- Matrix view (supports the 'Graphs & Matrices' syllabus topic) --------------
    with st.expander("Show adjacency matrix of the graph"):
        st.markdown("Entry `[i][j]` is `1` when there is an edge between `i` and `j`, and `∞` when there is no edge. The matrix is symmetric because the graph is undirected.")
        matrix_data = [[1 if G.has_edge(u, v) else "∞" for v in nodes] for u in nodes]
        adj = pd.DataFrame(matrix_data, index=nodes, columns=nodes)
        st.dataframe(adj)


# ==========================================================================
# MAIN -- sidebar navigation
# ==========================================================================
def main():
    st.title("🧮 Discrete Math Toolkit")
    st.sidebar.title("Navigation")
    module = st.sidebar.radio(
        "Choose a module",
        ["Logic Analyzer", "Relation Checker", "Graph Visualizer"],
    )
    st.sidebar.markdown("---")
    st.sidebar.caption("Unit I: Propositional Logic\n\nUnit II: Sets & Relations\n\nUnit III: Graph Theory")

    # The outer try/except guarantees the app never shows a raw traceback
    try:
        if module == "Logic Analyzer":
            render_logic_module()
        elif module == "Relation Checker":
            render_relation_module()
        else:
            render_graph_module()
    except Exception as exc:
        st.error(f"An unexpected error occurred: {exc}")


if __name__ == "__main__":
    main()
