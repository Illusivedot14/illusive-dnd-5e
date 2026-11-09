/**
 * Short / long rest via dnd5e actor APIs.
 */

import { illusiveDnd } from "../i18n/index.mjs";

export async function runShortRest(actor) {
  if (typeof actor?.shortRest === "function") {
    await actor.shortRest();
    return true;
  }
  if (typeof game.dnd5e?.documents?.Actor5e?.prototype?.shortRest === "function") {
    await actor.shortRest?.();
    return true;
  }
  ui.notifications.warn(illusiveDnd.actionBar("restUnavailable"));
  return false;
}

export async function runLongRest(actor) {
  if (typeof actor?.longRest === "function") {
    await actor.longRest();
    return true;
  }
  if (typeof game.dnd5e?.documents?.Actor5e?.prototype?.longRest === "function") {
    await actor.longRest?.();
    return true;
  }
  ui.notifications.warn(illusiveDnd.actionBar("restUnavailable"));
  return false;
}

/** @param {"short"|"long"} kind */
export async function runRest(actor, kind) {
  if (kind === "short") return runShortRest(actor);
  if (kind === "long") return runLongRest(actor);
  return false;
}
