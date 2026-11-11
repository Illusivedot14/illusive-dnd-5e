/**
 * Hybrid reaction windows — hard pause on the parent, soft prompts elsewhere.
 * See docs/combat-engine.md §6.
 *
 * Every reactor for a moment shares one checkbox window. The owning player
 * sees their creatures; the GM sees the rest. Chosen reactions resolve in
 * initiative order, and a cancelled cast stops the ones after it.
 */

import { featureEnabled } from "../levels.mjs";
import { isEconomyAvailable, getReactionTimeoutMs } from "../economy.mjs";
import {
  startReactionPrompt,
  clearReactionPrompt,
  getReactionContext,
  closeReactionDialog,
  showForceEndDialog,
  reactionBatchDialog,
  reactionChoiceLabel
} from "../reaction-context.mjs";
import { emitCombatFx } from "../combat-fx.mjs";
import { queryName } from "../../foundry/gm-query.mjs";
import { illusiveDnd } from "../../i18n/index.mjs";
import { MODULE_ID } from "../../constants.mjs";
import { isIncapacitated } from "../../domain/combat/conditions.mjs";
import { actorFromUuid, tokenFromUuid, tokenUuidOf } from "../../foundry/token-lookup.mjs";
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
  mergePatches,
  runReactionUseHooks
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
    if (isIncapacitated(actor) || !isEconomyAvailable(actor, "reaction", token)) continue;

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

function specForUsedItem(group, itemId) {
  if (group.specs.length === 1 || !itemId) return group.specs[0];
  const item = group.actor.items?.get?.(itemId)
    ?? [...(group.actor.items ?? [])].find((i) => i.id === itemId);
  return group.specs.find((s) => item && s.match(item, group.ctx)) ?? group.specs[0];
}

let detachedSeq = 0;

function creatureKey(group) {
  const token = group.token;
  const actor = group.actor;
  if (token?.document?.actorLink === false) {
    return token.document?.uuid ?? token.uuid ?? token.id ?? actor?.uuid ?? actor?.id ?? null;
  }
  return actor?.uuid ?? actor?.id ?? token?.document?.uuid ?? token?.id ?? null;
}

function optionFor(activity, index) {
  return {
    id: String(activity?.id ?? activity?._id ?? index),
    itemId: activity?.item?.id ?? activity?.parent?.id ?? null,
    label: reactionChoiceLabel(activity)
  };
}

function wireGroup(group) {
  return {
    actorName: group.token?.name ?? group.actor?.name ?? "A creature",
    actorUuid: group.actor?.uuid ?? null,
    actorId: creatureKey(group),
    tokenUuid: tokenUuidOf(group.token),
    triggerIds: (group.specs ?? []).map((spec) => spec.id),
    options: (group.activities ?? []).map(optionFor)
  };
}

/** The owner's client shows the same checkbox window and returns the checks. */
export async function adjudicateReactionQuery(data = {}) {
  const groups = data.groups ?? [];
  const result = await reactionBatchDialog({
    title: data.title || illusiveDnd.reaction("title"),
    sentence: data.sentence || illusiveDnd.reaction("batch"),
    groups: groups.map((group) => ({
      actorId: group.actorId,
      actorName: group.actorName,
      options: group.options ?? []
    }))
  });
  const picks = (result?.picks ?? []).map((pick) => {
    const group = groups[pick.group];
    const option = group?.options?.[pick.option];
    if (!group || !option) return null;
    return {
      actorUuid: group.actorUuid ?? null,
      tokenUuid: group.tokenUuid ?? null,
      itemId: option.itemId ?? null,
      activityId: option.id ?? null,
      triggerIds: group.triggerIds ?? []
    };
  }).filter(Boolean);
  return { picks };
}

async function askOwnerChoices(user, payload) {
  if (typeof user?.query !== "function") return [];
  try {
    const result = await user.query(
      queryName("reactionWindow"),
      payload,
      { timeout: getReactionTimeoutMs() + 3000 }
    );
    return result?.picks ?? [];
  } catch {
    return [];
  }
}

