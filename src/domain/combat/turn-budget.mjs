/**
 * Combatant turn budget — pure DAS-style spend / check / refund.
 * Trimmed: action|bonus|reaction + attack grant + basic turn flags.
 */

/** Fresh budget at the start of a combatant's turn. */
export function freshBudget({ reactions = 1 } = {}) {
  return {
    action: 1,
    bonus: 1,
    reaction: reactions,
    attacks: { granted: 0, used: 0 },
    dashed: false,
    disengaged: false,
    dodging: false,
    readied: false,
    slotCast: false,
    nickAvailable: false
  };
}

/** Map dnd5e activation type → budget key, or null if free / legendary / etc. */
export function costOf(activationType) {
  return ["action", "bonus", "reaction"].includes(activationType) ? activationType : null;
}

/**
 * @typedef {object} UseRequest
 * @property {"action"|"bonus"|"reaction"|"free"|null} cost
 * @property {boolean} [weaponAttack]
 * @property {boolean} [usesSpellSlot]
 * @property {number} [attackCost]
 * @property {"dash"|"disengage"|"dodge"|"ready"|null} [basic]
 * @property {boolean} [lightWeapon]
 */

function coveredByAttackAction(budget, request) {
  return Boolean(
    request.weaponAttack
    && request.cost === "action"
    && budget.attacks.used + (request.attackCost ?? 1) <= budget.attacks.granted
  );
}

/**
 * Soft legality: empty = ok. Never hard-blocks.
 * @returns {Array<"notYourTurn"|"noAction"|"noBonus"|"noReaction"|"slotAlreadyCast">}
 */
export function checkUse(budget, request, { isOwnTurn } = {}) {
  const issues = [];
  if (!budget || !request) return issues;
  if (request.cost === "free" || request.cost == null) return issues;

  const cost = request.cost;
  if (cost !== "reaction" && isOwnTurn === false) issues.push("notYourTurn");
  if (cost === "action" && budget.action < 1 && !coveredByAttackAction(budget, request)) {
    issues.push("noAction");
  }
  if (cost === "bonus" && budget.bonus < 1) issues.push("noBonus");
  if (cost === "reaction" && budget.reaction < 1) issues.push("noReaction");
  if (request.usesSpellSlot && isOwnTurn && budget.slotCast) issues.push("slotAlreadyCast");
  return issues;
}

/**
 * Debit a use. Confirmed overspend clamps at zero (soft mode).
 * @param {object} budget
 * @param {UseRequest} request
 * @param {{ isOwnTurn?: boolean, attacksPerAction?: number }} [context]
 */
export function spendUse(budget, request, { isOwnTurn = true, attacksPerAction = 1 } = {}) {
  if (!budget || !request) return budget;

  // Nick: one Light extra attack as part of the Attack action (no Bonus).
  if (
    request.lightWeapon
    && request.weaponAttack
    && budget.nickAvailable
    && (request.cost === "bonus" || request.cost === "action")
  ) {
    return {
      ...budget,
      nickAvailable: false,
      attacks: { ...budget.attacks }
    };
  }

  if (!request.cost || request.cost === "free") return budget;

  if (coveredByAttackAction(budget, request)) {
    return {
      ...budget,
      attacks: {
        ...budget.attacks,
        used: budget.attacks.used + (request.attackCost ?? 1)
      }
    };
  }

  const next = {
    ...budget,
    attacks: { ...budget.attacks },
    [request.cost]: Math.max(0, (budget[request.cost] ?? 0) - 1)
  };

  if (request.weaponAttack && request.cost === "action") {
    const granted = Math.max(1, attacksPerAction);
    next.attacks = {
      granted,
      used: Math.min(granted, request.attackCost ?? 1)
    };
  }

  if (request.usesSpellSlot && isOwnTurn) next.slotCast = true;
  return next;
}

/**
 * Refund the delta of a cancelled spend onto the current budget.
 * @param {object} current
 * @param {object} before
 * @param {object} after
 */
export function refundUse(current, before, after) {
  if (!current || !before || !after) return current;
  const next = { ...current, attacks: { ...current.attacks } };
  for (const key of ["action", "bonus", "reaction"]) {
    next[key] = Math.max(0, (current[key] ?? 0) + ((before[key] ?? 0) - (after[key] ?? 0)));
  }
  const usedDelta = (after.attacks?.used ?? 0) - (before.attacks?.used ?? 0);
  next.attacks.used = Math.max(0, (next.attacks.used ?? 0) - usedDelta);
  if ((after.attacks?.granted !== before.attacks?.granted) && next.attacks.used === 0) {
    next.attacks.granted = before.attacks?.granted ?? 0;
  }
  if (!before.slotCast && after.slotCast) next.slotCast = false;
  return next;
}

export const BASIC_ACTION_FLAGS = Object.freeze({
  dash: "dashed",
  disengage: "disengaged",
  dodge: "dodging",
  ready: "readied"
});

/** Spend action + set a basic-action turn flag. */
export function basicAction(budget, kind) {
  const flag = BASIC_ACTION_FLAGS[kind];
  if (!flag || !budget) return budget;
  return {
    ...budget,
    action: Math.max(0, budget.action - 1),
    [flag]: true
  };
}

/** Manual diamond click: spent ↔ available. */
export function toggleResource(budget, key) {
  if (!budget || !["action", "bonus", "reaction"].includes(key)) return budget;
  return { ...budget, [key]: budget[key] > 0 ? 0 : 1 };
}

/** Movement allowance this turn (dash doubles). */
export function movementAllowance(budget, speed) {
  return (Number(speed) || 0) * (budget?.dashed ? 2 : 1);
}
