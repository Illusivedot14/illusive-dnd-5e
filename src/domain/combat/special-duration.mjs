/**
 * Special effect durations — expire when a combat event fires.
 */

export const SPECIAL_DURATION_FLAG = "specialDuration";

/** @type {readonly string[]} */
export const SPECIAL_DURATIONS = Object.freeze([
  "turnStart",
  "turnEnd",
  "currentTurnEnd",   // expires when the turn in progress ends, whoever's it is
  "turnStartSource",  // expires when the creature that applied it starts its turn
  "turnEndSource",    // expires when the creature that applied it ends its turn
  "nextAttack",       // expires after this actor attacks
  "isAttacked",       // expires after this actor is attacked (hit or miss)
  "isDamaged",        // expires after this actor takes damage
  "shortRest",
  "longRest",
  "combatEnd"
]);

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeSpecialDurations(raw) {
  const list = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
  return list
    .map((v) => String(v))
    .filter((v) => SPECIAL_DURATIONS.includes(v));
}

/**
 * Effects on actor that should expire for the given event.
 * @param {object} actor
 * @param {string} event
 * @param {string} [moduleId="illusive-dnd-5e"]
 * @returns {object[]}
 */
export function listEffectsExpiringOn(actor, event, moduleId = "illusive-dnd-5e", { sourceUuid = null } = {}) {
  const out = [];
  for (const effect of actor?.effects ?? []) {
    if (effect.disabled) continue;
    const durations = normalizeSpecialDurations(
      effect.flags?.[moduleId]?.[SPECIAL_DURATION_FLAG]
    );
    if (!durations.includes(event)) continue;
    if (sourceUuid && !isEffectFromSource(effect, sourceUuid)) continue;
    out.push(effect);
  }
  return out;
}

/**
 * True when the effect's origin is the source actor or something it owns.
 * @param {object} effect
 * @param {string} sourceUuid  Actor UUID
 */
export function isEffectFromSource(effect, sourceUuid) {
  const origin = effect?.origin;
  if (!origin || !sourceUuid) return false;
  return origin === sourceUuid || origin.startsWith(`${sourceUuid}.`);
}