async function chooseReactions(groups) {
  const title = illusiveDnd.reaction("title");
  const leaving = groups[0]?.ctx?.windowId === "on-leave-reach"
    ? (tokenFromUuid(groups[0].ctx.triggerTokenUuid)?.name ?? "A creature")
    : null;
  const sentence = leaving
    ? illusiveDnd.t("opportunity.batch", { mover: leaving })
    : groups.length > 1
      ? illusiveDnd.reaction("batch")
      : illusiveDnd.reaction("prompt", { name: groups[0]?.token?.name ?? groups[0]?.actor?.name ?? "A creature" });
  const buckets = new Map();
  for (const group of groups) {
    const owner = remoteOwnerFor(group.actor);
    const ownerId = owner?.id ?? "local";
    if (!buckets.has(ownerId)) buckets.set(ownerId, { owner, groups: [] });
    buckets.get(ownerId).groups.push(group);
  }
  const picked = await Promise.all([...buckets.values()].map(async (bucket) => {
    if (!bucket.owner) {
      const local = await adjudicateReactionQuery({
        title,
        sentence,
        groups: bucket.groups.map(wireGroup)
      });
      return local.picks ?? [];
    }
    return askOwnerChoices(bucket.owner, {
      title,
      sentence,
      groups: bucket.groups.map(wireGroup)
    });
  }));
  return picked.flat();
}

function allyFromTargets(triggerTokenUuid) {
  for (const target of globalThis.game?.user?.targets ?? []) {
    const uuid = target.document?.uuid ?? target.uuid ?? null;
    if (uuid && uuid !== triggerTokenUuid && target.actor?.uuid) return target.actor.uuid;
  }
  return null;
}

async function useChosenReaction(group, pick) {
  const actor = group.actor;
  const activity = (group.activities ?? []).find((entry) => String(entry?.id ?? entry?._id) === String(pick.activityId))
    ?? (group.activities ?? []).find((entry) => (entry?.item?.id ?? entry?.parent?.id) === pick.itemId);
  const item = activity?.item ?? actor?.items?.get?.(pick.itemId) ?? null;
  const token = group.token?.document ? group.token : (group.token?.object ?? group.token);
  const triggerIds = pick.triggerIds ?? group.specs?.map((spec) => spec.id) ?? [];
  const options = {
    windowId: group.ctx?.windowId ?? null,
    triggerIds,
    triggerTokenUuid: group.ctx?.triggerTokenUuid ?? null,
    targetUuids: group.ctx?.targetUuids ?? [],
    parentId: group.ctx?.parentId ?? null
  };
  let used = false;
  if (token && item && activity) {
    try {
      await runReactionUseHooks("before", triggerIds, actor, item, options);
      const { useActivityFromHud } = await import("../activity.mjs");
      const hudOptions = { ...options };
      if (options.windowId === "on-leave-reach") {
        hudOptions.parentLogId = options.parentId ?? null;
        hudOptions.opportunityAttack = triggerIds.includes("opportunity");
      }
      used = await useActivityFromHud(token, item, activity, "reaction", {}, {
        triggerTokenUuid: options.triggerTokenUuid,
        options: hudOptions
      }, { validateTargets: false });
      if (used) await runReactionUseHooks("after", triggerIds, actor, item, options);
    } catch {
      used = false;
    }
  }
  if (!used) return null;
  const slotLevel = item?.type === "spell" ? (Number(item.system?.level) || null) : null;
  return {
    used: true,
    itemId: pick.itemId ?? item?.id ?? null,
    slotLevel,
    allyUuid: allyFromTargets(options.triggerTokenUuid)
  };
}

async function askOwnerUse(user, pick) {
  if (typeof user?.query !== "function") return null;
  try {
    const result = await user.query(
      queryName("reactionUse"),
      pick,
      { timeout: getReactionTimeoutMs() + 3000 }
    );
    return result?.used ? result : null;
  } catch {
    return null;
  }
}

