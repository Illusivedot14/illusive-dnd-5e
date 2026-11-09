/**
 * Over-time effect catalog — turn-start / turn-end damage & saves.
 *
 * Effects carry `flags.illusive-dnd-5e.overTime`.
 */

export const OVERTIME_FLAG = "overTime";

/**
 * @typedef {object} OverTimeSpec
 * @property {"start"|"end"} turn
 * @property {string} [damageFormula]
 * @property {string} [damageType]
 * @property {string} [saveAbility]
 * @property {number|string} [saveDc]
 * @property {"half"|"none"|"full"} [onSave]
 * @property {string} [label]
 */

/**
 * Normalize an Illusive overTime flag object.
 * @param {object} raw
 * @returns {OverTimeSpec|null}
 */
export function normalizeOverTime(raw) {
  if (!raw || typeof raw !== "object") return null;
  const turn = raw.turn === "end" ? "end" : raw.turn === "start" ? "start" : null;
  if (!turn) return null;
  return {
    turn,
    damageFormula: raw.damageFormula || raw.damageRoll || null,
    damageType: raw.damageType || null,
    saveAbility: raw.saveAbility || null,
    saveDc: raw.saveDc ?? raw.saveDC ?? null,
    onSave: raw.onSave === "none" ? "none" : raw.onSave === "full" ? "full" : "half",
    label: raw.label || null
  };
}

/**
 * Collect overTime specs from an actor's active effects.
 * @param {object} actor
 * @param {"start"|"end"} turn
 * @param {string} [moduleId="illusive-dnd-5e"]
 * @returns {Array<{ effect: object, spec: OverTimeSpec }>}
 */
export function listOverTimeEffects(actor, turn, moduleId = "illusive-dnd-5e") {
  const out = [];
  for (const effect of actor?.effects ?? []) {
    if (effect.disabled) continue;
    const illusive = normalizeOverTime(effect.flags?.[moduleId]?.[OVERTIME_FLAG]);
    if (illusive?.turn === turn) {
      out.push({ effect, spec: { ...illusive, label: illusive.label || effect.name } });
    }
  }
  return out;
}

/**
 * Build an Illusive overTime flag payload for ActiveEffect creation.
 * @param {OverTimeSpec} spec
 */
export function overTimeFlagPayload(spec) {
  return { [OVERTIME_FLAG]: normalizeOverTime(spec) };
}
