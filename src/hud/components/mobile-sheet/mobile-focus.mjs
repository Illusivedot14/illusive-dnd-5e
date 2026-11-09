/**
 * Shared “who is selected” for the mobile carousel / dice roller.
 * Center-snapped (or last tapped) portrait is the active character.
 */

import { MODULE_ID } from "../../../constants.mjs";

export const MOBILE_FOCUS_HOOK = `${MODULE_ID}.mobileFocus`;

let focusedActorId = null;

export function setMobileFocusedActorId(actorId) {
  const next = actorId || null;
  if (focusedActorId === next) return;
  focusedActorId = next;
  Hooks.callAll(MOBILE_FOCUS_HOOK, focusedActorId);
}

export function getMobileFocusedActorId() {
  return focusedActorId;
}

export function getMobileFocusedActor() {
  return focusedActorId ? game.actors?.get?.(focusedActorId) ?? null : null;
}
