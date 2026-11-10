/**
 * Declarations — rules as data.
 *
 *   {
 *     id: "blur",                       unique per source
 *     label?: "Blur",
 *     rule?: "spell.blur",             citation id (rules catalog)
 *     on: "attackDeclared" | [...],    moment ids (domain/triggers/moments.mjs)
 *     mode?: "passive" | "soft" | "hard",
 *       passive  — runs by itself when the condition holds
 *       soft     — offered as a reaction prompt, nothing waits
 *       hard     — offered as a reaction prompt, the triggering action waits
 *     cost?: "reaction",               prompted modes spend the reaction
 *     selfTrigger?: true,               prompted: the triggering creature may react to itself
 *     offer?: "meleeWeapons",           prompted: offer these activities instead of the source item's
 *     if?: condition,                   (domain/triggers/conditions.mjs)
 *     range?: feet,                     self ↔ triggering creature
 *     sight?: true,                     self must see the triggering creature
 *     once?: "turn" | "round",
 *     edition?: "2014" | "2024",
 *     do: [ { step, to?, ...params } ]  (domain/triggers/steps.mjs)
 *   }
 *
 * A prompted declaration's steps run when the reaction is used: hard ones when
 * the paused action resumes, soft ones before the offered activity. A prompted
 * declaration may have no steps; the offered activity is then the whole effect.
 */

import { isMoment } from "./moments.mjs";
import { conditionErrors } from "./conditions.mjs";
import { stepErrors } from "./steps.mjs";

export const MODES = Object.freeze(["passive", "soft", "hard"]);
export const OFFERS = Object.freeze(["meleeWeapons"]);
const ONCE = new Set(["turn", "round"]);

export function normalizeDeclaration(decl = {}) {
  return {
    ...decl,
    on: Array.isArray(decl.on) ? [...decl.on] : (decl.on ? [decl.on] : []),
    mode: decl.mode ?? "passive",
    do: Array.isArray(decl.do) ? decl.do : []
  };
}

/** @returns {string[]} problems; empty when the declaration is valid */
export function declarationErrors(raw) {
  if (!raw || typeof raw !== "object") return ["declaration must be an object"];
  const decl = normalizeDeclaration(raw);
  const errors = [];
  const where = decl.id ? `"${decl.id}"` : "declaration";
  if (!decl.id || typeof decl.id !== "string") errors.push(`${where}: needs an id`);
  if (!decl.on.length) errors.push(`${where}: needs "on"`);
  for (const m of decl.on) if (!isMoment(m)) errors.push(`${where}: unknown moment "${m}"`);
  if (!MODES.includes(decl.mode)) errors.push(`${where}: unknown mode "${decl.mode}"`);
  if (decl.once != null && !ONCE.has(decl.once)) errors.push(`${where}: "once" must be "turn" or "round"`);
  if (decl.range != null && !(Number(decl.range) >= 0)) errors.push(`${where}: "range" must be feet`);
  if (decl.edition != null && !["2014", "2024"].includes(String(decl.edition))) {
    errors.push(`${where}: "edition" must be "2014" or "2024"`);
  }
  if (decl.offer != null && !OFFERS.includes(decl.offer)) errors.push(`${where}: unknown offer "${decl.offer}"`);
  if (decl.mode === "passive" && (decl.offer != null || decl.selfTrigger != null)) {
    errors.push(`${where}: "offer" and "selfTrigger" apply to prompted modes only`);
  }
  if (decl.mode === "passive" && !decl.do.length) errors.push(`${where}: needs at least one step in "do"`);
  decl.do.forEach((step, i) => errors.push(...stepErrors(step, `${where}.do[${i}]`)));
  errors.push(...conditionErrors(decl.if, `${where}.if`));
  return errors;
}

export function isValidDeclaration(raw) {
  return declarationErrors(raw).length === 0;
}

export function listensTo(decl, momentId) {
  return normalizeDeclaration(decl).on.includes(momentId);
}

/** Key for once-per-turn bookkeeping. */
export function onceKey(round, turnIndex, scope = "turn") {
  return scope === "round" ? `r${round}` : `r${round}:t${turnIndex}`;
}
