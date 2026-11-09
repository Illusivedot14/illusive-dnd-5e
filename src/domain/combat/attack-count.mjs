import { MODULE_ID } from "../../constants.mjs";

const PROJECTILE_CANTRIPS = new Set([
  "eldritch-blast",
  "eldritch blast"
]);

function itemKey(item) {
  return String(item?.system?.identifier ?? item?.identifier ?? item?.name ?? "")
    .trim()
    .toLowerCase();
}

function evaluateFormula(raw, actor) {
  if (raw == null || raw === "") return null;
  if (Number.isFinite(Number(raw)) && Number(raw) > 0) return Math.floor(Number(raw));

  const text = String(raw).trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);

  const RollCls = globalThis.Roll;
  if (!RollCls) {
    const leading = text.match(/^(\d+)/);
    return leading ? Number(leading[1]) : null;
  }

  try {
    const data = actor?.getRollData?.() ?? {};
    const roll = new RollCls(text, data);
    if (typeof roll.evaluateSync === "function") roll.evaluateSync();
    else roll.evaluate?.({ async: false });
    const total = Number(roll.total);
    return Number.isFinite(total) && total > 0 ? Math.floor(total) : null;
  } catch {
    const leading = text.match(/^(\d+)/);
    return leading ? Number(leading[1]) : null;
  }
}

function actorLevel(actor) {
  const details = actor?.system?.details ?? {};
  const level = Number(details.level ?? details.cr ?? 0);
  return Number.isFinite(level) ? level : 0;
}

/** 5e cantrip extra beams: 2 at 5th, 3 at 11th, 4 at 17th. */
export function getCantripProjectileCount(actor, item) {
  if (item?.type !== "spell") return 1;
  if ((Number(item.system?.level) || 0) !== 0) return 1;
  if (!PROJECTILE_CANTRIPS.has(itemKey(item))) return 1;

  const level = actorLevel(actor);
  if (level >= 17) return 4;
  if (level >= 11) return 3;
  if (level >= 5) return 2;
  return 1;
}

function extraAttackFromName(name) {
  const text = String(name ?? "");
  if (!/extra\s*attack/i.test(text) && !/^extra-attack$/i.test(text)) return 0;
  const numbered = text.match(/(\d+)/);
  if (numbered) return Math.max(1, Number(numbered[1]));
  return 1;
}

/** Extra swings granted by Extra Attack (not counting the first attack). */
export function getExtraAttackBonus(actor) {
  let bonus = 0;
  for (const item of actor?.items ?? []) {
    const fromId = extraAttackFromName(item?.system?.identifier ?? item?.identifier);
    const fromName = extraAttackFromName(item?.name);
    bonus = Math.max(bonus, fromId, fromName);
  }
  return bonus;
}

/** How many weapon attacks the Attack action should make. */
export function getWeaponAttackCount(actor) {
  return 1 + getExtraAttackBonus(actor);
}

export function getWeaponSwingsUsed(actor) {
  return Math.max(0, Number(actor?.getFlag?.(MODULE_ID, "weaponSwings") ?? 0) || 0);
}

export async function addWeaponSwings(actor, count = 1) {
  if (!actor?.setFlag) return;
  const next = getWeaponSwingsUsed(actor) + Math.max(0, Number(count) || 0);
  await actor.setFlag(MODULE_ID, "weaponSwings", next);
}

export function remainingWeaponAttacks(actor, budget = null) {
  if (budget) {
    if ((budget.attacks?.granted ?? 0) > 0) {
      return Math.max(0, budget.attacks.granted - budget.attacks.used);
    }
    if ((budget.action ?? 0) > 0) return getWeaponAttackCount(actor);
    return 0;
  }
  return Math.max(0, getWeaponAttackCount(actor) - getWeaponSwingsUsed(actor));
}

/**
 * How many people this use wants. Formula on the activity wins;
 * Eldritch Blast scales by level; weapons use remaining Extra Attack swings.
 */
export function getAbilityAttackCount(actor, item, activity, budget = null) {
  const raw = activity?.target?.affects?.count
    ?? activity?.target?.value
    ?? item?.system?.target?.affects?.count
    ?? item?.system?.target?.value;
  const fromFormula = evaluateFormula(raw, actor);
  if (fromFormula && fromFormula > 1) return fromFormula;

  if (item?.type === "spell") {
    return Math.max(fromFormula ?? 1, getCantripProjectileCount(actor, item));
  }

  if (item?.type === "weapon" || activity?.type === "attack") {
    return Math.max(1, remainingWeaponAttacks(actor, budget));
  }

  return fromFormula ?? 1;
}

/** One activity use that should hit several people (Eldritch Blast, Scorching Ray). */
export function isSingleUseMultiHit(item, activity) {
  if (item?.type === "spell") return true;
  if (activity?.type === "cast") return true;
  return false;
}

/** Repeat the same weapon/attack activity once per Extra Attack swing. */
export function isRepeatedWeaponAttack(item, activity) {
  if (item?.type === "spell" || activity?.type === "cast") return false;
  return item?.type === "weapon" || activity?.type === "attack";
}

export function padTargetUuids(uuids, count) {
  const list = (uuids ?? []).filter(Boolean);
  if (!list.length || count <= list.length) return list;
  const padded = [...list];
  while (padded.length < count) padded.push(list[0]);
  return padded;
}
