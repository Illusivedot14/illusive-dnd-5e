import { settingOn } from "../hud/lib/hud-settings.mjs";
import { getViewedCombat } from "./combat.mjs";
import { canControlToken, selectToken, selectTokenForTurn } from "./token-actions.mjs";
import { combatantToken } from "../hud/components/turn-tracker/turn-tracker-combatant.mjs";
import { resetCombatantBudget, freshBudget, readBudget, writeBudget } from "../application/economy.mjs";
import { MODULE_ID } from "../constants.mjs";
import { isPrimaryWriter } from "./gm-query.mjs";

function getTurnCombatant(combat, current) {
  if (!combat) return null;

  if (current?.tokenId) {
    return combat.combatants.find((c) => c.tokenId === current.tokenId) ?? null;
  }

  const turn = current?.turn ?? combat.turn;
  return combat.turns?.[turn] ?? combat.combatant ?? null;
}

function namedEffect(actor, pattern) {
  return [...(actor?.effects ?? []), ...(actor?.appliedEffects ?? [])].some((effect) =>
    !effect?.disabled && pattern.test(String(effect?.name ?? "")));
}

function hasItem(actor, id) {
  return [...(actor?.items ?? [])].some((item) =>
    item?.system?.identifier === id || new RegExp(`^${id.replace(/-/g, "\\s*")}$`, "i").test(String(item?.name ?? "")));
}

async function refreshTurnEconomy(combatant) {
  if (!combatant) return;
  await resetCombatantBudget(combatant);
  const actor = combatant.actor;
  if (!actor) return;
  const budget = readBudget(combatant);
  if (!budget) return;
  const next = { ...budget };
  if (namedEffect(actor, /^haste$/i)) next.action = (Number(next.action) || 0) + 1;
  if (hasItem(actor, "reactive")) next.reaction = (Number(next.reaction) || 0) + 1;
  if (next.action !== budget.action || next.reaction !== budget.reaction) {
    await writeBudget(combatant, next);
  }
  try {
    Hooks.callAll(`${MODULE_ID}.economyChanged`, combatant.actor);
  } catch {
    /* ignore */
  }
}

async function seedAllCombatants(combat) {
  for (const combatant of combat?.combatants ?? []) {
    await writeBudget(combatant, freshBudget());
  }
  try {
    Hooks.callAll(`${MODULE_ID}.economyChanged`, null);
  } catch {
    /* ignore */
  }
}

function onTurnChange(combat, _prior, current) {
  if (!combat?.started || !canvas?.ready) return;

  const viewed = getViewedCombat();
  if (viewed && viewed.id !== combat.id) return;

  const combatant = getTurnCombatant(combat, current);
  const token = combatantToken(combatant);
  if (combatant && isPrimaryWriter()) void refreshTurnEconomy(combatant);
  if (!token) return;

  // Owned current combatant: always select + pan (players expect control focus).
  // Auto-Pan setting still drives the full GM / touch-table helper path.
  if (canControlToken(token)) {
    void selectToken(token, { pan: true, clearTargets: true });
    return;
  }
  if (settingOn("enableTurnHelpers")) void selectTokenForTurn(token);
}

export function bindCombatTurnHooks() {
  Hooks.on("combatTurnChange", onTurnChange);
  Hooks.on("combatStart", (combat) => {
    const begin = isPrimaryWriter() ? seedAllCombatants(combat) : Promise.resolve();
    void begin.then(() => {
      onTurnChange(combat, null, combat?.current);
    });
  });
}
