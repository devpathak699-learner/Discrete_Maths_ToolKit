/**
 * MODULE 2 -- SETS & RELATIONS
 * ==============================================================
 * A relation R on a set A is a subset of A x A. This module parses a domain
 * and a list of ordered pairs, then tests the defining properties directly:
 *
 *   Reflexive      every a satisfies (a, a) in R
 *   Symmetric      (a, b) in R  =>  (b, a) in R
 *   Antisymmetric  (a, b) in R and (b, a) in R  =>  a = b
 *   Transitive     (a, b) in R and (b, c) in R  =>  (a, c) in R
 *
 * Equivalence relation = reflexive + symmetric + transitive.
 * Partial order (POSET) = reflexive + antisymmetric + transitive.
 *
 * Every failing property also reports the "witnesses" that explain the
 * failure, so a result is a proof sketch rather than a bare yes/no.
 */

export class RelationInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "RelationInputError";
  }
}

const PAIR_RE = /\(\s*([^,()]+?)\s*,\s*([^,()]+?)\s*\)/g;

/** Unambiguous lookup key for an ordered pair (elements may contain anything). */
const key = (a, b) => JSON.stringify([a, b]);

/** Compare two element labels as strings, for stable display ordering. */
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Normalise one element so that '3', ' 3 ' and '03' all denote the same
 * element, while non-numeric labels keep their exact text.
 */
export function convertToken(token) {
  const trimmed = String(token).trim().replace(/^['"]|['"]$/g, "");
  if (/^[+-]?\d+$/.test(trimmed)) return String(Number(trimmed));
  return trimmed;
}

/** Parse '1, 2, 3' into an ordered, de-duplicated list of elements. */
export function parseDomain(text) {
  const items = String(text ?? "")
    .split(",")
    .filter((t) => t.trim() !== "")
    .map(convertToken);
  if (items.length === 0) {
    throw new RelationInputError(
      "The domain is empty. Enter comma-separated elements, e.g. 1, 2, 3."
    );
  }
  return [...new Set(items)]; // preserves order, removes duplicates
}

/** Parse '(1,1), (1,2)' into a list of pairs, validating against the domain. */
export function parsePairs(text, domain) {
  const source = String(text ?? "");

  // Anything left after removing every well-formed pair is a syntax error.
  const leftover = source.replace(PAIR_RE, "");
  if (leftover.replace(/,/g, "").trim() !== "") {
    throw new RelationInputError(
      `Could not understand part of the relation: '${leftover.trim()}'. Use the form (a,b), (c,d).`
    );
  }

  const allowed = new Set(domain);
  const seen = new Set();
  const pairs = [];
  for (const match of source.matchAll(PAIR_RE)) {
    const a = convertToken(match[1]);
    const b = convertToken(match[2]);
    for (const x of [a, b]) {
      if (!allowed.has(x)) {
        throw new RelationInputError(
          `Element '${x}' in pair (${a}, ${b}) is not in the domain.`
        );
      }
    }
    if (seen.has(key(a, b))) continue;
    seen.add(key(a, b));
    pairs.push([a, b]);
  }
  return pairs;
}

/** Pretty-print a collection of ordered pairs in a stable order. */
export function formatPairs(pairs) {
  const ordered = [...pairs].sort((p, q) => (p[0] === q[0] ? cmp(p[1], q[1]) : cmp(p[0], q[0])));
  return ordered.length > 0 ? ordered.map(([a, b]) => `(${a}, ${b})`).join(", ") : "none";
}

/**
 * Test all four properties. For each, report whether it holds plus the
 * witnesses: the pairs that are missing, or the pairs that violate it.
 */
export function analyzeProperties(domain, pairs) {
  const inR = new Set(pairs.map(([a, b]) => key(a, b)));
  const has = (a, b) => inR.has(key(a, b));

  const reflexiveMissing = domain.filter((a) => !has(a, a)).map((a) => [a, a]);
  const symmetricMissing = pairs.filter(([a, b]) => !has(b, a)).map(([a, b]) => [b, a]);
  const antisymmetricViolations = pairs.filter(([a, b]) => a !== b && has(b, a));

  // (a,b) and (b,c) both in R but (a,c) missing.
  const transitiveMissing = [];
  const transitiveSeen = new Set();
  for (const [a, b] of pairs) {
    for (const [c, d] of pairs) {
      if (b !== c || has(a, d)) continue;
      if (transitiveSeen.has(key(a, d))) continue;
      transitiveSeen.add(key(a, d));
      transitiveMissing.push([a, d]);
    }
  }

  return {
    reflexive: { ok: reflexiveMissing.length === 0, witnesses: reflexiveMissing },
    symmetric: { ok: symmetricMissing.length === 0, witnesses: symmetricMissing },
    antisymmetric: {
      ok: antisymmetricViolations.length === 0,
      witnesses: antisymmetricViolations,
    },
    transitive: { ok: transitiveMissing.length === 0, witnesses: transitiveMissing },
  };
}

/** Boolean (0/1) adjacency matrix: row a, column b is 1 iff (a,b) in R. */
export function relationMatrix(domain, pairs) {
  const inR = new Set(pairs.map(([a, b]) => key(a, b)));
  return domain.map((a) => domain.map((b) => (inR.has(key(a, b)) ? 1 : 0)));
}

/** The equivalence classes [a] = { b : (a,b) in R }, de-duplicated. */
export function equivalenceClasses(domain, pairs) {
  const inR = new Set(pairs.map(([a, b]) => key(a, b)));
  const classes = [];
  const seen = new Set();
  for (const a of domain) {
    const members = domain.filter((b) => inR.has(key(a, b))).sort(cmp);
    const id = JSON.stringify(members);
    if (seen.has(id)) continue;
    seen.add(id);
    classes.push(members);
  }
  return classes;
}

// --------------------------------------------------------------------------
// Public entry point used by the HTTP API
// --------------------------------------------------------------------------
export function analyzeRelation({ domain: domainText = "", pairs: pairsText = "" } = {}) {
  const domain = parseDomain(domainText);
  const pairs = parsePairs(pairsText, domain);
  const properties = analyzeProperties(domain, pairs);

  const { reflexive, symmetric, antisymmetric, transitive } = properties;
  const isEquivalence = reflexive.ok && symmetric.ok && transitive.ok;
  const isPoset = reflexive.ok && antisymmetric.ok && transitive.ok;

  const describe = (p) => ({ ok: p.ok, witnesses: formatPairs(p.witnesses) });

  return {
    domain,
    pairs,
    pairCount: pairs.length,
    empty: pairs.length === 0,
    properties: {
      reflexive: describe(reflexive),
      symmetric: describe(symmetric),
      antisymmetric: describe(antisymmetric),
      transitive: describe(transitive),
    },
    isEquivalence,
    equivalenceClasses: isEquivalence ? equivalenceClasses(domain, pairs) : [],
    isPoset,
    matrix: relationMatrix(domain, pairs),
  };
}
