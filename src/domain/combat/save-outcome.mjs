/**
 * Saving throw vs DC and damage/effect gating (pure).
 * Mirrors DAS Core / dnd5e save activity semantics.
 */

const ON_SAVE_FACTOR = Object.freeze({
  none: 0,
  half: 0.5,
  full: 1
});

/**
 * @param {{ total: number|null|undefined, dc: number|null|undefined, autoFail?: boolean, autoSuccess?: boolean }} input
 */
export function evaluateSaveVsDc(input = {}) {
  if (input.autoFail) {
    return { success: false, reason: "auto-fail" };
  }
  if (input.autoSuccess) {
    return { success: true, reason: "auto-success" };
  }

  const total = Number(input.total);
  const dc = Number(input.dc);
  if (!Number.isFinite(total)) {
    return { success: false, reason: "no-total" };
  }
  if (!Number.isFinite(dc)) {
    return { success: true, reason: "no-dc" };
  }
  if (total >= dc) {
    return { success: true, reason: "saved" };
  }
  return { success: false, reason: "failed" };
}

/**
 * Fraction of rolled damage applied after a save.
 * @param {{ saved: boolean, onSave?: "none"|"half"|"full"|string }} input
 */
export function damageFactorOnSave(input = {}) {
  if (!input.saved) return 1;
  const key = String(input.onSave ?? "half").toLowerCase();
  return Object.prototype.hasOwnProperty.call(ON_SAVE_FACTOR, key)
    ? ON_SAVE_FACTOR[key]
    : 0.5;
}

/**
 * Whether an activity effect profile applies for this save result.
 * dnd5e `effects[].onSave === true` means the effect still applies on a success.
 * @param {{ saved: boolean, effectOnSave?: boolean }} input
 */
export function shouldApplyEffectOnSave(input = {}) {
  if (!input.saved) return true;
  return Boolean(input.effectOnSave);
}

/**
 * Scale a non-negative damage total by a factor (round down).
 * @param {number} value
 * @param {number} factor
 */
export function scaleDamageTotal(value, factor) {
  const n = Number(value);
  const f = Number(factor);
  if (!Number.isFinite(n) || n === 0) return 0;
  if (!Number.isFinite(f) || f <= 0) return 0;
  if (f >= 1) return Math.trunc(n);
  return Math.floor(Math.abs(n) * f) * Math.sign(n);
}
