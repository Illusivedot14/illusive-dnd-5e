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
  entersReach: {
    window: "on-enter-reach",
    label: "A creature enters another creature's reach",
    patches: []
  },
  /** A feat or class feature activity is being used. */
  usesFeature: {
    window: null,
    label: "A creature uses a feature",
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
  },
  /** Same window as attackDeclared. Listeners are not the target (Lucky, Sanctuary, Warding Flare). */
  isAttacked: {
    window: "on-attack-declared",
    label: "A creature is attacked, before the roll",
    patches: ["attackDisadvantage", "cancelAttack"]
  },
  /** Same window as attackDeclared. Pre-roll bonuses. */
  preAttackRoll: {
    window: "on-attack-declared",
    label: "An attack roll is about to be made",
    patches: ["attackAdvantage", "attackDisadvantage", "attackBonus", "d20Replace"]
  },
  /** Same window as isHit. The listener is an ally of the creature that was hit. */
  allyIsHit: {
    window: "on-attack-hit",
    label: "An ally is hit",
    patches: ["acBonus", "attackPenalty", "rerollAttack"]
  },
  allyIsDamaged: {
    window: "after-damage-applied",
    label: "An ally took damage",
    patches: []
  },
  allyAttacks: {
    window: "on-attack-declared",
    label: "An ally declares an attack",
    patches: ["attackAdvantage", "attackDisadvantage", "attackBonus"]
  },
  enemyAttacks: {
    window: "on-attack-declared",
    label: "An enemy declares an attack",
    patches: ["attackDisadvantage"]
  },
  enemyAttacked: {
    window: "on-attack-hit",
    label: "An enemy is hit",
    patches: []
  },
  enemyDisengages: {
    window: null,
    label: "An enemy takes the Disengage action",
    patches: []
  },
  /** A creature enters a placed zone. Published by zones.mjs. */
  enter: {
    window: null,
    label: "A creature enters a zone",
    patches: []
  },
  startOfTurn: {
    window: null,
    label: "A creature's turn starts (alias of turnStart)",
    patches: []
  },
  endOfTurn: {
    window: null,
    label: "A creature's turn ends (alias of turnEnd)",
    patches: []
  }
});

export const MOMENT_IDS = Object.freeze(Object.keys(MOMENTS));

/** Every moment published by a reaction window. Several moments can share one window. */
export function momentsForWindow(windowId) {
  if (!windowId) return [];
  return Object.entries(MOMENTS).filter(([, moment]) => moment.window === windowId).map(([id]) => id);
}

export function momentForWindow(windowId) {
  return momentsForWindow(windowId)[0] ?? null;
}

export function windowForMoment(momentId) {
  return MOMENTS[momentId]?.window ?? null;
}

export function isMoment(id) {
  return Object.prototype.hasOwnProperty.call(MOMENTS, id);
}
