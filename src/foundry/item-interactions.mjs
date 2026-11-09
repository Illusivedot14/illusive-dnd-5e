const FREE_ACTIVATIONS = new Set(["special", "free", "none"]);
const INTERACTION_ITEM_TYPES = new Set(["consumable", "tool", "loot", "container"]);
const INTERACTION_ACTIVITY_TYPES = new Set(["utilize", "check", "forward", "activate"]);

/** Activation types that never spend A/B/R (free / special). */
export function isFreeActivation(activationType) {
  return FREE_ACTIVATIONS.has(String(activationType ?? "").toLowerCase());
}

/** Items/tools/consumables that belong on the suitcase tab as item uses. */
export function isItemInteractionEntry(item, activity, activationType) {
  if (!item || item.type === "spell") return false;
  if (isFreeActivation(activationType)) return false;
  if (activity && INTERACTION_ACTIVITY_TYPES.has(activity.type)) {
    return INTERACTION_ITEM_TYPES.has(item.type) || item.type === "equipment";
  }
  if (item.type === "consumable" && activationType === "action") return true;
  if (item.type === "tool" && (activationType === "action" || activationType === "bonus")) return true;
  return false;
}

/** Suitcase entry: free/special activation or item interaction. */
export function isSuitcaseEntry(item, activity, activationType) {
  return isFreeActivation(activationType) || isItemInteractionEntry(item, activity, activationType);
}

export function getInteractionActivationTypes() {
  return new Set(["action", "bonus", "special", "free", "none", ""]);
}
