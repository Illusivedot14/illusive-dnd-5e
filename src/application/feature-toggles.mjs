/**
 * Combat feature toggles — Reckless, GWM, Sharpshooter, and auto hit riders
 * like Colossus Slayer / Divine Fury.
 */

import { MODULE_ID } from "../constants.mjs";
import { isRangedAttack } from "../domain/combat/activity-kind.mjs";

const TOGGLE_FLAG = "featureToggles";

export function readFeatureToggles(actor) {
  try {
    return {
      reckless: Boolean(actor?.getFlag?.(MODULE_ID, TOGGLE_FLAG)?.reckless),
      greatWeaponMaster: Boolean(actor?.getFlag?.(MODULE_ID, TOGGLE_FLAG)?.greatWeaponMaster),
      sharpshooter: Boolean(actor?.getFlag?.(MODULE_ID, TOGGLE_FLAG)?.sharpshooter)
    };
  } catch {
    return { reckless: false, greatWeaponMaster: false, sharpshooter: false };
  }
}

export async function setFeatureToggle(actor, key, value) {
  if (!actor?.setFlag) return null;
  const current = readFeatureToggles(actor);
  current[key] = Boolean(value);
  await actor.setFlag(MODULE_ID, TOGGLE_FLAG, current);
  return current;
}

/** Actor owns Reckless Attack feature. */
export function hasRecklessAttack(actor) {
  return [...(actor?.items ?? [])].some((i) => {
    const id = i.system?.identifier ?? "";
    return id === "reckless-attack" || /reckless\s*attack/i.test(i.name ?? "");
  });
}

export function hasGreatWeaponMaster(actor) {
  return [...(actor?.items ?? [])].some((i) => {
    const id = i.system?.identifier ?? "";
    return id === "great-weapon-master" || /great\s*weapon\s*master/i.test(i.name ?? "");
  });
}

export function hasSharpshooter(actor) {
  return [...(actor?.items ?? [])].some((i) => {
    const id = i.system?.identifier ?? "";
    return id === "sharpshooter" || /^sharpshooter$/i.test(i.name ?? "");
  });
}

/**
 * Attack modifiers from active toggles.
 * Reckless → adv; GWM/SS → -5 to hit (damage handled separately).
 */
export function collectToggleAttackModifiers(actor, item = null) {
  const toggles = readFeatureToggles(actor);
  const reasons = [];
  let advantage = false;
  let attackBonus = 0;
  let damageBonus = 0;

  if (toggles.reckless && hasRecklessAttack(actor)) {
    advantage = true;
    reasons.push("reckless");
  }

  const isMeleeHeavy = item?.system?.properties?.has?.("hvy")
    || item?.system?.properties?.hvy
    || (Array.isArray(item?.system?.properties)
      ? item.system.properties.includes("hvy")
      : false)
    || item?.system?.actionType === "mwak";

  const isRanged = isRangedAttack(null, item);

  if (toggles.greatWeaponMaster && hasGreatWeaponMaster(actor) && isMeleeHeavy) {
    attackBonus -= 5;
    damageBonus += 10;
    reasons.push("gwm");
  }
  if (toggles.sharpshooter && hasSharpshooter(actor) && isRanged) {
    attackBonus -= 5;
    damageBonus += 10;
    reasons.push("sharpshooter");
  }

  return { advantage, attackBonus, damageBonus, reasons, toggles };
}

/**
 * Extra once-per-turn damage riders (Colossus Slayer, Divine Fury).
 */
export function listPassiveHitRiders(actor) {
  const out = [];
  for (const item of actor?.items ?? []) {
    const id = item.system?.identifier ?? "";
    const name = item.name ?? "";
    if (id === "colossus-slayer" || /colossus\s*slayer/i.test(name)) {
      out.push({ id: "colossus-slayer", item, formula: "1d8", oncePerTurn: true });
    }
    if (id === "divine-fury" || /divine\s*fury/i.test(name)) {
      const level = Number(actor.system?.details?.level) || 1;
      out.push({
        id: "divine-fury",
        item,
        formula: `1d6+${Math.max(1, Math.floor(level / 2))}`,
        type: "radiant",
        oncePerTurn: true
      });
    }
  }
  return out;
}

export function wasPassiveRiderUsed(actor, riderId) {
  try {
    const used = actor?.getFlag?.(MODULE_ID, "passiveRidersUsed") ?? {};
    return Boolean(used[riderId]);
  } catch {
    return false;
  }
}

export async function markPassiveRiderUsed(actor, riderId) {
  if (!actor?.setFlag) return;
  const used = { ...(actor.getFlag?.(MODULE_ID, "passiveRidersUsed") ?? {}), [riderId]: true };
  await actor.setFlag(MODULE_ID, "passiveRidersUsed", used);
}

export async function clearPassiveRidersUsed(actor) {
  if (!actor?.unsetFlag) return;
  try {
    await actor.unsetFlag(MODULE_ID, "passiveRidersUsed");
  } catch {
    /* ignore */
  }
}
