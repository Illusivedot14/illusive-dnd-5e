/**
 * Action economy — combatant-owned turn budget (DAS-style).
 * Out of combat: always available; no spend.
 */

import { MODULE_ID } from "../constants.mjs";
import { getViewedCombat } from "../foundry/combat.mjs";
import {
  freshBudget,
  costOf,
  checkUse,
  spendUse,
  refundUse,
  toggleResource,
  basicAction
} from "../domain/combat/turn-budget.mjs";

export {
  freshBudget,
  costOf,
  checkUse,
  spendUse,
  refundUse,
  toggleResource,
  basicAction
};

const ECONOMY_SECTIONS = new Set(["action", "bonus", "reaction"]);
const TURN_FLAG = "turn";

/** Map HUD section / activation type to action|bonus|reaction, or null. */
export function resolveEconomySection(section, activationType) {
  if (ECONOMY_SECTIONS.has(section)) return section;
  if (ECONOMY_SECTIONS.has(activationType)) return activationType;
  return costOf(activationType);
}

/** Combatant for an actor in the viewed started combat, if any. */
export function combatantForActor(actor) {
  const combat = getViewedCombat();
  if (!combat?.started || !actor) return null;
  const id = actor.id ?? actor._id;
  return combat.combatants.find((c) =>
    c.actorId === id
    || c.actor?.id === id
    || c.actor?.uuid === actor.uuid
  ) ?? null;
}

export function readBudget(combatant) {
  if (!combatant) return null;
  const raw = combatant.getFlag?.(MODULE_ID, TURN_FLAG);
  if (raw && typeof raw === "object") {
    return {
      ...freshBudget(),
      ...raw,
      attacks: {
        granted: Number(raw.attacks?.granted) || 0,
        used: Number(raw.attacks?.used) || 0
      }
    };
  }
  return freshBudget();
}

export async function writeBudget(combatant, budget) {
  if (!combatant || !budget) return null;
  await combatant.setFlag(MODULE_ID, TURN_FLAG, budget);
  return budget;
}

/** Ensure a combatant has a turn budget document (lazy init). */
export async function ensureBudget(combatant) {
  if (!combatant) return null;
  const existing = combatant.getFlag?.(MODULE_ID, TURN_FLAG);
  if (existing && typeof existing === "object") return readBudget(combatant);
  const budget = freshBudget();
  await writeBudget(combatant, budget);
  return budget;
}

function emitEconomyChanged(actor) {
  try {
    Hooks.callAll(`${MODULE_ID}.economyChanged`, actor);
  } catch {
    /* ignore */
  }
}

/** @deprecated actor actions blob — prefer readBudget(combatant). Kept for tests reading legacy shape. */
export function getEconomyActions(actor) {
  const combatant = combatantForActor(actor);
  const budget = readBudget(combatant);
  if (!budget) return {};
  return {
    action: budget.action < 1,
    bonus: budget.bonus < 1,
    reaction: budget.reaction < 1
  };
}

export function isEconomyAvailable(actor, type) {
  if (!ECONOMY_SECTIONS.has(type)) return true;
  const combatant = combatantForActor(actor);
  if (!combatant) return true;
  const budget = readBudget(combatant);
  return (budget?.[type] ?? 0) > 0;
}

export function getEconomyAvailability(actor) {
  return {
    action: isEconomyAvailable(actor, "action"),
    bonus: isEconomyAvailable(actor, "bonus"),
    reaction: isEconomyAvailable(actor, "reaction")
  };
}

/**
 * Spend one economy resource on the actor's combatant.
 * @param {object|null} request  UseRequest fields (weaponAttack, lightWeapon, …)
 * @param {{ attacksPerAction?: number, isOwnTurn?: boolean }} [context]
 * @returns {Promise<{ before: object, after: object }|null>}
 */
export async function markEconomyUsed(actor, type, request = null, context = {}) {
  const combatant = combatantForActor(actor);
  if (!combatant || !ECONOMY_SECTIONS.has(type)) return null;

  const before = await ensureBudget(combatant);
  const useRequest = request ?? { cost: type };
  if (!useRequest.cost) useRequest.cost = type;
  const after = spendUse(before, useRequest, {
    isOwnTurn: context.isOwnTurn !== false,
    attacksPerAction: context.attacksPerAction ?? 1
  });
  await writeBudget(combatant, after);
  emitEconomyChanged(actor);
  return { before, after };
}

/** Reset current combatant's budget (start of their turn). */
export async function resetEconomyFlags(actor) {
  const combatant = combatantForActor(actor);
  if (!combatant) return;
  await writeBudget(combatant, freshBudget());
  emitEconomyChanged(actor);
}

/** Fresh budget for a specific combatant (preferred over actor lookup). */
export async function resetCombatantBudget(combatant) {
  if (!combatant) return;
  await writeBudget(combatant, freshBudget());
  emitEconomyChanged(combatant.actor);
}

export async function toggleEconomySpent(actor, economyType) {
  if (!actor || !ECONOMY_SECTIONS.has(economyType)) return false;
  const combatant = combatantForActor(actor);
  if (!combatant) return false;
  const before = await ensureBudget(combatant);
  const after = toggleResource(before, economyType);
  await writeBudget(combatant, after);
  emitEconomyChanged(actor);
  return true;
}

/** Spend action + set basic flag (dash / disengage / dodge / ready). */
export async function spendBasicAction(actor, kind) {
  const combatant = combatantForActor(actor);
  if (!combatant) return null;
  const before = await ensureBudget(combatant);
  const after = basicAction(before, kind);
  await writeBudget(combatant, after);
  emitEconomyChanged(actor);
  return { before, after };
}

export async function refundEconomySpend(actor, before, after) {
  const combatant = combatantForActor(actor);
  if (!combatant || !before || !after) return null;
  const current = readBudget(combatant) ?? freshBudget();
  const next = refundUse(current, before, after);
  await writeBudget(combatant, next);
  emitEconomyChanged(actor);
  return next;
}

export function isItemsEconomySpent(actor) {
  return Boolean(actor?.getFlag?.(MODULE_ID, "economy.itemsSpent"));
}

export async function toggleItemsEconomySpent(actor) {
  if (!actor) return false;
  await actor.setFlag(MODULE_ID, "economy.itemsSpent", !isItemsEconomySpent(actor));
  return true;
}

export function getReactionTimeoutMs() {
  try {
    return (game.settings.get(MODULE_ID, "reactionTimeout") ?? 12) * 1000;
  } catch {
    return 12000;
  }
}

/** Budget helpers for movement / OA (combatant-owned). */
/** Remaining Attack-action swings from the combatant budget (Extra Attack). */
export function remainingBudgetAttacks(actor) {
  const combatant = combatantForActor(actor);
  if (!combatant) return null;
  return readBudget(combatant);
}

export function isDashed(actor) {
  const budget = readBudget(combatantForActor(actor));
  return Boolean(budget?.dashed);
}

export function isDisengaged(actor) {
  const budget = readBudget(combatantForActor(actor));
  return Boolean(budget?.disengaged);
}

export function isDodging(actor) {
  const budget = readBudget(combatantForActor(actor));
  return Boolean(budget?.dodging);
}
