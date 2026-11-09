import { getReactionTimeoutMs } from "./economy.mjs";
import { resolveTriggerTokenUuid, useActivityFromHud } from "./activity.mjs";
import { MODULE_ID } from "../constants.mjs";
import { resolveActionBarToken } from "../hud/lib/action-bar-token.mjs";
import { getTargetPickState } from "../hud/components/action-bar/action-bar-target-picker.mjs";
import { findActorTokenDoc, findTokenViewById, tokenViewFromDoc } from "../foundry/token-step.mjs";
import { tokenForActor } from "../foundry/token-lookup.mjs";

let reactionContext = null;
let reactionPromptTimer = null;

export function getReactionContext() {
  return reactionContext;
}

export function setReactionContext(context) {
  reactionContext = context;
}

export function clearReactionContext() {
  reactionContext = null;
}

export function buildReactionKeys(activities) {
  return new Set(
    (activities ?? []).map((activity) => {
      const itemId = activity.item?.id ?? activity.parent?.id;
      return `${itemId}:${activity.id}`;
    })
  );
}

export function findTokenForActor(actor, { preferControlled = true } = {}) {
  if (!actor) return null;
  const sameActor = (token) => token.actor === actor
    || (actor.uuid && token.actor?.uuid === actor.uuid)
    || token.actor?.id === actor.id;

  if (preferControlled) {
    const controlled = canvas?.tokens?.controlled?.find(sameActor);
    if (controlled) return controlled;
  }

  const placeable = tokenForActor(actor) ?? canvas?.tokens?.placeables?.find(sameActor);
  if (placeable) return placeable;
  return tokenViewFromDoc(findActorTokenDoc(actor));
}

export function isReactionActorForUser(actor) {
  return Boolean(actor?.isOwner);
}

export function getActionBarToken() {
  // Keep the casting token on the HUD while the target picker is open.
  const pick = getTargetPickState();
  if (pick?.tokenId) {
    const casting = findTokenViewById(pick.tokenId);
    if (casting) return casting;
  }
  return resolveActionBarToken(reactionContext);
}

/**
 * Prompts waiting behind the one on screen. A creature answers one prompt at a
 * time; a hard prompt (something is paused on it) jumps ahead of soft ones.
 * @type {{ actor: object, activities: object[], triggerType: string, options: object, at: number }[]}
 */
let promptQueue = [];

function isHard(options) {
  return Boolean(options?.hardWindow);
}

function promptStale(entry, timeoutMs) {
  if (isHard(entry.options)) {
    return !hardWaitPending(entry.options.parentId, entry.options.actorUuid);
  }
  return Date.now() - entry.at > timeoutMs * 2;
}

let hardWaitPending = () => true;
import("./reactions/window.mjs")
  .then((m) => { hardWaitPending = m.isHardWaitPending ?? hardWaitPending; })
  .catch(() => null);

export function listQueuedReactionPrompts() {
  return promptQueue.map((p) => ({ actorId: p.actor?.id ?? null, triggerType: p.triggerType, hard: isHard(p.options) }));
}

function showNextQueuedPrompt() {
  const timeoutMs = getReactionTimeoutMs();
  while (promptQueue.length) {
    const next = promptQueue.shift();
    if (promptStale(next, timeoutMs)) continue;
    showReactionPrompt(next.actor, next.activities, next.triggerType, next.options);
    return true;
  }
  return false;
}

export function startReactionPrompt(actor, activities, triggerType, options = {}) {
  if (!actor?.id) return;
  const entry = { actor, activities, triggerType, options, at: Date.now() };
  if (reactionContext) {
    if (isHard(options) && !isHard(reactionContext.options)) {
      const current = reactionContext;
      if (reactionPromptTimer) clearTimeout(reactionPromptTimer);
      reactionPromptTimer = null;
      promptQueue.unshift({
        actor: current.actor ?? { id: current.actorId },
        activities: current.activities ?? [],
        triggerType: current.triggerType,
        options: current.options ?? {},
        at: Date.now()
      });
    } else {
      if (isHard(options)) promptQueue.unshift(entry);
      else promptQueue.push(entry);
      return;
    }
  }
  showReactionPrompt(actor, activities, triggerType, options);
}

/** Drop prompts (queued or shown) caused by resolutions that were just undone. */
export function dismissReactionPromptsFor(resolutionIds = []) {
  const ids = new Set(resolutionIds);
  const caused = (options) => ids.has(options?.parentId) || ids.has(options?.parentResolutionId);
  promptQueue = promptQueue.filter((p) => !caused(p.options));
  if (reactionContext && caused(reactionContext.options)) passReaction();
}

function showReactionPrompt(actor, activities, triggerType, options = {}) {
  const timeoutMs = getReactionTimeoutMs();

  setReactionContext({
    actor,
    activities,
    actorId: actor.id,
    reactionKeys: buildReactionKeys(activities),
    triggerType,
    triggerTokenUuid: resolveTriggerTokenUuid(options, reactionContext),
    options,
    flavor: triggerType
  });

  if (reactionPromptTimer) clearTimeout(reactionPromptTimer);
  reactionPromptTimer = setTimeout(() => {
    passReaction();
  }, timeoutMs);
}

