/**
 * dnd5e 6 falling: TokenDocument#plummet moves the token with options.dnd5e.fall.distance,
 * then posts a fall-damage roll (dnd5e.rollDamageV2). Illusive routes that damage to the
 * creature that fell, after a detached on-fall window (Feather Fall, Slow Fall).
 */

import { openReactionWindow, damageTargetsFromPatches } from "./reactions/window.mjs";
import { applyDamageWithTrail } from "./damage-apply.mjs";
import { tokenFromUuid } from "../foundry/token-lookup.mjs";

const FALL_MATCH_MS = 5000;

/** @type {{ tokenUuid: string, distance: number, at: number }|null} */
let pendingFall = null;

/** updateToken: remember a fall this client performed. */
export function noteFall(tokenDoc, options, userId) {
  const distance = Number(options?.dnd5e?.fall?.distance);
  if (!distance || !tokenDoc?.uuid) return;
  if (userId && userId !== globalThis.game?.user?.id) return;
  pendingFall = { tokenUuid: tokenDoc.uuid, distance, at: Date.now() };
}

function fallDamageType() {
  return globalThis.CONFIG?.DND5E?.falling?.damageType ?? "bludgeoning";
}

/** The fall these damage rolls belong to (consumed), or null. */
export function takeFallFor(rolls = []) {
  if (!pendingFall || Date.now() - pendingFall.at > FALL_MATCH_MS) return null;
  const type = fallDamageType();
  if (!rolls.length || !rolls.every((r) => (r?.options?.type ?? type) === type)) return null;
  const fall = pendingFall;
  pendingFall = null;
  return fall;
}

/** Feather Fall / Slow Fall window, then the damage write; a creature that takes damage lands prone. */
export async function resolveFallDamage(fall, rolls) {
  const patches = await openReactionWindow({
    windowId: "on-fall",
    detached: true,
    baseCtx: { triggerTokenUuid: fall.tokenUuid, targetUuids: [fall.tokenUuid], fallDistance: fall.distance }
  });
  const targets = damageTargetsFromPatches([{ uuid: fall.tokenUuid }], patches);
  const out = await applyDamageWithTrail({ rolls, targets, tag: { fall: true } });
  const pool = (hp) => (Number(hp?.value) || 0) + (Number(hp?.temp) || 0);
  if (out.changes.some((c) => c.type === "actor-hp" && pool(c.prior) > pool(c.next))) {
    const actor = tokenFromUuid(fall.tokenUuid)?.actor;
    try {
      await actor?.toggleStatusEffect?.("prone", { active: true });
    } catch {
      /* ignore */
    }
  }
  return { ...out, patches };
}

export function _resetFalls() {
  pendingFall = null;
}
