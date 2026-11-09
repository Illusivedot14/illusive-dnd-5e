/**
 * Enter / leave combat for a token.
 */

import { illusiveDnd } from "../i18n/index.mjs";
import { findCombatantForToken } from "./action-economy.mjs";
import { viewedScene } from "../foundry/token-step.mjs";

export async function enterCombatWithToken(token) {
  if (!token?.actor) return false;

  let combat = game.combat;
  if (!combat) {
    if (typeof Combat?.canUserCreate === "function" ? !Combat.canUserCreate(game.user) : !game.user?.isGM) {
      ui.notifications.warn(illusiveDnd.actionBar("tipEnterCombatNoPermission"));
      return false;
    }
    const created = await Combat.create({
      scene: canvas.scene?.id ?? viewedScene()?.id,
      combatants: []
    });
    combat = created.combat ?? created;
  } else if (!game.user?.isGM && !combat.canUserModify?.(game.user, "update")) {
    ui.notifications.warn(illusiveDnd.actionBar("tipEnterCombatNoPermission"));
    return false;
  }

  let combatant = findCombatantForToken(token);
  if (combatant) return false;

  const created = await combat.createEmbeddedDocuments("Combatant", [{
    tokenId: token.id,
    actorId: token.actor.id,
    hidden: false
  }]);
  combatant = created[0];

  if (combatant && combatant.initiative == null) {
    await combat.rollInitiative([combatant.id]);
  }

  if (!combat.started) {
    ui.notifications.info(illusiveDnd.actionBar("joinedCombat", { name: token.name }));
  }

  return true;
}

export async function leaveCombatWithToken(token) {
  const combatant = findCombatantForToken(token);
  if (!combatant) {
    ui.notifications.info(illusiveDnd.actionBar("notInCombat"));
    return false;
  }
  await combatant.delete();
  return true;
}
