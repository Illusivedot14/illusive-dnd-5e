/**
 * Per-creature context for one moment (reaction window or passive trigger).
 *
 * Distance and sight are the expensive parts, so they are computed lazily and
 * cached per moment: a creature with nothing that could fire never pays for them.
 */

import { evaluateVisibilityBetween } from "../perception.mjs";
import { isHostile } from "../../domain/combat/disposition.mjs";
import { spaceFeetBetween } from "../../domain/spatial/geometry.mjs";
import { getGridFacts, getTokenFacts } from "../../foundry/scene-adapter.mjs";
import { tokenFromUuid, tokenUuidOf } from "../../foundry/token-lookup.mjs";

export function feetBetween(a, b) {
  try {
    const grid = getGridFacts();
    const fa = getTokenFacts(a);
    const fb = getTokenFacts(b);
    if (!fa || !fb) return null;
    return spaceFeetBetween(fa, fb, {
      gridSize: grid.size || 100,
      gridDistance: grid.distance || 5,
      includeElevation: true
    });
  } catch {
    return null;
  }
}

export function canSee(observer, target) {
  const observerUuid = tokenUuidOf(observer);
  const targetUuid = tokenUuidOf(target);
  if (!observerUuid || !targetUuid) return true;
  try {
    return evaluateVisibilityBetween({ observerUuid, targetUuid })?.result !== "not-visible";
  } catch {
    return true;
  }
}

export function initiativeOf(token) {
  const combatant = globalThis.game?.combat?.combatants?.find?.((c) => c.tokenId === token?.id);
  const init = Number(combatant?.initiative);
  return Number.isFinite(init) ? init : Number.NEGATIVE_INFINITY;
}

/**
 * Shared, per-moment facts about the triggering event.
 * @param {object} baseCtx  { triggerTokenUuid, targetUuids, damagedActorUuids, ... }
 */
export function createMomentScope(baseCtx = {}) {
  const trigger = baseCtx.triggerTokenUuid ? tokenFromUuid(baseCtx.triggerTokenUuid) : null;
  const pairCache = new Map();
  const pair = (kind, a, b, fn) => {
    const key = `${kind}:${tokenUuidOf(a)}:${tokenUuidOf(b)}`;
    if (!pairCache.has(key)) pairCache.set(key, fn(a, b));
    return pairCache.get(key);
  };
  return {
    baseCtx,
    trigger,
    triggerUuid: trigger ? tokenUuidOf(trigger) : null,
    targetList: baseCtx.targetUuids ?? [],
    targets: new Set(baseCtx.targetUuids ?? []),
    damaged: new Set(baseCtx.damagedActorUuids ?? []),
    feet: (a, b) => pair("feet", a, b, feetBetween),
    sees: (a, b) => pair("sight", a, b, canSee)
  };
}

/** Nearest attack target within 5 ft of the reactor, other than the reactor (Protection, Interception). */
function nearestTarget(scope, token, selfUuid) {
  let best = null;
  for (const uuid of scope.targetList) {
    if (uuid === selfUuid) continue;
    const target = tokenFromUuid(uuid);
    const feet = target ? scope.feet(token, target) : null;
    if (feet == null || feet > 5) continue;
    if (!best || feet < best.feet) best = { uuid, feet };
  }
  return best;
}

/**
 * Context for one creature at this moment. distanceToTrigger / canSeeTrigger /
 * nearTarget* are lazy getters: evaluated on first read, then cached.
 */
export function candidateContext(scope, token, extra = {}) {
  const actor = token?.actor ?? null;
  const uuid = tokenUuidOf(token);
  const { trigger, triggerUuid, baseCtx } = scope;
  const isTrigger = Boolean(triggerUuid && uuid === triggerUuid);
  let near;
  const nearOnce = () => {
    if (near === undefined) near = scope.targetList.length ? nearestTarget(scope, token, uuid) : null;
    return near;
  };
  const ctx = {
    ...baseCtx,
    ...extra,
    actor,
    token,
    tokenUuid: uuid,
    isTrigger,
    isTarget: scope.targets.has(uuid),
    isDamaged: Boolean(actor && (scope.damaged.has(actor.uuid) || scope.damaged.has(uuid))),
    hostile: isTrigger ? false : (trigger ? isHostile(trigger, token) : baseCtx.hostile)
  };
  Object.defineProperties(ctx, {
    distanceToTrigger: {
      enumerable: true,
      get: () => (isTrigger ? 0 : (trigger ? scope.feet(token, trigger) : null))
    },
    canSeeTrigger: {
      enumerable: true,
      get: () => (isTrigger || !trigger ? true : scope.sees(token, trigger))
    },
    nearTargetUuid: { enumerable: true, get: () => nearOnce()?.uuid ?? null },
    nearTargetFeet: { enumerable: true, get: () => nearOnce()?.feet ?? null }
  });
  return ctx;
}
