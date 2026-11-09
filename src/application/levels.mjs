/**
 * Automation is always full — every shipped feature is on.
 */

export const AUTOMATION_LEVELS = Object.freeze(["full"]);

export function getAutomationLevel() {
  return "full";
}

/** All features enabled. `level` arg kept for API compatibility; ignored. */
export function levelFeatures(_level = "full") {
  return {
    activityUse: true,
    economyTracking: true,
    resolutionTrace: true,
    movementPreview: true,
    visionEval: true,
    lightingEval: true,
    lootTransfer: true,
    reactionPause: true,
    declaredTriggers: true,
    opportunityAttacks: true,
    coverMatrix: true,
    autoApplyDeterministic: true
  };
}

export function featureEnabled(name) {
  return Boolean(levelFeatures()[name]);
}
