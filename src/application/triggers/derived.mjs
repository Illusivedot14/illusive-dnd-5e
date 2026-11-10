/**
 * Values declarations read that dnd5e keeps in scale tables, class data or
 * description text, plus the activity lists prompted declarations can offer.
 *
 * Exposed to step formulas as @bardicDie, @superiorityDie, @monkLevel,
 * @parryBonus and @slotLevel.
 */

import { listActivities, isMeleeAttack } from "../../domain/combat/activity-kind.mjs";

function rollData(actor) {
  try {
    return typeof actor?.getRollData === "function" ? actor.getRollData() : (actor?.system ?? {});
  } catch {
    return {};
  }
}

function dieFromScale(entry) {
  const die = entry?.formula ?? entry?.die ?? (typeof entry === "string" ? entry : null);
  if (!die) return null;
  return String(die).startsWith("d") ? `1${die}` : String(die);
}

export function bardicDie(actor) {
  const scale = rollData(actor)?.scale?.bard ?? actor?.system?.scale?.bard ?? {};
  return dieFromScale(scale["bardic-inspiration"] ?? scale.inspiration ?? scale["bardic-die"]) ?? "1d6";
}

export function superiorityDie(actor) {
  const scale = rollData(actor)?.scale ?? {};
  for (const group of [scale["battle-master"], scale.fighter, scale["combat-superiority"]]) {
    const die = dieFromScale(group?.["combat-superiority-die"] ?? group?.["superiority-die"] ?? group?.die);
    if (die) return die;
  }
  return "1d8";
}

export function monkLevel(actor) {
  const fromClasses = actor?.classes?.monk?.system?.levels;
  const fromData = rollData(actor)?.classes?.monk?.levels;
  return Number(fromClasses ?? fromData) || 0;
}

/** Monster Parry: "adds N to its AC"; else proficiency bonus (2014 stat blocks). */
export function parryBonus(actor, item) {
  const text = String(item?.system?.description?.value ?? "");
  const m = /adds?\s*(\d+)\s*to\s*(?:its|their|his|her)\s*AC/i.exec(text);
  return m ? Number(m[1]) : (Number(actor?.system?.attributes?.prof) || 2);
}

/** The first item whose name matches `pattern` and that tracks uses (Superiority Dice). */
export function usesItem(actor, pattern) {
  const re = new RegExp(pattern, "i");
  return [...(actor?.items ?? [])].find((i) => re.test(String(i?.name ?? ""))
    && Number(i.system?.uses?.max) > 0) ?? null;
}

/** Remaining uses on that item, or null when the actor has none. */
export function usesLeft(actor, pattern) {
  const item = usesItem(actor, pattern);
  if (!item) return null;
  const uses = item.system.uses;
  return Number(uses.value ?? (Number(uses.max) - (Number(uses.spent) || 0))) || 0;
}

/** Equipped melee weapon attacks (Retaliation, Riposte). */
export function meleeWeaponAttacks(actor) {
  const out = [];
  for (const item of actor?.items ?? []) {
    if (item.type !== "weapon") continue;
    if (item.system?.equipped === false) continue;
    for (const act of listActivities(item)) {
      if (act?.type !== "attack" || !isMeleeAttack(act, item)) continue;
      act.item = item;
      out.push(act);
    }
  }
  return out;
}

export const OFFER_ACTIVITIES = Object.freeze({
  meleeWeapons: meleeWeaponAttacks
});

/** Activities an `offer` declaration puts in the prompt. */
export function offeredActivities(offer, actor) {
  return OFFER_ACTIVITIES[offer]?.(actor) ?? [];
}

/** Roll-data additions for one declaration's formulas. */
export function derivedRollData(actor, entry, ctx = {}) {
  return {
    bardicDie: bardicDie(actor),
    superiorityDie: superiorityDie(actor),
    monkLevel: monkLevel(actor),
    parryBonus: parryBonus(actor, entry?.item),
    slotLevel: Number(ctx.slotLevel) || Number(entry?.item?.system?.level) || 1
  };
}
