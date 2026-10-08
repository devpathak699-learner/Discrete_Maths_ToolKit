/**
 * MODULE 1 -- PROPOSITIONAL LOGIC
 * ==============================================================
 * A safe tokeniser + recursive-descent parser for Boolean expressions,
 * an exhaustive truth-table evaluator, and a Quine-McCluskey minimiser
 * that produces simplified DNF / CNF normal forms.
 *
 * Nothing here uses eval(): user text is tokenised and any unknown
 * character is rejected, so arbitrary code can never be executed.
 *
 * Precedence (high -> low):
 *     ~ (NOT) > & (AND) > ^ (XOR) > | (OR) > -> (IMPLIES) > <-> (IFF)
 */

export class LogicParseError extends Error {
  constructor(message) {
    super(message);
    this.name = "LogicParseError";
  }
}

/** Every accepted spelling of an operator maps to one canonical symbol. */
const OPERATOR_ALIASES = {
  "&": "&", "&&": "&", and: "&", "∧": "&",
  "|": "|", "||": "|", or: "|", "∨": "|",
  "~": "~", "!": "~", not: "~", "¬": "~",
  "^": "^", xor: "^", "⊕": "^",
  "->": "->", "=>": "->", ">>": "->", implies: "->", "→": "->",
  "<->": "<->", "<=>": "<->", iff: "<->", "↔": "<->",
};

/** Sticky regex: matches optional whitespace then exactly one token. */
const TOKEN_RE =
  /\s*(<->|<=>|->|=>|>>|&&|\|\||&|\||\^|~|!|\(|\)|[A-Za-z_][A-Za-z0-9_]*|[01]|[∧∨¬→↔⊕])/y;

/** Split the expression into tokens; reject any unknown character. */
export function tokenize(text) {
  const tokens = [];
  const source = String(text ?? "").trim();
  let pos = 0;
  while (pos < source.length) {
    TOKEN_RE.lastIndex = pos;
    const match = TOKEN_RE.exec(source);
    if (!match) {
      const bad = source.slice(pos).trim()[0] ?? source[pos];
      throw new LogicParseError(`Unexpected character '${bad}' in expression.`);
    }
    tokens.push(match[1]);
    pos = TOKEN_RE.lastIndex;
  }
  return tokens;
}

// --- AST node constructors -------------------------------------------------
const VAR = (name) => ({ type: "var", name });
const CONST = (value) => ({ type: "const", value });
const NOT = (arg) => ({ type: "not", arg });
const BIN = (type, left, right) => ({ type, left, right });

/** Recursive-descent parser turning tokens into an expression tree. */
class LogicParser {
  constructor(text) {
    this.tokens = tokenize(text);
    this.i = 0;
    this.variables = new Set();
    if (this.tokens.length === 0) throw new LogicParseError("Expression is empty.");
  }

  /** Current token, normalised through the alias table. */
  peek() {
    if (this.i >= this.tokens.length) return null;
    const tok = this.tokens[this.i];
    return OPERATOR_ALIASES[tok.toLowerCase()] ?? tok;
  }

  advance() {
    const tok = this.peek();
    this.i += 1;
    return tok;
  }

  parse() {
    const expr = this.parseIff();
    if (this.i !== this.tokens.length) {
      throw new LogicParseError(
        `Unexpected token '${this.tokens[this.i]}'. Check your parentheses/operators.`
      );
    }
    return { expr, variables: this.variables };
  }

  parseIff() {
    let left = this.parseImplies();
    while (this.peek() === "<->") {
      this.advance();
      left = BIN("iff", left, this.parseImplies());
    }
    return left;
  }

  parseImplies() {
    const left = this.parseOr();
    if (this.peek() === "->") {
      // right-associative: a -> b -> c  ==  a -> (b -> c)
      this.advance();
      return BIN("implies", left, this.parseImplies());
    }
    return left;
  }

