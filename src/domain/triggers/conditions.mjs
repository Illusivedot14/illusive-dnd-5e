/**
 * Structured trigger conditions — data, never eval.
 *
 *   { "activity.isMelee": true }                    equality
 *   { "self.hp.temp": { gt: 0 } }                   operators
 *   { "trigger.creatureType": { in: ["fiend"] } }
 *   { "self.effects": { has: "blur" } }             list / Set membership
 *   { all: [...] } { any: [...] } { not: {...} }    composition
 *
 * Several keys in one object must all hold. A fact the provider does not know
 * (undefined) makes its test false, so a typo never fires a rule —
 * except { exists: false }, which asks exactly that.
 */

export const CONDITION_OPS = Object.freeze([
  "eq", "ne", "gt", "gte", "lt", "lte", "in", "has", "hasAny", "exists"
]);

const COMBINATORS = new Set(["all", "any", "not"]);

function asList(value) {
  if (value instanceof Set) return [...value];
  if (Array.isArray(value)) return value;
  return null;
}

function norm(v) {
  return typeof v === "string" ? v.toLowerCase() : v;
}

function testOp(op, actual, expected) {
  if (op === "exists") return (actual !== undefined && actual !== null) === Boolean(expected);
  if (actual === undefined) return false;
  switch (op) {
    case "eq": return norm(actual) === norm(expected);
    case "ne": return norm(actual) !== norm(expected);
    case "gt": return Number(actual) > Number(expected);
    case "gte": return Number(actual) >= Number(expected);
    case "lt": return Number(actual) < Number(expected);
    case "lte": return Number(actual) <= Number(expected);
    case "in": return (asList(expected) ?? []).map(norm).includes(norm(actual));
    case "has": {
      const list = asList(actual);
      return Boolean(list && list.map(norm).includes(norm(expected)));
    }
    case "hasAny": {
      const list = (asList(actual) ?? []).map(norm);
      return (asList(expected) ?? []).some((x) => list.includes(norm(x)));
    }
    default: return false;
  }
}

function testFact(actual, expected) {
  if (expected && typeof expected === "object" && !Array.isArray(expected)) {
    const ops = Object.entries(expected);
    if (!ops.length) return false;
    return ops.every(([op, value]) => CONDITION_OPS.includes(op) && testOp(op, actual, value));
  }
  if (actual === undefined) return false;
  return norm(actual) === norm(expected);
}

/**
 * @param {object|null|undefined} condition
 * @param {(path: string) => unknown} get  fact lookup
 */
export function evaluateCondition(condition, get) {
  if (condition == null) return true;
  if (typeof condition !== "object" || Array.isArray(condition)) return false;
  const entries = Object.entries(condition);
  if (!entries.length) return true;
  return entries.every(([key, value]) => {
    if (key === "all") return (asList(value) ?? []).every((c) => evaluateCondition(c, get));
    if (key === "any") return (asList(value) ?? []).some((c) => evaluateCondition(c, get));
    if (key === "not") return !evaluateCondition(value, get);
    return testFact(get(key), value);
  });
}

/** Fact paths a condition reads (validation, documentation). */
export function conditionPaths(condition, out = new Set()) {
  if (!condition || typeof condition !== "object") return out;
  for (const [key, value] of Object.entries(condition)) {
    if (COMBINATORS.has(key)) {
      const list = key === "not" ? [value] : (asList(value) ?? []);
      for (const c of list) conditionPaths(c, out);
    } else {
      out.add(key);
    }
  }
  return out;
}

/** Problems in a condition (unknown operators, malformed combinators). */
export function conditionErrors(condition, path = "if") {
  const errors = [];
  if (condition == null) return errors;
  if (typeof condition !== "object" || Array.isArray(condition)) {
    return [`${path}: must be an object`];
  }
  for (const [key, value] of Object.entries(condition)) {
    if (key === "all" || key === "any") {
      if (!Array.isArray(value)) errors.push(`${path}.${key}: must be a list`);
      else value.forEach((c, i) => errors.push(...conditionErrors(c, `${path}.${key}[${i}]`)));
    } else if (key === "not") {
      errors.push(...conditionErrors(value, `${path}.not`));
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const op of Object.keys(value)) {
        if (!CONDITION_OPS.includes(op)) errors.push(`${path}.${key}: unknown operator "${op}"`);
      }
    }
  }
  return errors;
}