/**
 * Close out a prompt decision on the client that opened it.
 * Hard window → release the paused parent's wait.
 * Soft window → nothing to resolve (the parent never waited).
 * OA → complete the pending shell, then release the held move.
 */
export async function settleReactionPrompt(options = {}, {
  used = false,
  itemId = null,
  slotLevel = null,
  allyUuid = null
} = {}) {
  if (options.hardWindow) {
    const { completeHardWindowDecision } = await import("./reactions/window.mjs");
    completeHardWindowDecision({
      parentId: options.parentId,
      actorUuid: options.actorUuid,
      used,
      itemId,
      slotLevel,
      allyUuid
    });
    return;
  }
  const pendingMoveTokenId = options.pendingMoveTokenId ?? null;
  const moverUuid = options.moverUuid ?? null;
  if (options.windowId && !pendingMoveTokenId && !moverUuid) return;

  const { getActiveResolutionId, getResolution, resolveReaction } = await import("./combat.mjs");
  const id = getActiveResolutionId();
  const res = id ? getResolution(id) : null;
  if (res?.phase === "awaiting-reaction" && !res.pendingDecision?.options?.hardParent) {
    await resolveReaction({
      resolutionId: id,
      used,
      summary: used ? "Reaction used" : "Reaction passed"
    });
  }
  const { applyPendingMove, releasePendingMovesForMover } = await import("./opportunity-attack.mjs");
  if (pendingMoveTokenId) await applyPendingMove(pendingMoveTokenId);
  else if (moverUuid) await releasePendingMovesForMover(moverUuid);
}

/** Relayed prompts answer the client that asked; local prompts settle here. */
async function decideReactionPrompt(options = {}, decision = {}) {
  if (options.relayUserId) {
    const { sendReactionDecision } = await import("../foundry/reaction-socket.mjs");
    const { relayUserId, ...origin } = options;
    sendReactionDecision(relayUserId, {
      options: origin,
      used: Boolean(decision.used),
      itemId: decision.itemId ?? null,
      slotLevel: decision.slotLevel ?? null,
      allyUuid: decision.allyUuid ?? null
    });
    return;
  }
  await settleReactionPrompt(options, decision);
}

export function passReaction() {
  const options = reactionContext?.options ?? {};
  clearReactionPrompt();
  decideReactionPrompt(options, { used: false }).catch(() => null);
}

export function clearReactionPrompt() {
  if (reactionPromptTimer) {
    clearTimeout(reactionPromptTimer);
    reactionPromptTimer = null;
  }
  clearReactionContext();
  Hooks.callAll(`${MODULE_ID}.reactionPromptClosed`);
  showNextQueuedPrompt();
}

/** Close one hard window's prompt (shown or queued) without touching anyone else's. */
export function clearReactionPromptFor(parentId, actorUuid) {
  const same = (options) => options?.parentId === parentId && options?.actorUuid === actorUuid;
  promptQueue = promptQueue.filter((p) => !same(p.options));
  if (reactionContext && same(reactionContext.options)) clearReactionPrompt();
}

export function _resetReactionPromptQueue() {
  promptQueue = [];
}

/** Silvery Barbs ally: the owner's first target that is not the triggering creature. */
function allyFromTargets(triggerTokenUuid) {
  for (const target of game.user?.targets ?? []) {
    const uuid = target.document?.uuid ?? target.uuid ?? null;
    if (uuid && uuid !== triggerTokenUuid && target.actor?.uuid) return target.actor.uuid;
  }
  return null;
}

/**
 * @param {{ spellLevel?: number|null }} [useOptions] spellLevel from the HUD slot picker
 */
export async function useReactionFromHud(token, itemId, activityId, { spellLevel = null } = {}) {
  const context = reactionContext;
  const actor = token?.actor;
  if (!context || context.actorId !== actor?.id) return false;

  const item = actor.items.get(itemId);
  const activity = item?.system?.activities?.get(activityId);
  if (!activity) return false;

  const options = context.options ?? {};
  const triggerIds = options.triggerIds ?? [];
  const allyUuid = allyFromTargets(context.triggerTokenUuid ?? options.triggerTokenUuid ?? null);
  const slotLevel = item.type === "spell"
    ? (Number(spellLevel) || Number(item.system?.level) || null)
    : null;
  const { runReactionUseHooks } = await import("./reactions/registry.mjs");
  // Clear first: the reaction's own resolution may open nested windows (Counterspell on Shield).
  clearReactionPrompt();
  await runReactionUseHooks("before", triggerIds, actor, item);
  const used = await useActivityFromHud(token, item, activity, "reaction", {}, context, { spellLevel });
  if (used) await runReactionUseHooks("after", triggerIds, actor, item);
  try {
    await decideReactionPrompt(options, { used, itemId, slotLevel, allyUuid });
  } catch {
    /* ignore */
  }
  return used;
}
