/**
 * Step values: a number, or a formula with @references ("5 * @sourceLevel",
 * "max(1, @abilities.cha.mod + @classes.warlock.levels)", "2d8 + @mod").
 *
 * Dice go to Foundry's Roll; the arithmetic-only fallback here keeps
 * deterministic formulas working without a canvas (tests, headless).
 */

const REF = /@([a-zA-Z_][\w.-]*)/g;
const DICE = /\d*d\d+/i;

function dig(data, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), data);
}

/** Replace @refs with numbers (unknown → 0). */
export function substituteRefs(formula, data = {}) {
  return String(formula).replace(REF, (_, path) => {
    const raw = dig(data, path);
    const value = typeof raw === "object" && raw != null ? (raw.value ?? raw.total ?? raw.mod) : raw;
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : "0";
  });
}

export function hasDice(formula) {
  return DICE.test(String(formula));
}

const FUNCS = {
  max: Math.max,
  min: Math.min,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  abs: Math.abs
};

/**
 * Evaluate + - * / ( ) and max/min/floor/ceil/round/abs over numbers.
 * @returns {number|null} null when the expression is not plain arithmetic
 */
export function evaluateArithmetic(expr) {
  const src = String(expr);
  let i = 0;
  const peek = () => {
    while (src[i] === " ") i += 1;
    return src[i];
  };
  const fail = () => { throw new Error("bad formula"); };

  function primary() {
    const c = peek();
    if (c === "(") {
      i += 1;
      const v = sum();
      if (peek() !== ")") fail();
      i += 1;
      return v;
    }
    if (c === "-") { i += 1; return -primary(); }
    if (c === "+") { i += 1; return primary(); }
    const num = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (num) { i += num[0].length; return Number(num[0]); }
    const name = /^[a-z]+/i.exec(src.slice(i));
    if (name && FUNCS[name[0].toLowerCase()]) {
      i += name[0].length;
      if (peek() !== "(") fail();
      i += 1;
      const args = [sum()];
      while (peek() === ",") { i += 1; args.push(sum()); }
      if (peek() !== ")") fail();
      i += 1;
      return FUNCS[name[0].toLowerCase()](...args);
    }
    return fail();
  }
  function product() {
    let v = primary();
    for (;;) {
      const c = peek();
      if (c === "*") { i += 1; v *= primary(); } else if (c === "/") { i += 1; v /= primary(); } else return v;
    }
  }
  function sum() {
    let v = product();
    for (;;) {
      const c = peek();
      if (c === "+") { i += 1; v += product(); } else if (c === "-") { i += 1; v -= product(); } else return v;
    }
  }
  try {
    const v = sum();
    if (peek() !== undefined) return null;
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
