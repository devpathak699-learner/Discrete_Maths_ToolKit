import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeRelation,
  convertToken,
  parseDomain,
  parsePairs,
  RelationInputError,
} from "../src/relations.js";

test("numeric elements are normalised so the domain and the pairs agree", () => {
  assert.equal(convertToken(" 3 "), "3");
  assert.equal(convertToken("03"), "3");
  assert.equal(convertToken("-2"), "-2");
  assert.equal(convertToken(" a "), "a");
  assert.deepEqual(parseDomain("1, 2, 2, 3"), ["1", "2", "3"]);
});

test("an empty domain is rejected", () => {
  assert.throws(() => parseDomain("   "), RelationInputError);
  assert.throws(() => parseDomain(",,"), RelationInputError);
});

test("pairs must be well formed and inside the domain", () => {
  const domain = parseDomain("1, 2, 3");
  assert.deepEqual(parsePairs("(1,2), (2,3)", domain), [["1", "2"], ["2", "3"]]);
  assert.deepEqual(parsePairs("", domain), []);
  assert.throws(() => parsePairs("(1,9)", domain), /not in the domain/);
  assert.throws(() => parsePairs("hello", domain), /Could not understand/);
  assert.throws(() => parsePairs("(1,2) oops", domain), /Could not understand/);
});

test("duplicate pairs are collapsed", () => {
  const domain = parseDomain("1, 2");
  assert.deepEqual(parsePairs("(1,2),(1,2)", domain), [["1", "2"]]);
});

test("the identity relation is both an equivalence relation and a POSET", () => {
  const r = analyzeRelation({ domain: "1, 2, 3", pairs: "(1,1),(2,2),(3,3)" });
  assert.equal(r.isEquivalence, true);
  assert.equal(r.isPoset, true);
  for (const name of ["reflexive", "symmetric", "antisymmetric", "transitive"]) {
    assert.equal(r.properties[name].ok, true, name);
  }
  assert.deepEqual(r.equivalenceClasses, [["1"], ["2"], ["3"]]);
});

test("equivalence relation reports its equivalence classes", () => {
  const r = analyzeRelation({
    domain: "1, 2, 3, 4",
    pairs: "(1,1), (2,2), (3,3), (4,4), (1,2), (2,1)",
  });
  assert.equal(r.isEquivalence, true);
  assert.equal(r.isPoset, false); // (1,2) and (2,1) break antisymmetry
  assert.deepEqual(r.equivalenceClasses, [["1", "2"], ["3"], ["4"]]);
});

test("the divides relation on {1,2,3,4} is a POSET but not an equivalence", () => {
  const r = analyzeRelation({
    domain: "1, 2, 3, 4",
    pairs: "(1,1),(2,2),(3,3),(4,4),(1,2),(1,3),(1,4),(2,4)",
  });
  assert.equal(r.isPoset, true);
  assert.equal(r.isEquivalence, false);
  assert.equal(r.properties.symmetric.ok, false);
});

test("failures name the witnesses that explain them", () => {
  const r = analyzeRelation({ domain: "1, 2, 3", pairs: "(1,2),(2,3)" });
  assert.equal(r.properties.reflexive.ok, false);
  assert.equal(r.properties.reflexive.witnesses, "(1, 1), (2, 2), (3, 3)");
  assert.equal(r.properties.symmetric.witnesses, "(2, 1), (3, 2)");
  assert.equal(r.properties.transitive.witnesses, "(1, 3)");
  assert.equal(r.properties.antisymmetric.ok, true);
});

test("the empty relation is symmetric, antisymmetric and transitive but not reflexive", () => {
  const r = analyzeRelation({ domain: "1, 2", pairs: "" });
  assert.equal(r.empty, true);
  assert.equal(r.properties.reflexive.ok, false);
  assert.equal(r.properties.symmetric.ok, true);
  assert.equal(r.properties.antisymmetric.ok, true);
  assert.equal(r.properties.transitive.ok, true);
  assert.equal(r.isEquivalence, false);
});

test("the full relation on a 2-element set is an equivalence with one class", () => {
  const r = analyzeRelation({ domain: "1, 2", pairs: "(1,1),(1,2),(2,1),(2,2)" });
  assert.equal(r.isEquivalence, true);
  assert.deepEqual(r.equivalenceClasses, [["1", "2"]]);
  assert.deepEqual(r.matrix, [[1, 1], [1, 1]]);
});

test("the matrix marks exactly the pairs of the relation", () => {
  const r = analyzeRelation({ domain: "a, b, c", pairs: "(a,b),(b,c)" });
  assert.deepEqual(r.matrix, [[0, 1, 0], [0, 0, 1], [0, 0, 0]]);
});

test("non-numeric labels work the same as numbers", () => {
  const r = analyzeRelation({ domain: "x, y", pairs: "(x,x),(y,y),(x,y),(y,x)" });
  assert.equal(r.isEquivalence, true);
});
