/**
 * Actor-side state left behind by used reactions:
 *   nextD20Advantage — Silvery Barbs grant (advantage on the next attack, check, or save within 1 minute).
 *   pendingHitRiders — bonus damage on a later hit (Absorb Elements next-turn melee, Riposte superiority die).
 *   readied          — Ready action trigger (cleared at the readier's next turn start).
 */

import { MODULE_ID } from "../../constants.mjs";
import { setDocFlag, unsetDocFlag } from "../../foundry/write-gateway.mjs";

const ADV_FLAG = "nextD20Advantage";
const RIDER_FLAG = "pendingHitRiders";
const READY_FLAG = "readied";

function worldTime() {
  return Number(globalThis.game?.time?.worldTime) || 0;
}

function readFlag(actor, key) {
  try {
    return actor?.getFlag?.(MODULE_ID, key) ?? null;
  } catch {
    return null;
  }
}

async function writeFlag(actor, key, value) {
  if (!actor?.setFlag) return false;
  const result = value == null
    ? await unsetDocFlag(actor, MODULE_ID, key)
    : await setDocFlag(actor, MODULE_ID, key, value);
  return Boolean(result.ok);
}

/* ---------------- Silvery Barbs advantage ---------------- */

export async function grantNextD20Advantage(actor, { source = null, seconds = 60 } = {}) {
  return writeFlag(actor, ADV_FLAG, { source, expiresAt: worldTime() + seconds });
}

export function hasNextD20Advantage(actor) {
  const grant = readFlag(actor, ADV_FLAG);
  if (!grant) return false;
  return !Number.isFinite(Number(grant.expiresAt)) || worldTime() <= Number(grant.expiresAt);
}

export async function consumeNextD20Advantage(actor) {
  if (!readFlag(actor, ADV_FLAG)) return false;
  return writeFlag(actor, ADV_FLAG, null);
}

/* ---------------- Pending hit riders ---------------- */

/**
 * @typedef {{ source: string, formula: string, damageType?: string|null, meleeOnly?: boolean,
 *   ownTurnOnly?: boolean, armed?: boolean }} PendingHitRider
 * ownTurnOnly riders (Absorb Elements) arm at the owner's next turn start and expire at the turn start after.
 * Other riders (Riposte) are consumed by the next hit or dropped at the owner's next turn start.
 */
export function listPendingHitRiders(actor) {
  const list = readFlag(actor, RIDER_FLAG);
  return Array.isArray(list) ? list : [];
}

export async function addPendingHitRider(actor, rider) {
  if (!rider?.formula) return false;
  const list = listPendingHitRiders(actor).filter((r) => r.source !== rider.source);
  return writeFlag(actor, RIDER_FLAG, [...list, { ...rider, armed: !rider.ownTurnOnly }]);
}

/** Remove and return the riders this hit should add. */
export async function takePendingHitRiders(actor, { melee = false, ownTurn = false } = {}) {
  const list = listPendingHitRiders(actor);
  if (!list.length) return [];
  const take = [];
  const keep = [];
  for (const rider of list) {
    const fits = rider.armed
      && (!rider.meleeOnly || melee)
      && (!rider.ownTurnOnly || ownTurn);
    (fits ? take : keep).push(rider);
  }
  if (take.length) await writeFlag(actor, RIDER_FLAG, keep.length ? keep : null);
  return take;
}

/** Owner's turn start: arm next-turn riders, drop riders whose window has passed. */
export async function tickPendingHitRiders(actor) {
  const list = listPendingHitRiders(actor);
  if (!list.length) return;
  const next = list
    .filter((r) => r.ownTurnOnly && !r.armed)
    .map((r) => ({ ...r, armed: true }));
  await writeFlag(actor, RIDER_FLAG, next.length ? next : null);
}

/* ---------------- Ready ---------------- */

/**
 * @typedef {{ text: string, trigger: "move"|"cast"|"attack"|"manual", itemId?: string|null,
 *   activityId?: string|null, rangeFeet?: number|null }} ReadiedAction
 */
export function getReadiedAction(actor) {
  const raw = readFlag(actor, READY_FLAG);
  if (!raw) return null;
  if (typeof raw === "string") return { text: raw, trigger: "manual", itemId: null, activityId: null };
  return raw;
}

export async function setReadiedAction(actor, readied) {
  return writeFlag(actor, READY_FLAG, readied ?? null);
}
