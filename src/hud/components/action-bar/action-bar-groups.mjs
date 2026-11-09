import { illusiveDnd } from "../../../i18n/index.mjs";
import { getAbilityKey, getFavorites } from "./action-bar-prefs.mjs";
import { buildSpellSlotDiamondsForLevel } from "../../../foundry/actor-resources.mjs";

function spellLevelLabel(level) {
  if (level === 0) return illusiveDnd.actionBar("groupCantrips");
  return illusiveDnd.actionBar("groupSpellLevel", { level });
}

function spellLevelFromGroupId(groupId) {
  if (!groupId?.startsWith("spell-")) return null;
  const level = Number(groupId.slice("spell-".length));
  return Number.isFinite(level) ? level : null;
}

/**
 * Spell-slot diamonds for a leveled spell group.
 * Filled = remaining/available, hollow = used/expended (matches economy gems).
 * Falls back to the shared pact pool when this level has no prepared slots.
 */
export function buildSpellSlotDiamonds(actor, level) {
  return buildSpellSlotDiamondsForLevel(actor, level);
}

function groupIdForAbility(ability, actor) {
  if (ability.isStandard) return "standard-actions";
  if (ability.isFree || ["special", "free", "none"].includes(ability.activationType)) return "free";
  const item = actor?.items?.get(ability.itemId);
  if (!item) return "other";

  if (item.type === "spell") {
    const level = item.system?.level ?? 0;
    return `spell-${level}`;
  }
  if (item.type === "weapon") return "weapons";
  if (item.type === "feat") return "feats";
  if (item.type === "consumable") return "consumables";
  return "features";
}

function groupLabel(groupId, actor) {
  const labels = {
    "standard-actions": illusiveDnd.actionBar("groupStandard"),
    free: illusiveDnd.actionBar("groupFree"),
    interactions: illusiveDnd.actionBar("groupInteractions"),
    weapons: illusiveDnd.actionBar("groupWeapons"),
    feats: illusiveDnd.actionBar("groupFeats"),
    consumables: illusiveDnd.actionBar("groupConsumables"),
    features: illusiveDnd.actionBar("groupFeatures"),
    other: illusiveDnd.actionBar("groupOther"),
    favorites: illusiveDnd.actionBar("groupFavorites")
  };
  if (groupId.startsWith("spell-")) {
    return spellLevelLabel(Number(groupId.split("-")[1]) || 0);
  }
  return labels[groupId] ?? groupId;
}

function sortGroupIds(ids) {
  const spell = ids.filter((id) => id.startsWith("spell-")).sort((a, b) => {
    return Number(a.split("-")[1]) - Number(b.split("-")[1]);
  });
  const rest = ["favorites", "standard-actions", "free", "interactions", "weapons", "feats", "consumables", "features", "other"];
  return [...rest.filter((id) => ids.includes(id)), ...spell, ...ids.filter((id) => !rest.includes(id) && !id.startsWith("spell-"))];
}

/**
 * @param {object[]} abilities
 * @param {Actor} actor
 * @param {string} sectionId
 */
export function buildAbilityGroups(abilities, actor, sectionId) {
  const favorites = getFavorites(actor);
  const enriched = abilities.map((ability) => {
    const key = getAbilityKey(ability);
    return { ...ability, abilityKey: key, isFavorite: favorites.has(key) };
  });

  const buckets = new Map();
  for (const ability of enriched) {
    let groupId = groupIdForAbility(ability, actor);
    if (sectionId === "standard" && !ability.isStandard && groupId !== "free") {
      groupId = "interactions";
    }
    if (!buckets.has(groupId)) buckets.set(groupId, []);
    buckets.get(groupId).push(ability);
  }

  const favoriteAbilities = enriched.filter((a) => a.isFavorite);
  if (favoriteAbilities.length) {
    buckets.set("favorites", favoriteAbilities);
  }

  const groupIds = sortGroupIds([...buckets.keys()]);
  const hideHeaders = groupIds.length <= 1;
  return groupIds.map((id) => {
    const spellLevel = spellLevelFromGroupId(id);
    const spellSlots = spellLevel != null ? buildSpellSlotDiamonds(actor, spellLevel) : null;
    return {
      id,
      label: groupLabel(id, actor),
      showHeader: !hideHeaders,
      spellSlots,
      abilities: buckets.get(id) ?? []
    };
  });
}
