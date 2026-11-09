/**
 * Pure classification of dnd5e items / activities (no Foundry globals).
 */

/** Activities on an item: array / Collection / iterable / values(). */
export function listActivities(item) {
  const acts = item?.system?.activities;
  if (!acts) return [];
  if (Array.isArray(acts)) return acts.filter(Boolean);
  if (acts.contents) return [...acts.contents].filter(Boolean);
  if (typeof acts[Symbol.iterator] === "function") {
    try { return [...acts].filter(Boolean); } catch { /* fall through */ }
  }
  if (typeof acts.values === "function") {
    try { return [...acts.values()].filter(Boolean); } catch { /* fall through */ }
  }
  return Object.values(acts).filter((a) => a && typeof a === "object");
}

function attackTypeValue(activity, item) {
  return activity?.attack?.type?.value ?? item?.system?.actionType ?? null;
}

export function isRangedWeapon(item) {
  const t = item?.system?.type?.value;
  return item?.system?.actionType === "rwak" || t === "simpleR" || t === "martialR";
}

export function isRangedAttack(activity, item) {
  const t = attackTypeValue(activity, item);
  if (t === "rwak" || t === "rsak" || t === "ranged") return true;
  return !activity?.attack?.type?.value && isRangedWeapon(item);
}

export function isMeleeAttack(activity, item) {
  const t = attackTypeValue(activity, item);
  if (t === "mwak" || t === "msak" || t === "melee") return true;
  if (t === "rwak" || t === "rsak" || t === "ranged") return false;
  if (item?.type === "weapon") {
    if (isRangedWeapon(item)) return false;
    const type = item.system?.type?.value ?? item.system?.weaponType;
    return !type || /melee|simpleM|martialM/i.test(String(type));
  }
  return false;
}

/** @returns {"melee"|"ranged"|null} */
export function attackKind(activity, item) {
  if (isRangedAttack(activity, item)) return "ranged";
  if (isMeleeAttack(activity, item)) return "melee";
  return null;
}

/** Spell item, cast activity, or feature that casts a linked spell. */
export function isSpellUse(item, activity = null) {
  if (item?.type === "spell") return true;
  if (activity?.type === "cast") return true;
  if (item?.system?.linkedSpell) return true;
  return listActivities(item).some((a) => a?.type === "cast");
}

/** Primary activity Illusive drives for a spell (save/attack first, then template utility). */
export function pickPrimarySpellActivity(activities = [], { includeTemplateUtility = true } = {}) {
  return activities.find((a) => a.type === "save" || a.type === "attack")
    ?? (includeTemplateUtility
      ? activities.find((a) => a.type === "utility" && a?.target?.template?.type)
      : null)
    ?? activities.find((a) => a.canUse !== false)
    ?? activities[0]
    ?? null;
}

/** Main damage type of a weapon/item (first damage part); bonus damage (Rage, Graze) uses it. */
export function primaryDamageType(item, fallback = "bludgeoning") {
  const base = item?.system?.damage?.base?.types;
  if (base) {
    const first = base instanceof Set ? [...base][0] : Array.isArray(base) ? base[0] : null;
    if (first) return first;
  }
  const parts = item?.system?.damage?.parts;
  if (Array.isArray(parts) && parts.length) {
    const first = parts[0];
    if (Array.isArray(first)) return first[1] ?? fallback;
    if (typeof first === "string") return first;
  }
  return fallback;
}

const ELEMENTAL = new Set(["acid", "cold", "fire", "lightning", "thunder"]);
const PHYSICAL = new Set(["bludgeoning", "piercing", "slashing"]);

export function isElementalType(type) {
  return ELEMENTAL.has(String(type ?? "").toLowerCase());
}

export function isPhysicalType(type) {
  return PHYSICAL.has(String(type ?? "").toLowerCase());
}
