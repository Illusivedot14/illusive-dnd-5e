/**
 * Condition status sets shared by reactions, OA, auras, and roll modifiers.
 */

/** Conditions that include Incapacitated (no actions or reactions). */
export const INCAPACITATING_STATUSES = Object.freeze([
  "incapacitated",
  "unconscious",
  "paralyzed",
  "petrified",
  "stunned"
]);

/** Defender conditions that grant attackers advantage. */
export const DEFENDER_GRANTS_ADVANTAGE = Object.freeze([
  "restrained",
  "paralyzed",
  "stunned",
  "unconscious",
  "petrified"
]);

export function hasAnyStatus(actor, statuses) {
  const set = actor?.statuses;
  if (!set?.has) return false;
  return statuses.some((s) => set.has(s));
}

export function isIncapacitated(actor) {
  return hasAnyStatus(actor, INCAPACITATING_STATUSES);
}