/** Owner-side: spend the reaction and use the chosen activity. */
export async function useReactionQuery(data = {}) {
  const actor = actorFromUuid(data.actorUuid);
  const { tokenFromUuid } = await import("../../foundry/token-lookup.mjs");
  const placeable = tokenFromUuid(data.tokenUuid) ?? (actor ? { actor, document: { uuid: data.tokenUuid } } : null);
  if (!actor || !placeable) return { used: false };
  const item = actor.items?.get?.(data.itemId);
  const activity = item?.system?.activities?.get?.(data.activityId)
    ?? (data.activityId ? { id: data.activityId, item } : null);
  if (!item || !activity) return { used: false };
  const decision = await useChosenReaction({
    actor,
    token: placeable,
    activities: [activity],
    specs: (data.triggerIds ?? []).map((id) => ({ id })),
    ctx: {
      windowId: data.windowId ?? null,
      parentId: data.parentId ?? null,
      triggerTokenUuid: data.triggerTokenUuid ?? null,
      targetUuids: data.targetUuids ?? []
    }
  }, data);
  return decision ?? { used: false };
}

/**
 * Open a reaction window on a parent resolution.
 * Every eligible creature is a section of one checkbox window.
 * Hard: pause the parent until that window is confirmed.
 * detached: hard window with no parent resolution (falls).
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

  const isHard = (group) => group.specs.some((spec) => (spec.mode ?? "hard") === "hard");
  const hard = groups.some(isHard);
  const waitId = parentId ?? (detached && hard ? `detached:${windowId}:${++detachedSeq}` : null);
  if (hard && !waitId) return done();

  const combat = parentId ? await import("../combat.mjs") : null;
  let rulesContext = baseCtx.rulesContext ?? null;
  const holdKey = waitKey(waitId ?? windowId, "*");
  if (hard) {
    pendingHard.set(holdKey, { resolve: () => null, parentId: waitId, timer: null });
    if (combat) {
      const paused = await combat.pauseParentForReaction({
        resolutionId: parentId,
        actorUuid: groups.find(isHard)?.actor?.uuid ?? null,
        trigger: groups.flatMap((group) => group.specs.map((spec) => spec.id)).join(","),
        windowId,
        triggerId: groups[0]?.specs?.[0]?.id ?? null,
        mode: "hard"
      });
      rulesContext = paused?.rulesContext ?? rulesContext;
    }
  }

  let picks = [];
  const collected = [];
  try {
    for (const group of groups) announce(group, waitId ?? parentId);
    picks = await chooseReactions(groups);
  for (const group of groups) {
    const pick = picks.find((entry) => entry.actorUuid && entry.actorUuid === group.actor?.uuid)
      ?? picks.find((entry) => entry.actorId && entry.actorId === creatureKey(group));
    if (!pick) continue;
    const owner = remoteOwnerFor(group.actor);
    const decision = owner
      ? await askOwnerUse(owner, {
        ...pick,
        windowId,
        parentId: group.ctx?.parentId ?? parentId ?? null,
        triggerTokenUuid: group.ctx?.triggerTokenUuid ?? null,
        targetUuids: group.ctx?.targetUuids ?? []
      })
      : await useChosenReaction(group, pick);
    if (!decision?.used) continue;

    const spec = specForUsedItem(group, decision.itemId);
    const patchInput = {
      ...group.ctx,
      ...patchCtx,
      parentId,
      rulesContext,
      actor: group.actor,
      tokenUuid: group.ctx?.tokenUuid ?? tokenUuidOf(group.token),
      reactor: group.actor,
      slotLevel: decision.slotLevel ?? null,
      counterSlotLevel: decision.slotLevel ?? null,
      allyUuid: decision.allyUuid ?? null,
      targetUuid: group.ctx?.isTarget ? tokenUuidOf(group.token) : (group.ctx?.targetUuids?.[0] ?? null)
    };
    const patches = spec && typeof spec.buildPatches === "function"
      ? await spec.buildPatches(patchInput, scope)
      : [];
    collected.push(...patches);
    if (patches.some((patch) => patch.type === "cancelCast")) break;
  }

    if (combat && hard) await combat.resumeParent(parentId, collected);
    return done(collected);
  } finally {
    pendingHard.delete(holdKey);
  }
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
