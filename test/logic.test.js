import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeLogic,
  buildTruthTable,
  classify,
  LogicParseError,
  parseLogic,
  tokenize,
} from "../src/logic.js";

test("tokenizer accepts every operator spelling", () => {
  assert.deepEqual(tokenize("p -> q"), ["p", "->", "q"]);
  assert.deepEqual(tokenize("p and not q"), ["p", "and", "not", "q"]);
  assert.deepEqual(tokenize("(p|q)^r"), ["(", "p", "|", "q", ")", "^", "r"]);
});

test("tokenizer rejects unknown characters instead of evaluating them", () => {
  assert.throws(() => tokenize("p $ q"), LogicParseError);
  assert.throws(() => tokenize("__import__('os')"), LogicParseError);
});

test("parser reports malformed expressions", () => {
  for (const bad of ["p & & (q", "(p & q", "p &", "& q", ""]) {
    assert.throws(() => parseLogic(bad), LogicParseError, `expected '${bad}' to fail`);
  }
});

test("precedence is ~ > & > ^ > | > -> > <->", () => {
  assert.equal(parseLogic("~p & q").expr.type, "and");
  assert.equal(parseLogic("p & q ^ r").expr.type, "xor");
  assert.equal(parseLogic("p ^ q | r").expr.type, "or");
  assert.equal(parseLogic("p | q -> r").expr.type, "implies");
  assert.equal(parseLogic("p -> q <-> r").expr.type, "iff");
});

test("implication is right-associative", () => {
  // a -> b -> c must parse as a -> (b -> c)
  const { expr } = parseLogic("p -> q -> r");
  assert.equal(expr.type, "implies");
  assert.equal(expr.right.type, "implies");
});

test("truth table starts all-True and has 2^n rows", () => {
  const { expr } = parseLogic("p & q");
  const { rows } = buildTruthTable([expr], ["p", "q"]);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0].values, [true, true]);
  assert.deepEqual(rows[3].values, [false, false]);
  assert.deepEqual(rows.map((r) => r.results[0]), [true, false, false, false]);
});

test("classify distinguishes tautology, contradiction and contingency", () => {
  assert.match(classify([true, true]), /Tautology/);
  assert.match(classify([false, false]), /Contradiction/);
  assert.match(classify([true, false]), /Contingency/);
});

test("material implication: p -> q is equivalent to ~p | q", () => {
  const result = analyzeLogic({ expr1: "p -> q", expr2: "~p | q" });
  assert.equal(result.equivalent, true);
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.counterExample, null);
  assert.deepEqual(result.variables, ["p", "q"]);
});

test("De Morgan, contrapositive and distributive laws all hold", () => {
  const laws = [
    ["~(p & q)", "~p | ~q"],
    ["~(p | q)", "~p & ~q"],
    ["p -> q", "~q -> ~p"],
    ["p & (q | r)", "(p & q) | (p & r)"],
    ["p <-> q", "(p -> q) & (q -> p)"],
    ["p ^ q", "(p | q) & ~(p & q)"],
  ];
  for (const [a, b] of laws) {
    assert.equal(analyzeLogic({ expr1: a, expr2: b }).equivalent, true, `${a} == ${b}`);
  }
});

test("converse is not equivalent, and a counter-example is produced", () => {
  const result = analyzeLogic({ expr1: "p -> q", expr2: "q -> p" });
  assert.equal(result.equivalent, false);
  assert.equal(result.mismatchCount, 2);
  const { assignment, e1, e2 } = result.counterExample;
  assert.equal(assignment.length, 2);
  assert.notEqual(e1, e2);
});

test("tautologies and contradictions are labelled", () => {
  const result = analyzeLogic({ expr1: "p | ~p", expr2: "p & ~p" });
  assert.match(result.classification[0], /Tautology/);
  assert.match(result.classification[1], /Contradiction/);
  assert.equal(result.parsed[0].dnf, "True");
  assert.equal(result.parsed[1].dnf, "False");
});

test("normal forms are correct and minimised", () => {
  const xor = analyzeLogic({ expr1: "p ^ q", expr2: "p ^ q" }).parsed[0];
  assert.equal(xor.dnf, "(p & ~q) | (~p & q)");
  assert.equal(xor.cnf, "(p | q) & (~p | ~q)");

  // A redundant formula must collapse: p | (p & q) is just p.
  assert.equal(analyzeLogic({ expr1: "p | (p & q)", expr2: "p" }).parsed[0].dnf, "p");
});

test("constants are accepted", () => {
  assert.equal(analyzeLogic({ expr1: "p | ~p", expr2: "True" }).equivalent, true);
  assert.equal(analyzeLogic({ expr1: "1", expr2: "0" }).equivalent, false);
  assert.equal(analyzeLogic({ expr1: "1", expr2: "0" }).rowCount, 1);
});

test("the variable limit is enforced", () => {
  const eight = "a & b & c & d & e & f & g & h";
  assert.equal(analyzeLogic({ expr1: eight, expr2: eight }).rowCount, 256);
  assert.throws(() => analyzeLogic({ expr1: `${eight} & i`, expr2: "p" }), /Too many variables/);
});
