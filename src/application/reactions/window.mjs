/**
 * Hybrid reaction windows — hard pause on the parent, soft prompts elsewhere.
 * See docs/combat-engine.md §6.
 *
 * One prompt per reactor per window (a creature has one reaction): every
 * eligible reaction that creature has is offered together, in initiative order.
 */

import { featureEnabled } from "../levels.mjs";
import { isEconomyAvailable, getReactionTimeoutMs } from "../economy.mjs";
import {
  startReactionPrompt,
  clearReactionPrompt,
  clearReactionPromptFor,
  getReactionContext,
  closeReactionDialog,
  showForceEndDialog
} from "../reaction-context.mjs";
import { emitCombatFx } from "../combat-fx.mjs";
import { MODULE_ID } from "../../constants.mjs";
import { isIncapacitated } from "../../domain/combat/conditions.mjs";
import { actorFromUuid, tokenUuidOf } from "../../foundry/token-lookup.mjs";
import { createMomentScope, candidateContext, initiativeOf } from "./candidates.mjs";
import { momentForWindow, runPassiveTriggers, declarationSpecsForWindow } from "../triggers/engine.mjs";
import {
  remoteOwnerFor,
  sendReactionPrompt,
  sendReactionDecision,
  sendReactionControl,
  bindReactionSocket
} from "../../foundry/reaction-socket.mjs";
import {
  listReactionsForWindow,
  listMatchingActivities,
  mergePatches
} from "./registry.mjs";

/** @type {Map<string, { resolve: Function, parentId: string, timer: any }>} */
const pendingHard = new Map();

function waitKey(parentId, actorUuid) {
  return `${parentId}::${actorUuid}`;
}

/**
 * Eligible reactors for a window, grouped per creature.
 * baseCtx: { triggerTokenUuid, targetUuids, damagedActorUuids, droppedUuids, attackRoll, melee,
 *   ranged, weaponAttack, elemental, damageTypes, charmOrFear, rulesContext }
 * Registry specs plus prompted declarations (triggers/engine.mjs). Distance and
 * sight are computed only when a spec asks (reactions/candidates.mjs).
 * @returns {{ actor, token, specs: object[], activities: object[], ctx: object }[]}
 */
export function collectWindowCandidates(windowId, baseCtx = {}, scope = createMomentScope(baseCtx)) {
  const registry = listReactionsForWindow(windowId);
  const groups = [];

  for (const token of globalThis.canvas?.tokens?.placeables ?? []) {
    const actor = token?.actor;
    if (!actor) continue;
    const specs = [...registry, ...declarationSpecsForWindow(windowId, actor)];
    if (!specs.length) continue;
    if (isIncapacitated(actor) || !isEconomyAvailable(actor, "reaction")) continue;

    const ctx = candidateContext(scope, token, { windowId });
    const matched = [];
    const activities = [];
    for (const spec of specs) {
      if (ctx.isTrigger && !spec.selfTrigger) continue;
      if (spec.eligible && !spec.eligible(ctx, scope)) continue;
      if (spec.rangeFeet && ctx.distanceToTrigger != null && ctx.distanceToTrigger > spec.rangeFeet) continue;
      if (spec.needsSight && !ctx.canSeeTrigger) continue;
      const acts = listMatchingActivities(actor, spec, ctx);
      if (!acts.length) continue;
      matched.push(spec);
      activities.push(...acts);
    }
    if (matched.length) groups.push({ actor, token, specs: matched, activities, ctx });
  }

  groups.sort((a, b) => {
    const d = initiativeOf(b.token) - initiativeOf(a.token);
    if (d) return d;
    return String(a.token?.id ?? "").localeCompare(String(b.token?.id ?? ""));
  });
  return groups;
}

/**
 * Resolve a pending hard-window wait (local Pass / use, or relayed decision).
 * slotLevel: the slot the reaction spell used (2014 Counterspell, Absorb Elements).
 * allyUuid: the creature Silvery Barbs grants advantage to.
 */
export function completeHardWindowDecision({
  parentId,
  actorUuid,
  used = false,
  itemId = null,
  slotLevel = null,
  allyUuid = null
} = {}) {
  const key = waitKey(parentId, actorUuid);
  const pending = pendingHard.get(key);
  if (!pending) return false;
  pendingHard.delete(key);
  if (pending.timer) clearTimeout(pending.timer);
  pending.resolve({ used: Boolean(used), itemId, slotLevel, allyUuid });
  return true;
}

/** A hard window is waiting on a decision (undo must not run underneath it). */
export function hasOpenHardWindow() {
  return pendingHard.size > 0;
}

export function isHardWaitPending(parentId, actorUuid) {
  return pendingHard.has(waitKey(parentId, actorUuid));
}

export function _resetHardWindowWaits() {
  for (const pending of pendingHard.values()) {
    if (pending.timer) clearTimeout(pending.timer);
    try {
      pending.resolve({ used: false, aborted: true });
    } catch {
      /* ignore */
    }
  }
  pendingHard.clear();
}

