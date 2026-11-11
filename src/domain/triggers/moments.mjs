/**
 * Moments — the events a declaration can listen to.
 *
 * Each moment names the reaction window that publishes it (null = published
 * elsewhere) and the patch types its consumer honours. Who the listening
 * creature is relative to the event (trigger, target, ally, enemy) is a fact
 * (self.isTrigger, self.isTarget, relation.hostile), not a separate moment.
 */

export const MOMENTS = Object.freeze({
  attackDeclared: {
    window: "on-attack-declared",
    label: "An attack is declared (before the roll)",
    patches: ["attackAdvantage", "attackDisadvantage", "attackBonus", "d20Replace"]
  },
  isHit: {
    window: "on-attack-hit",
    label: "An attack hits (before damage)",
    patches: ["acBonus", "attackPenalty", "rerollAttack", "redirect"]
  },
  isMissed: {
    window: "on-attack-miss",
    label: "A melee attack misses",
    patches: []
  },
  damageKnown: {
    window: "on-damage-known",
    label: "Damage is rolled (before it is written)",
    patches: ["damageMultiplier", "damageReduce", "resistTypes"]
  },
  isDamaged: {
    window: "after-damage-applied",
    label: "Damage was written",
    patches: []
  },
  castsSpell: {
    window: "on-cast",
    label: "A spell is cast",
    patches: ["cancelCast"]
  },
  savedSave: {
    window: "on-save-success",
    label: "A saving throw succeeds",
    patches: ["rerollD20", "d20Replace"]
  },
  failedSave: {
    window: "on-save-fail",
    label: "A saving throw fails",
    patches: ["rerollD20", "d20Replace", "saveSuccess"]
  },
  checkSucceeded: {
    window: "on-check-success",
    label: "An ability check succeeds",
    patches: ["rerollD20"]
  },
  falls: {
    window: "on-fall",
    label: "A creature falls",
    patches: ["damageMultiplier", "damageReduce"]
  },
  moves: {
    window: "after-move",
    label: "A creature finishes a move",
    patches: []
  },
  leavesReach: {
    window: "on-leave-reach",
    label: "A creature leaves another creature's reach",
    patches: []
  },
  hitDamage: {
    window: null,
    label: "A hit is about to add rider damage",
    patches: ["bonusDamage"]
  },
  weaponMastery: {
    window: null,
    label: "A weapon mastery is applied",
    patches: []
  },
  aura: {
    window: null,
    label: "An aura the creature carries",
    patches: []
  },
  turnStart: {
    window: null,
    label: "A creature's turn starts",
    patches: []
  },
  turnEnd: {
    window: null,
    label: "A creature's turn ends",
    patches: []
  },
  isTargeted: {
    window: "on-targeted",
    label: "A creature is chosen as a target, before the roll",
    patches: ["attackAdvantage", "attackDisadvantage"]
  },
  preDamageRoll: {
    window: "on-pre-damage",
    label: "Damage is about to be rolled",
    patches: ["damageReduce"]
  },
  gainsCondition: {
    window: null,
    label: "A creature gains a condition",
    patches: []
  },
  disengages: {
    window: null,
    label: "A creature takes the Disengage action",
    patches: []
  },
  rest: {
    window: null,
    label: "A creature finishes a rest",
    patches: []
  }
});

export const MOMENT_IDS = Object.freeze(Object.keys(MOMENTS));

const BY_WINDOW = new Map(
  Object.entries(MOMENTS).filter(([, m]) => m.window).map(([id, m]) => [m.window, id])
);

export function momentForWindow(windowId) {
  return BY_WINDOW.get(windowId) ?? null;
}

export function windowForMoment(momentId) {
  return MOMENTS[momentId]?.window ?? null;
}

export function isMoment(id) {
  return Object.prototype.hasOwnProperty.call(MOMENTS, id);
}
