import { getReactionTimeoutMs } from "./economy.mjs";
import { resolveTriggerTokenUuid, useActivityFromHud } from "./activity.mjs";
import { MODULE_ID } from "../constants.mjs";
import { resolveActionBarToken } from "../hud/lib/action-bar-token.mjs";
import { getTargetPickState } from "../hud/components/action-bar/action-bar-target-picker.mjs";
import { findActorTokenDoc, findTokenViewById, tokenViewFromDoc } from "../foundry/token-step.mjs";
import { tokenForActor } from "../foundry/token-lookup.mjs";
import { illusiveDnd } from "../i18n/index.mjs";

let reactionContext = null;
let reactionPromptTimer = null;
/** @type {Map<string, { close: Function }>} */
const reactionDialogs = new Map();

export function trackReactionDialog(actorId, dialog) {
  if (actorId && dialog) reactionDialogs.set(actorId, dialog);
}

export function closeReactionDialog(actorId) {
  const dialog = reactionDialogs.get(actorId);
  reactionDialogs.delete(actorId);
  try {
    dialog?.close();
  } catch {
    /* already closed */
  }
  releaseDialogLock();
}

/**
 * A modal dialog that is removed while open leaves the page inert in Chromium.
 * Tokens then ignore clicks. Drop that lock once nothing is still open.
 */
export function releaseDialogLock() {
  const root = globalThis.document;
  if (!root?.body) return;
  setTimeout(() => {
    if ([...root.querySelectorAll("dialog")].some((dialog) => dialog.open)) return;
    for (const el of root.querySelectorAll("[inert]")) {
      try { el.inert = false; } catch { /* ignore */ }
    }
    const dummy = root.createElement("dialog");
    dummy.style.cssText = "position:fixed;width:0;height:0;padding:0;border:0;opacity:0";
    root.body.append(dummy);
    try {
      dummy.showModal();
      dummy.close();
    } catch {
      /* ignore */
    }
    dummy.remove();
  }, 0);
}

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
  reactionPromptTimer = null;
  // The dialog is the decision. A timer that passes underneath it makes the click do nothing.
  const dialog = globalThis.foundry?.applications?.api?.DialogV2;
  if (typeof dialog?.wait !== "function") {
    reactionPromptTimer = setTimeout(() => {
      passReaction();
    }, timeoutMs);
  }

  try {
    globalThis.Hooks?.callAll?.(`${MODULE_ID}.reactionPrompt`, { actor, triggerType, options });
  } catch {
    /* HUD optional */
  }
  void presentReactionChoice(actor, activities, options);
}

function activityItemName(activity) {
  try {
    return activity?.item?.name ?? activity?.parent?.parent?.name ?? null;
  } catch {
    return activity?.parent?.parent?.name ?? null;
  }
}

