/**
 * Ready action release on movement: after a combatant finishes a move, readiers whose
 * trigger is "move" and who are in range get a soft after-move prompt.
 * Cast and attack triggers ride the on-cast / on-attack-declared windows (see registry "ready").
 */

import { openReactionWindow } from "./reactions/window.mjs";
import { getReadiedAction } from "./reactions/reaction-state.mjs";

function anyMoveReadied(scene = globalThis.canvas) {
  return (scene?.tokens?.placeables ?? []).some((t) => getReadiedAction(t.actor)?.trigger === "move");
}

/** updateToken (mover's client): offer readied move triggers once the move lands. */
export async function offerReadiedMoveTrigger(tokenDoc, changes, options, userId) {
  if (userId && userId !== globalThis.game?.user?.id) return;
  if (changes?.x == null && changes?.y == null) return;
  if (options?.dnd5e?.fall) return;
  if (!globalThis.game?.combat?.started || !tokenDoc?.combatant) return;
  if (!anyMoveReadied()) return;
  await openReactionWindow({
    windowId: "after-move",
    baseCtx: { triggerTokenUuid: tokenDoc.uuid }
  });
}
