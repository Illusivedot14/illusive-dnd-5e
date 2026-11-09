import { illusiveDnd } from "../../../i18n/index.mjs";
import { getCombatantForToken, findCombatantForToken } from "../../../application/action-economy.mjs";
import { getViewedCombat, getActiveCombatant } from "../../../foundry/combat.mjs";
import { flipToken } from "../../../foundry/token-actions.mjs";
import { runRest } from "../../../application/rest.mjs";
import {
  enterCombatWithToken,
  leaveCombatWithToken
} from "../../../application/combat-join.mjs";
export {
  toggleMovementDropdown,
  toggleStatusDropdown,
  toggleLightDropdown,
  toggleAuraDropdown,
  toggleRollsDropdown,
  toggleGameLogDropdown
} from "./action-bar-util-dropdown.mjs";

export {
  LIGHT_PRESETS,
  isTokenLightOn,
  collectLightPresetChoices,
  applyLightPreset,
  toggleTokenLight
} from "../../../foundry/token-light.mjs";

export { isTokenAuraOn } from "../../../foundry/token-aura.mjs";

export { enterCombatWithToken, leaveCombatWithToken };

export async function openActorSheet(actor) {
  if (!actor) return false;
  const sheet = actor.sheet;
  if (!sheet) return false;
  if (sheet.rendered) {
    await sheet.close();
    return true;
  }
  await sheet.render(true);
  return true;
}

/**
 * Token Config is gated by Foundry's "Configure Token Settings" permission.
 * Owning the actor/character is not enough — players get a permission error otherwise.
 */
export function canOpenTokenConfig(token) {
  if (!token?.document || !game.user) return false;
  if (game.user.isGM) return true;
  if (game.user.can?.("TOKEN_CONFIGURE")) return true;
  const sheet = token.document.sheet;
  if (sheet && typeof sheet.isVisible === "boolean") return sheet.isVisible;
  return false;
}

/** Open Foundry token configuration (not the character sheet). */
export async function openTokenConfig(token) {
  const doc = token?.document;
  if (!doc) return false;

  if (!canOpenTokenConfig(token)) {
    return false;
  }

  if (typeof doc.sheet?.render === "function") {
    await doc.sheet.render(true);
    return true;
  }

  const ConfigClass = foundry?.applications?.sheets?.TokenConfig ?? globalThis.TokenConfig;
  if (!ConfigClass) return false;

  try {
    await new ConfigClass(doc).render(true);
  } catch (_err) {
    await new ConfigClass({ document: doc }).render(true);
  }
  return true;
}

export async function toggleTokenVisibility(token) {
  if (!token?.document) return false;
  if (!game.user.isGM) {
    ui.notifications.warn(illusiveDnd.warning("gmOnly"));
    return false;
  }
  await token.document.update({ hidden: !token.document.hidden });
  return true;
}

export async function promptRest(actor) {
  if (!actor?.isOwner) {
    ui.notifications.warn(illusiveDnd.warning("noOwner"));
    return false;
  }

  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: illusiveDnd.actionBar("restTitle") },
    content: `<p>${illusiveDnd.actionBar("restPrompt")}</p>`,
    buttons: [
      {
        action: "short",
        label: illusiveDnd.actionBar("shortRest"),
        icon: "fas fa-hourglass-half",
        callback: () => "short"
      },
      {
        action: "long",
        label: illusiveDnd.actionBar("longRest"),
        icon: "fas fa-bed",
        callback: () => "long"
      },
      {
        action: "cancel",
        label: illusiveDnd.ui("cancel"),
        icon: "fas fa-times",
        // DialogV2: nullish callback results fall through to action id ("cancel").
        callback: () => false
      }
    ],
    default: "short"
  });

  if (choice === "short" || choice === "long") return runRest(actor, choice);
  return false;
}

export async function handleCombatFlowButton(token) {
  const combat = getViewedCombat() ?? game.combat;
  if (!combat?.started) {
    if (findCombatantForToken(token)) return false;
    return enterCombatWithToken(token);
  }

  const combatant = getCombatantForToken(token);
  if (!combatant) {
    return enterCombatWithToken(token);
  }

  // Foundry v14: `combat.combatant` (via `_current`) can lag one beat behind
  // `combat.turns[combat.turn]` after turn changes — do not trust it here.
  const active = getActiveCombatant(combat);
  const isActiveTurn = Boolean(
    active
    && (active.id === combatant.id || (active.tokenId && active.tokenId === token.id))
  );

  if (!isActiveTurn) {
    ui.notifications.warn(illusiveDnd.turn("notYourTurn"));
    return false;
  }

  return combat.nextTurn();
}

export async function handleUtilityButton(action, token) {
  if (!token?.actor) return false;

  switch (action) {
    case "configure":
      return openTokenConfig(token);
    case "sheet":
      return openActorSheet(token.actor);
    case "light":
      return false;
    case "aura":
      return false;
    case "rolls":
      return false;
    case "movement":
      return false;
    case "status":
      return false;
    case "visibility":
      return toggleTokenVisibility(token);
    case "flip":
      return flipToken(token);
    case "rest": {
      if (findCombatantForToken(token)) {
        return leaveCombatWithToken(token);
      }
      if (getViewedCombat()?.started ?? game.combat?.started) {
        ui.notifications.warn(illusiveDnd.actionBar("restDuringCombat"));
        return false;
      }
      return promptRest(token.actor);
    }
    default:
      return false;
  }
}