  parseOr() {
    let left = this.parseXor();
    while (this.peek() === "|") {
      this.advance();
      left = BIN("or", left, this.parseXor());
    }
    return left;
  }

  parseXor() {
    let left = this.parseAnd();
    while (this.peek() === "^") {
      this.advance();
      left = BIN("xor", left, this.parseAnd());
    }
    return left;
  }

  parseAnd() {
    let left = this.parseNot();
    while (this.peek() === "&") {
      this.advance();
      left = BIN("and", left, this.parseNot());
    }
    return left;
  }

  parseNot() {
    if (this.peek() === "~") {
      this.advance();
      return NOT(this.parseNot());
    }
    return this.parseAtom();
  }

  parseAtom() {
    const tok = this.peek();
    if (tok === null) {
      throw new LogicParseError("Expression ended unexpectedly (missing operand?).");
    }
    if (tok === "(") {
      this.advance();
      const inner = this.parseIff();
      if (this.peek() !== ")") throw new LogicParseError("Missing closing parenthesis ')'.");
      this.advance();
      return inner;
    }
    if (["&", "|", "^", "->", "<->", ")"].includes(tok)) {
      throw new LogicParseError(`Operator '${tok}' is missing an operand.`);
    }
    this.advance();
    if (tok === "1" || tok.toLowerCase() === "true") return CONST(true);
    if (tok === "0" || tok.toLowerCase() === "false") return CONST(false);
    this.variables.add(tok);
    return VAR(tok);
  }
}

/** Public helper: returns { expr, variables }. */
export function parseLogic(text) {
  return new LogicParser(text).parse();
}

/** Evaluate the tree against an assignment object { p: true, q: false }. */
export function evaluate(node, env) {
  switch (node.type) {
    case "const": return node.value;
    case "var": {
      const v = env[node.name];
      if (typeof v !== "boolean") {
        throw new Error(`Variable '${node.name}' has no truth value assigned.`);
      }
      return v;
    }
    case "not": return !evaluate(node.arg, env);
    case "and": return evaluate(node.left, env) && evaluate(node.right, env);
    case "or": return evaluate(node.left, env) || evaluate(node.right, env);
    case "xor": return evaluate(node.left, env) !== evaluate(node.right, env);
    case "implies": return !evaluate(node.left, env) || evaluate(node.right, env);
    case "iff": return evaluate(node.left, env) === evaluate(node.right, env);
    default: throw new Error(`Unknown node type '${node.type}'.`);
  }
}

// --------------------------------------------------------------------------
// Pretty printing the parsed tree
// --------------------------------------------------------------------------
const PRECEDENCE = { or: 1, xor: 2, and: 3, not: 4, var: 5, const: 5, implies: 5, iff: 5 };

/** Render the parsed expression back to text, adding parentheses only where needed. */
export function formatExpr(node) {
  switch (node.type) {
    case "const": return node.value ? "True" : "False";
    case "var": return node.name;
    case "not": return `~${wrap(node.arg, PRECEDENCE.not)}`;
    case "and": return `${wrap(node.left, PRECEDENCE.and)} & ${wrap(node.right, PRECEDENCE.and)}`;
    case "xor": return `${wrap(node.left, PRECEDENCE.xor)} ^ ${wrap(node.right, PRECEDENCE.xor)}`;
    case "or": return `${wrap(node.left, PRECEDENCE.or)} | ${wrap(node.right, PRECEDENCE.or)}`;
    case "implies": return `Implies(${formatExpr(node.left)}, ${formatExpr(node.right)})`;
    case "iff": return `Equivalent(${formatExpr(node.left)}, ${formatExpr(node.right)})`;
    default: return "?";
  }
}

function wrap(node, parentPrecedence) {
  const text = formatExpr(node);
  return PRECEDENCE[node.type] < parentPrecedence ? `(${text})` : text;
}

