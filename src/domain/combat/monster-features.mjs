/**
 * Monster / NPC feature helpers (pure).
 * Stock dnd5e packs: monsterfeatures24 + embedded NPC items (feat/weapon).
 */

const MONSTER_FEAT_TYPES = new Set(["monster", "natural"]);
const COMBAT_ACTIVITY_TYPES = new Set([
  "attack", "save", "damage", "heal", "cast", "summon", "forward"
]);

/**
 * True when the item is a monster/natural feature or natural weapon.
 * @param {object|null} item
 */
export function isMonsterFeatureItem(item) {
  if (!item) return false;
  if (item.type === "weapon") {
    const weaponType = item.system?.type?.value ?? item.system?.weaponType ?? null;
    return weaponType === "natural" || Boolean(item.system?.type?.nested);
  }
  if (item.type !== "feat") return false;
  const featType = item.system?.type?.value ?? item.system?.type ?? null;
  return MONSTER_FEAT_TYPES.has(String(featType ?? "").toLowerCase());
}

/**
 * Default activation when the activity/item leaves activation blank.
 * Combat activities → action; other monster utilities → special.
 * @returns {"action"|"special"|null}
 */
export function defaultActivationForMonsterActivity(item, activity) {
  if (!item && !activity) return null;
  const activityType = activity?.type ?? null;
  if (item?.type === "weapon" || activityType === "attack") return "action";
  if (COMBAT_ACTIVITY_TYPES.has(activityType)) return "action";
  if (isMonsterFeatureItem(item)) return "special";
  return null;
}

/**
 * Whether an NPC should surface this special activation under Action
 * (instead of only the suitcase Items gem).
 */
export function monsterSpecialShowsUnderAction(item, activationType) {
  if (String(activationType ?? "").toLowerCase() !== "special") return false;
  return isMonsterFeatureItem(item);
}
