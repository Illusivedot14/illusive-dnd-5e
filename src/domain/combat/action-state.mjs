/**
 * Canonical combat ActionResolution shape and phase helpers.
 * Pure: no Foundry globals.
 */

export const ACTION_PHASES = Object.freeze([
  "created",
  "awaiting-attack",
  "awaiting-reaction",
  "awaiting-damage-or-save",
  "ready-to-apply",
  "completed",
  "cancelled",
  "corrected"
]);

const TERMINAL = new Set(["completed", "cancelled", "corrected"]);

/**
 * @param {object} input
 * @returns {object} ActionResolution
 */
export function createActionResolution(input = {}) {
  return {
    schemaVersion: 1,
    id: input.id ?? null,
    actorUuid: input.actorUuid ?? null,
    itemUuid: input.itemUuid ?? null,
    activityId: input.activityId ?? null,
    rulesContext: input.rulesContext ?? { edition: "2024", legacy: false, source: null },
    phase: input.phase ?? "created",
    targets: Array.isArray(input.targets) ? [...input.targets] : [],
    rolls: Array.isArray(input.rolls) ? [...input.rolls] : [],
    pendingDecision: input.pendingDecision ?? null,
    appliedChanges: Array.isArray(input.appliedChanges) ? [...input.appliedChanges] : [],
    trace: Array.isArray(input.trace) ? [...input.trace] : [],
    /** When set, this resolution is a reaction caused by another resolution. */
    parentResolutionId: input.parentResolutionId ?? null,
    /** Activity/item activation type (action, bonus, free, special, legendary, …). */
    activationType: input.activationType ?? null
  };
}

export function isTerminalPhase(phase) {
  return TERMINAL.has(phase);
}

export function appendTrace(state, entry) {
  return {
    ...state,
    trace: [...(state.trace ?? []), { at: entry.at ?? null, ...entry }]
  };
}