// --------------------------------------------------------------------------
// Truth tables
// --------------------------------------------------------------------------
/**
 * Enumerate all 2^n assignments (all-True first, matching the usual textbook
 * ordering) and evaluate every supplied expression on each row.
 *
 * Returns { variables, rows }, where each row is
 *   { index: <minterm index>, values: [bool...], results: [bool...] }.
 */
export function buildTruthTable(expressions, variables) {
  const n = variables.length;
  const total = 2 ** n;
  const rows = [];
  for (let step = 0; step < total; step += 1) {
    // step 0 => all True, so count downwards: bit (n-1-i) of `index` is variables[i].
    const index = total - 1 - step;
    const values = [];
    const env = Object.create(null);
    for (let i = 0; i < n; i += 1) {
      const value = Boolean((index >> (n - 1 - i)) & 1);
      values.push(value);
      env[variables[i]] = value;
    }
    rows.push({ index, values, results: expressions.map((e) => evaluate(e, env)) });
  }
  return { variables, rows };
}

/** Tautology / contradiction / contingency check for one truth-table column. */
export function classify(column) {
  if (column.every(Boolean)) return "Tautology (always True)";
  if (!column.some(Boolean)) return "Contradiction (always False)";
  return "Contingency (sometimes True, sometimes False)";
}

// --------------------------------------------------------------------------
// Quine-McCluskey minimisation -> simplified DNF and CNF
// --------------------------------------------------------------------------
/**
 * An implicant is { value, mask }: `mask` marks the "care" bits and `value`
 * holds their required truth values. It covers every minterm m with
 * (m & mask) === (value & mask).
 */
function primeImplicants(minterms, n) {
  const full = (1 << n) - 1;
  let current = new Map(minterms.map((m) => [`${m}/${full}`, { value: m, mask: full }]));
  const primes = new Map();

  while (current.size > 0) {
    const next = new Map();
    const combined = new Set();
    const items = [...current.values()];
    for (let a = 0; a < items.length; a += 1) {
      for (let b = a + 1; b < items.length; b += 1) {
        const x = items[a];
        const y = items[b];
        if (x.mask !== y.mask) continue;
        const diff = (x.value ^ y.value) & x.mask;
        // Combinable only when they differ in exactly one care bit.
        if (diff === 0 || (diff & (diff - 1)) !== 0) continue;
        const mask = x.mask & ~diff;
        const merged = { value: x.value & mask, mask };
        next.set(`${merged.value}/${merged.mask}`, merged);
        combined.add(`${x.value}/${x.mask}`);
        combined.add(`${y.value}/${y.mask}`);
      }
    }
    for (const [key, item] of current) {
      if (!combined.has(key)) primes.set(key, item);
    }
    current = next;
  }
  return [...primes.values()];
}

/** Pick a small set of prime implicants that together cover every minterm. */
function coverMinterms(primes, minterms) {
  const covers = new Map(
    primes.map((p) => [p, new Set(minterms.filter((m) => (m & p.mask) === (p.value & p.mask)))])
  );
  const remaining = new Set(minterms);
  const chosen = [];

  // 1. Essential prime implicants: the sole cover of some minterm.
  for (const m of minterms) {
    const owners = primes.filter((p) => covers.get(p).has(m));
    if (owners.length === 1 && !chosen.includes(owners[0])) chosen.push(owners[0]);
  }
  for (const p of chosen) for (const m of covers.get(p)) remaining.delete(m);

  // 2. Greedily add whichever implicant covers the most of what is left.
  while (remaining.size > 0) {
    let best = null;
    let bestCount = 0;
    for (const p of primes) {
      if (chosen.includes(p)) continue;
      let count = 0;
      for (const m of remaining) if (covers.get(p).has(m)) count += 1;
      if (count > bestCount) {
        bestCount = count;
        best = p;
      }
    }
    if (!best) break;
    chosen.push(best);
    for (const m of covers.get(best)) remaining.delete(m);
  }
  return chosen;
}

