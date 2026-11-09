import { MODULE_ID } from "../../constants.mjs";
import { getHudFocusToken, isTouchTableClient } from "./hooks/touch-table.mjs";

export function rememberActionBarToken(token) {
  if (token?.id) void game.settings.set(MODULE_ID, "actionBarLastTokenId", token.id);
}

function ownedToken(token) {
  return Boolean(token?.actor?.isOwner);
}

/**
 * Action bar follows the controlled token (or an active reaction prompt).
 * No selection → no token (bar hides).
 * @param {object | null} reactionContext from reaction-context
 */
export function resolveActionBarToken(reactionContext = null) {
  if (reactionContext?.actorId) {
    const reactionToken = canvas?.tokens?.placeables?.find((t) => t.actor?.id === reactionContext.actorId);
    if (reactionToken && ownedToken(reactionToken)) return reactionToken;
  }

  const controlled = canvas?.tokens?.controlled?.[0];
  if (controlled?.actor) {
    rememberActionBarToken(controlled);
    return controlled;
  }

  if (isTouchTableClient()) {
    const focused = getHudFocusToken();
    if (focused?.actor) return focused;
  }

  return null;
}