function promptOptions(group, { parentId, windowId, hard }) {
  return {
    hardWindow: hard,
    parentId,
    parentResolutionId: parentId,
    windowId,
    actorUuid: group.actor.uuid,
    triggerIds: group.specs.map((s) => s.id),
    triggerTokenUuid: group.ctx.triggerTokenUuid ?? null,
    targetUuids: group.ctx.targetUuids ?? [],
    damageTypes: group.ctx.damageTypes ?? []
  };
}

function announce(group, parentId) {
  emitCombatFx({
    kind: "reaction",
    subtype: group.specs.map((s) => s.id).join(","),
    resolutionId: parentId,
    actorUuid: group.actor.uuid,
    tokenUuid: tokenUuidOf(group.token),
    targetUuids: group.ctx.targetUuids ?? []
  });
  try {
    Hooks.callAll(`${MODULE_ID}.reactionTrigger`, {
      trigger: group.specs.map((s) => s.id),
      token: group.token,
      activities: group.activities
    });
  } catch {
    /* ignore */
  }
}

function activityRefs(activities) {
  return activities.map((a) => ({ itemId: a.item?.id ?? a.parent?.id ?? null, activityId: a.id ?? a._id ?? null }));
}

function activitiesFromRefs(actor, refs = []) {
  const out = [];
  for (const { itemId, activityId } of refs) {
    const item = actor.items?.get?.(itemId);
    const act = item?.system?.activities?.get?.(activityId);
    if (!act) continue;
    // PseudoDocument#item is a getter. Writing it throws and the prompt never opens.
    out.push(act);
  }
  return out;
}

/**
 * Show a reaction prompt on the reactor owner's client (active non-GM owner),
 * else locally. The decision comes back through settleReactionPrompt on this client.
 */
export function promptReactor(actor, activities, windowId, options = {}) {
  const owner = remoteOwnerFor(actor);
  if (owner && sendReactionPrompt(owner.id, {
    actorUuid: actor.uuid,
    windowId,
    options: { ...options, actorUuid: actor.uuid },
    refs: activityRefs(activities)
  })) return "remote";
  startReactionPrompt(actor, activities, windowId, { ...options, actorUuid: actor.uuid });
  return "local";
}

function showPrompt(group, options) {
  return promptReactor(group.actor, group.activities, options.windowId, options);
}

function awaitDecision(parentId, actorUuid, graceMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      completeHardWindowDecision({ parentId, actorUuid, used: false });
    }, graceMs);
    pendingHard.set(waitKey(parentId, actorUuid), { resolve, parentId, timer });
  });
}

function specForUsedItem(group, itemId) {
  if (group.specs.length === 1 || !itemId) return group.specs[0];
  const item = group.actor.items?.get?.(itemId)
    ?? [...(group.actor.items ?? [])].find((i) => i.id === itemId);
  return group.specs.find((s) => item && s.match(item, group.ctx)) ?? group.specs[0];
}

let detachedSeq = 0;

/**
 * Open a reaction window on a parent resolution.
 * Hard: pause the parent, prompt each reactor in turn, resume with patches.
 * Soft: prompt reactors; nothing waits (a parent is optional).
 * A reactor with any hard spec in this window gets the hard (waiting) prompt.
 * detached: hard window with no parent resolution (falls) — waits without pausing anything.
 * @returns {Promise<ReturnType<typeof mergePatches>>}
 */
