import { settingOn } from "../hud/lib/hud-settings.mjs";
import { getViewedCombat } from "./combat.mjs";
import { canControlToken, selectToken, selectTokenForTurn } from "./token-actions.mjs";
import { combatantToken } from "../hud/components/turn-tracker/turn-tracker-combatant.mjs";
import { resetCombatantBudget, freshBudget, writeBudget } from "../application/economy.mjs";
import { MODULE_ID } from "../constants.mjs";

function getTurnCombatant(combat, current) {
  if (!combat) return null;

  if (current?.tokenId) {
    return combat.combatants.find((c) => c.tokenId === current.tokenId) ?? null;
  }

  const turn = current?.turn ?? combat.turn;
  return combat.turns?.[turn] ?? combat.combatant ?? null;
}

async function refreshTurnEconomy(combatant) {
  if (!combatant) return;
  await resetCombatantBudget(combatant);
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
  if (combatant) void refreshTurnEconomy(combatant);
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
    void seedAllCombatants(combat).then(() => {
      onTurnChange(combat, null, combat?.current);
    });
  });
}