/** Turn one implicant into literals, e.g. [{ name: 'p', positive: false }]. */
function implicantLiterals(implicant, variables) {
  const n = variables.length;
  const literals = [];
  for (let i = 0; i < n; i += 1) {
    const bit = 1 << (n - 1 - i);
    if ((implicant.mask & bit) === 0) continue;
    literals.push({ name: variables[i], positive: (implicant.value & bit) !== 0 });
  }
  return literals;
}

/** Simplified disjunctive normal form: an OR of ANDs over the True rows. */
export function toDNF(column, variables, rows) {
  const n = variables.length;
  const minterms = rows.filter((_, i) => column[i]).map((r) => r.index);
  if (minterms.length === 0) return "False";
  if (minterms.length === 2 ** n) return "True";

  const chosen = coverMinterms(primeImplicants(minterms, n), minterms);
  const terms = chosen
    .map((p) =>
      implicantLiterals(p, variables)
        .map((l) => (l.positive ? l.name : `~${l.name}`))
        .join(" & ")
    )
    .sort();
  if (terms.length === 1) return terms[0];
  return terms.map((t) => (t.includes("&") ? `(${t})` : t)).join(" | ");
}

/**
 * Simplified conjunctive normal form: an AND of ORs. Obtained by minimising
 * the complement of the function and negating the result (De Morgan).
 */
export function toCNF(column, variables, rows) {
  const n = variables.length;
  const zeros = rows.filter((_, i) => !column[i]).map((r) => r.index);
  if (zeros.length === 0) return "True";
  if (zeros.length === 2 ** n) return "False";

  const chosen = coverMinterms(primeImplicants(zeros, n), zeros);
  const clauses = chosen
    .map((p) =>
      implicantLiterals(p, variables)
        // Negating an AND of literals yields an OR of flipped literals.
        .map((l) => (l.positive ? `~${l.name}` : l.name))
        .join(" | ")
    )
    .sort();
  if (clauses.length === 1) return clauses[0];
  return clauses.map((c) => (c.includes("|") ? `(${c})` : c)).join(" & ");
}

// --------------------------------------------------------------------------
// Public entry point used by the HTTP API
// --------------------------------------------------------------------------
export const MAX_VARIABLES = 8;

/**
 * Parse both expressions, build the shared truth table and report whether the
 * statements are logically equivalent (identical columns in every row).
 */
export function analyzeLogic({ expr1 = "", expr2 = "" } = {}) {
  const first = parseLogic(expr1);
  const second = parseLogic(expr2);

  const variables = [...new Set([...first.variables, ...second.variables])].sort();
  if (variables.length > MAX_VARIABLES) {
    throw new LogicParseError(
      `Too many variables (${variables.length}). Please use at most ${MAX_VARIABLES} ` +
        `(${2 ** MAX_VARIABLES} rows).`
    );
  }

  const { rows } = buildTruthTable([first.expr, second.expr], variables);
  const col1 = rows.map((r) => r.results[0]);
  const col2 = rows.map((r) => r.results[1]);

  const tableRows = rows.map((r, i) => ({
    values: r.values,
    e1: col1[i],
    e2: col2[i],
    match: col1[i] === col2[i],
  }));

  const mismatches = tableRows.filter((r) => !r.match);
  let counterExample = null;
  if (mismatches.length > 0) {
    const bad = mismatches[0];
    counterExample = {
      assignment: variables.map((name, i) => ({ name, value: bad.values[i] })),
      e1: bad.e1,
      e2: bad.e2,
    };
  }

  return {
    variables,
    parsed: [
      {
        pretty: formatExpr(first.expr),
        dnf: toDNF(col1, variables, rows),
        cnf: toCNF(col1, variables, rows),
      },
      {
        pretty: formatExpr(second.expr),
        dnf: toDNF(col2, variables, rows),
        cnf: toCNF(col2, variables, rows),
      },
    ],
    rows: tableRows,
    classification: [classify(col1), classify(col2)],
    equivalent: mismatches.length === 0,
    rowCount: tableRows.length,
    mismatchCount: mismatches.length,
    counterExample,
  };
}
