/**
 * Combatant lookup and economy / legendary pips for the HUD.
 * Movement lives in token-movement.mjs (re-exported for existing call sites).
 */

import { illusiveDnd } from "../i18n/index.mjs";
import { getEconomyAvailability } from "./economy.mjs";
import { getViewedCombat } from "../foundry/combat.mjs";

export {
  movementTypeLabel,
  movementModeIcon,
  listTokenMovementActions,
  getTokenMovementDisplay,
  getMovementModeSpeed,
  getMovementModes,
  buildMovementData,
  buildIdleMovementData,
  setMovementMode,
  cycleMovementMode,
  canUndoTokenMovement,
  undoFallbackPosition,
  undoOneTokenMovement,
  undoLastTokenMovement
} from "./token-movement.mjs";

const ECONOMY_TYPES = ["action", "bonus", "reaction"];

export function findCombatantForToken(token) {
  const combat = getViewedCombat();
  if (!combat || !token) return null;
  return combat.combatants.find((c) => c.tokenId === token.id) ?? null;
}

export function getCombatantForToken(token) {
  if (!getViewedCombat()?.started || !token) return null;
  return findCombatantForToken(token);
}

/** True when this token is an active combatant in a started combat (economy diamonds apply). */
export function isTokenInCombat(token) {
  return Boolean(getCombatantForToken(token));
}

export function buildEconomyPips(token) {
  const combat = getViewedCombat();
  const inCombat = Boolean(combat?.started && getCombatantForToken(token));
  if (!inCombat || !token?.actor) return [];

  const availability = getEconomyAvailability(token.actor);
  const labels = {
    action: illusiveDnd.section("action"),
    bonus: illusiveDnd.section("bonus"),
    reaction: illusiveDnd.section("reaction")
  };

  return ECONOMY_TYPES.map((type) => ({
    id: type,
    label: labels[type],
    available: availability[type] ?? true
  }));
}

export function buildLegendaryPips(actor) {
  const legact = actor?.system?.resources?.legact;
  if (!legact?.max) return null;

  return {
    label: illusiveDnd.section("legendary"),
    remaining: legact.value ?? Math.max(0, (legact.max ?? 0) - (legact.spent ?? 0)),
    max: legact.max
  };
}

/** Toggle legendary actions between remaining and fully spent (0). */
export async function toggleLegendarySpent(actor) {
  const legact = actor?.system?.resources?.legact;
  if (!legact?.max) return false;

  const remaining = Number.isFinite(legact.value)
    ? legact.value
    : Math.max(0, (legact.max ?? 0) - (legact.spent ?? 0));
  const next = remaining > 0 ? 0 : legact.max;
  await actor.update({ "system.resources.legact.value": next });
  return true;
}

function resourceRemaining(res) {
  if (!res?.max) return 0;
  if (Number.isFinite(res.value)) return Math.max(0, res.value);
  return Math.max(0, (res.max ?? 0) - (res.spent ?? 0));
}

/** Spend one legendary action (decrements remaining). */
export async function spendLegendaryAction(actor) {
  const legact = actor?.system?.resources?.legact;
  if (!legact?.max) return false;
  const remaining = resourceRemaining(legact);
  if (remaining < 1) return false;
  await actor.update({ "system.resources.legact.value": remaining - 1 });
  return true;
}

export function buildLairPips(actor) {
  const lair = actor?.system?.resources?.lair;
  if (!lair?.max) return null;
  return {
    label: illusiveDnd.section("lair"),
    remaining: resourceRemaining(lair),
    max: lair.max
  };
}

/** Spend one lair action use. */
export async function spendLairAction(actor) {
  const lair = actor?.system?.resources?.lair;
  if (!lair?.max) return false;
  const remaining = resourceRemaining(lair);
  if (remaining < 1) return false;
  await actor.update({ "system.resources.lair.value": remaining - 1 });
  return true;
}