/** dnd5e names most weapon activities "Attack". The weapon name is what the player can tell apart. */
export function reactionChoiceLabel(activity) {
  const itemName = activityItemName(activity);
  const activityName = activity?.name || activity?.label || null;
  const generic = !activityName || /^(attack|use|action)$/i.test(String(activityName).trim());
  if (itemName && (generic || itemName === activityName)) return itemName;
  if (itemName && activityName) return `${itemName} — ${activityName}`;
  return activityName || itemName || "Use";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function moverName(options) {
  const uuid = options?.moverUuid;
  if (!uuid || typeof globalThis.fromUuidSync !== "function") return null;
  try {
    const doc = globalThis.fromUuidSync(uuid);
    return doc?.name ?? doc?.actor?.name ?? null;
  } catch {
    return null;
  }
}

function checkedPickValues(root) {
  if (!root?.querySelectorAll) return [];
  const selected = [];
  root.querySelectorAll('input[type="checkbox"]').forEach((box) => {
    if (box.checked && box.value) selected.push(box.value);
  });
  return selected;
}

function parseBatchPicks(choice, groups) {
  if (choice == null || choice === false || choice === "pass") return [];
  const values = Array.isArray(choice) ? choice : [];
  const seen = new Set();
  const picks = [];
  for (const value of values) {
    const [groupRaw, optionRaw] = String(value).split(":");
    const group = Number(groupRaw);
    const option = Number(optionRaw);
    const chosen = groups[group]?.options?.[option];
    if (!chosen || seen.has(group)) continue;
    seen.add(group);
    picks.push({ group, option, id: chosen.id });
  }
  return picks;
}

/**
 * One window for every creature who can react.
 * Each option is a checkbox. One check per creature. All pass or Confirm.
 * @returns {Promise<{ picks: { group: number, option: number, id: string }[] }>}
 */
export async function reactionBatchDialog({ title, sentence, groups = [] } = {}) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (typeof DialogV2?.wait !== "function") {
    console.info("illusive-dnd-5e | oa | reaction dialog missing", {
      actors: groups.map((group) => group.actorName),
      waitType: typeof DialogV2?.wait
    });
    return null;
  }
  const sections = groups.map((group, groupIndex) => {
    const actorKey = String(group.actorId ?? groupIndex);
    const rows = (group.options ?? []).map((option, optionIndex) => {
      const value = `${groupIndex}:${optionIndex}`;
      return `<label class="checkbox" style="display:flex;align-items:center;gap:0.75rem;margin:0.35rem 0;font-size:1rem;"><input type="checkbox" name="pick-${value}" value="${escapeHtml(value)}" data-actor="${escapeHtml(actorKey)}" style="width:1.25rem;height:1.25rem;flex:0 0 1.25rem;"> ${escapeHtml(option.label)}</label>`;
    }).join("");
    return `<section style="margin:0.75rem 0 1rem;"><h4 style="margin:0 0 0.35rem;">${escapeHtml(group.actorName ?? "A creature")}</h4>${rows}</section>`;
  }).join("");
  console.info("illusive-dnd-5e | oa | reaction dialog open", {
    actors: groups.map((group) => group.actorName),
    options: groups.map((group) => (group.options ?? []).map((option) => option.label))
  });
  let choice = null;
  try {
    choice = await DialogV2.wait({
      window: { title },
      position: { width: 480 },
      content: `<div style="min-width:28rem;"><p>${escapeHtml(sentence)}</p>${sections}</div>`,
      rejectClose: false,
      modal: false,
      buttons: [
        {
          action: "pass",
          label: illusiveDnd.reaction("allPass"),
          callback: () => "pass"
        },
        {
          action: "confirm",
          label: illusiveDnd.reaction("confirm"),
          default: true,
          callback: (_event, button, dialog) => checkedPickValues(dialog?.element ?? button?.form)
        }
      ],
      render: (_event, dialog) => {
        trackReactionDialog(groups[0]?.actorId, dialog);
        const root = dialog?.element;
        if (!root?.querySelectorAll) return;
        for (const box of root.querySelectorAll('input[type="checkbox"]')) {
          box.addEventListener("change", () => {
            if (!box.checked) return;
            const actor = box.getAttribute("data-actor");
            for (const other of root.querySelectorAll('input[type="checkbox"]')) {
              if (other !== box && other.getAttribute("data-actor") === actor) other.checked = false;
            }
          });
        }
      }
    });
  } catch {
    return { picks: [] };
  } finally {
    releaseDialogLock();
  }
  return { picks: parseBatchPicks(choice, groups) };
}

/** A real dialog. The action bar is not the prompt. */
async function presentReactionChoice(actor, activities, options = {}) {
  const reactorName = actor?.name ?? "A creature";
  const opportunity = options?.opportunityAttack === true;
  const title = opportunity ? illusiveDnd.t("opportunity.title") : illusiveDnd.reaction("title");
  const mover = moverName(options);
  const sentence = opportunity
    ? illusiveDnd.t("opportunity.batch", { mover: mover || "A creature" })
    : illusiveDnd.reaction("prompt", { name: reactorName });
  const result = await reactionBatchDialog({
    title,
    sentence,
    groups: [{
      actorId: actor?.id ?? null,
      actorName: reactorName,
      options: (activities ?? []).map((activity, index) => ({
        id: String(activity?.id ?? activity?._id ?? index),
        label: reactionChoiceLabel(activity)
      }))
    }]
  });
  if (!result) return;
  if (getReactionContext()?.actorId !== actor?.id) return;
  const pick = result.picks[0];
  if (!pick) {
    passReaction();
    return;
  }
  const activity = activities?.[pick.option];
  const itemId = activity?.item?.id ?? activity?.parent?.id ?? null;
  const token = findTokenForActor(actor);
  if (!activity || !itemId || !token) {
    passReaction();
    return;
  }
  const used = await useReactionFromHud(token, itemId, activity.id ?? activity._id);
  if (!used && getReactionContext()?.actorId === actor?.id) passReaction();
}

/** GM prompt that can end a player-owned reaction. Closing it leaves the player's choice open. */
export async function showForceEndDialog(actor) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (typeof DialogV2?.wait !== "function") return false;
  const name = actor?.name || "They";
  let choice = null;
  try {
    choice = await DialogV2.wait({
      window: { title: illusiveDnd.reaction("forceTitle") },
      content: `<p>${illusiveDnd.reaction("forceBody", { name })}</p>`,
      rejectClose: false,
      modal: false,
      buttons: [{
        action: "end",
        label: illusiveDnd.reaction("force"),
        callback: () => "end"
      }],
      render: (_event, dialog) => trackReactionDialog(actor?.id, dialog)
    });
  } catch {
    return false;
  } finally {
    releaseDialogLock();
  }
  return choice === "end";
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
  await runReactionUseHooks("before", triggerIds, actor, item, options);
  const used = await useActivityFromHud(token, item, activity, "reaction", {}, context, { spellLevel });
  if (used) await runReactionUseHooks("after", triggerIds, actor, item, options);
  try {
    await decideReactionPrompt(options, { used, itemId, slotLevel, allyUuid });
  } catch {
    /* ignore */
  }
  return used;
}
