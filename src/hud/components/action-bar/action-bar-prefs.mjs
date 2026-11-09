import { MODULE_ID } from "../../../constants.mjs";

const FLAG = "actionBarPrefs";

const DEFAULTS = {
  favorites: []
};

function prefs(actor) {
  return foundry.utils.mergeObject(DEFAULTS, actor?.getFlag(MODULE_ID, FLAG) ?? {}, { inplace: false });
}

export function getAbilityKey(ability) {
  return `${ability.itemId}:${ability.activityId}:${ability.isStandard ? "standard" : ability.section}`;
}

export function getFavorites(actor) {
  return new Set(prefs(actor).favorites);
}