export async function openReactionWindow({
  parentId = null,
  windowId,
  baseCtx = {},
  candidates = null,
  patchCtx = {},
  detached = false
} = {}) {
  if (!windowId) return mergePatches([]);
  const scope = createMomentScope(baseCtx);
  const passive = await runPassiveTriggers(momentForWindow(windowId), { baseCtx, parentId, scope });
  const done = (collected = []) => mergePatches([...passive, ...collected]);
  if (!featureEnabled("reactionPause")) return done();

  const groups = candidates ?? collectWindowCandidates(windowId, baseCtx, scope);
  if (!groups.length) return done();

  const isHard = (group) => group.specs.some((s) => (s.mode ?? "hard") === "hard");
  for (const group of groups.filter((g) => !isHard(g))) {
    announce(group, parentId);
    showPrompt(group, promptOptions(group, { parentId, windowId, hard: false }));
  }
  const hardGroups = groups.filter(isHard);
  if (!hardGroups.length) return done();

  const waitId = parentId ?? (detached ? `detached:${windowId}:${++detachedSeq}` : null);
  if (!waitId) return done();
  const combat = parentId ? await import("../combat.mjs") : null;
  const graceMs = getReactionTimeoutMs() + 3000;
  const headless = typeof globalThis.game === "undefined" || !globalThis.game?.user;
  let rulesContext = baseCtx.rulesContext ?? null;

  const collected = [];
  for (const group of hardGroups) {
    if (!isEconomyAvailable(group.actor, "reaction")) continue;
    // Resume phase is derived from the parent's own state (first pause) or its open window.
    const paused = combat
      ? await combat.pauseParentForReaction({
        resolutionId: parentId,
        actorUuid: group.actor.uuid,
        trigger: group.specs.map((s) => s.id).join(","),
        windowId,
        triggerId: group.specs[0]?.id ?? null,
        mode: "hard"
      })
      : null;
    rulesContext = paused?.rulesContext ?? rulesContext;
    announce(group, waitId);
    const options = promptOptions(group, { parentId: waitId, windowId, hard: true });
    const wait = awaitDecision(waitId, group.actor.uuid, graceMs);
    if (headless) completeHardWindowDecision({ parentId: waitId, actorUuid: group.actor.uuid, used: false });
    else showPrompt(group, options);

    const decision = await wait;
    clearReactionPromptFor(waitId, group.actor.uuid);
    if (!decision?.used) continue;

    const spec = specForUsedItem(group, decision.itemId);
    const patchInput = {
      ...group.ctx,
      ...patchCtx,
      parentId,
      rulesContext,
      actor: group.actor,
      tokenUuid: group.ctx.tokenUuid ?? tokenUuidOf(group.token),
      reactor: group.actor,
      slotLevel: decision.slotLevel ?? null,
      counterSlotLevel: decision.slotLevel ?? null,
      allyUuid: decision.allyUuid ?? null,
      targetUuid: group.ctx.isTarget ? tokenUuidOf(group.token) : (group.ctx.targetUuids?.[0] ?? null)
    };
    const patches = typeof spec.buildPatches === "function" ? await spec.buildPatches(patchInput, scope) : [];
    collected.push(...patches);
    if (patches.some((p) => p.type === "cancelCast")) break;
  }

  if (combat) await combat.resumeParent(parentId, collected);
  return done(collected);
}

/**
 * Map hard-window patches onto per-target damage specs for applyDamageWithTrail.
 * @param {Array<string|{ uuid: string, multiplier?: number }>} targets
 */
export function damageTargetsFromPatches(targets = [], merged = null) {
  return targets.map((raw) => {
    const t = typeof raw === "string" ? { uuid: raw } : { ...raw };
    if (!merged) return t;
    const actorUuid = actorFromUuid(t.uuid)?.uuid ?? null;
    const pick = (map) => map?.get?.(t.uuid) ?? (actorUuid ? map?.get?.(actorUuid) : undefined);
    const mult = pick(merged.damageMultiplierByTarget);
    const reduce = pick(merged.damageReduceByTarget);
    const resist = pick(merged.resistTypesByTarget);
    if (mult != null) t.multiplier = (Number(t.multiplier ?? 1) || 1) * mult;
    if (reduce) t.reduce = (Number(t.reduce) || 0) + reduce;
    if (resist?.length) t.resistTypes = [...new Set([...(t.resistTypes ?? []), ...resist])];
    return t;
  });
}

/** Owner-side handler for a relayed prompt: show it here, answer the origin on decide. */
function onRemotePrompt(data) {
  try {
    const actor = actorFromUuid(data.actorUuid);
    const activities = actor ? activitiesFromRefs(actor, data.refs) : [];
    const options = { ...(data.options ?? {}), relayUserId: data.fromUserId };
    if (!activities.length) {
      sendReactionDecision(data.fromUserId, { options: data.options ?? {}, used: false });
      return;
    }
    startReactionPrompt(actor, activities, data.windowId, options);
  } catch (err) {
    console.error("illusive-dnd-5e | oa | remote prompt failed", err);
    sendReactionDecision(data.fromUserId, { options: data.options ?? {}, used: false });
  }
}

function onDismiss(data) {
  const actorId = data?.actorId ?? null;
  if (actorId && getReactionContext()?.actorId === actorId) clearReactionPrompt();
  closeReactionDialog(actorId);
}

async function onWatch(data) {
  const ended = await showForceEndDialog({
    id: data?.actorId,
    name: data?.actorName,
    uuid: data?.actorUuid
  });
  if (!ended) return;
  if (data?.ownerUserId) sendReactionControl(data.ownerUserId, "dismiss", { actorId: data.actorId });
  sendReactionDecision(data?.fromUserId, { options: data?.options ?? {}, used: false });
}

async function onRemoteDecision(data) {
  closeReactionDialog(data.options?.actorId ?? null);
  const { settleReactionPrompt } = await import("../reaction-context.mjs");
  await settleReactionPrompt(data.options ?? {}, {
    used: Boolean(data.used),
    itemId: data.itemId ?? null,
    slotLevel: data.slotLevel ?? null,
    allyUuid: data.allyUuid ?? null
  });
}

export function bindReactionRelay() {
  bindReactionSocket({
    onPrompt: onRemotePrompt,
    onDecision: (data) => void onRemoteDecision(data),
    onDismiss,
    onWatch: (data) => void onWatch(data)
  });
}
