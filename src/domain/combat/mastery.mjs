/**
 * Weapon mastery planning — pure. Application layer applies document changes.
 */

import { isRangedAttack } from "./activity-kind.mjs";

export const MASTERY_KEYS = Object.freeze([
  "cleave", "graze", "nick", "push", "sap", "slow", "topple", "vex"
]);

/**
 * @param {{ mastery?: string|null, hit?: boolean, fumble?: boolean }} args
 * @returns {{ key: string, phase: "hit"|"miss", effect: string }|null}
 */
export function planMastery({ mastery = null, hit = false, fumble = false } = {}) {
  const key = String(mastery ?? "").toLowerCase();
  if (!MASTERY_KEYS.includes(key)) return null;
  if (fumble) return null;

  if (key === "graze") {
    return hit ? null : { key, phase: "miss", effect: "abilityModDamage" };
  }
  if (!hit) return null;

  const effects = {
    cleave: "extraAdjacentAttack",
    nick: "lightAttackAsAttackAction",
    push: "push10",
    sap: "disadvantageNextAttack",
    slow: "reduceSpeed10",
    topple: "conSaveOrProne",
    vex: "advantageNextAttackVsTarget"
  };
  return { key, phase: "hit", effect: effects[key] };
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
