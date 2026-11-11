/**
 * Weapon mastery planning — pure. Application layer applies document changes.
 */

import { isRangedAttack } from "./activity-kind.mjs";
import { MASTERY_RULES } from "../../content/masteries.mjs";

export const MASTERY_KEYS = Object.freeze(MASTERY_RULES.map((rule) => rule.id));

/**
 * @param {object|null} rule
 * @param {{ hit?: boolean, fumble?: boolean }} args
 */
export function planMasteryRule(rule, { hit = false, fumble = false } = {}) {
  if (!rule || fumble) return null;
  const key = rule.id;
  const steps = rule.do ?? [];
  if (rule.phase === "miss") {
    return hit ? null : { key, phase: "miss", effect: rule.effect, steps };
  }
  if (!hit) return null;
  return { key, phase: "hit", effect: rule.effect, steps };
}

/**
 * @param {{ mastery?: string|null, hit?: boolean, fumble?: boolean }} args
 * @returns {{ key: string, phase: "hit"|"miss", effect: string, steps: object[] }|null}
 */
export function planMastery({ mastery = null, hit = false, fumble = false } = {}) {
  const key = String(mastery ?? "").toLowerCase();
  const rule = MASTERY_RULES.find((entry) => entry.id === key) ?? null;
  return planMasteryRule(rule, { hit, fumble });
}

/** Ability modifier from a raw ability score. */
export function abilityModifier(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;
  return Math.floor((n - 10) / 2);
}

/**
 * Pick ability key for weapon damage (finesse uses higher of str/dex).
 */
export function weaponAbilityKey(item, actor) {
  const ability = item?.system?.ability;
  if (ability && ability !== "none") return ability;
  const props = item?.system?.properties;
  const finesse = props?.has?.("fin")
    || (Array.isArray(props) && props.includes("fin"))
    || props?.fin;
  const str = Number(actor?.system?.abilities?.str?.mod);
  const dex = Number(actor?.system?.abilities?.dex?.mod);
  if (finesse) {
    if (!Number.isFinite(str)) return "dex";
    if (!Number.isFinite(dex)) return "str";
    return dex >= str ? "dex" : "str";
  }
  return isRangedAttack(null, item) ? "dex" : "str";
}
