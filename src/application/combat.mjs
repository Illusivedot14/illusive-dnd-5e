/**
 * Combat use cases: start/resume resolutions, reaction pause, correction undo.
 */

import { createActionResolution, appendTrace } from "../domain/combat/action-state.mjs";
import { advanceAction } from "../domain/combat/advance-action.mjs";
import { createRuleContext } from "../domain/rule-context.mjs";
import { resolveRulesContext } from "../foundry/dnd5e-adapter.mjs";
import {
  loadResolution,
  saveResolution,
  nextResolutionId,
  hydrateFromStore
} from "../foundry/workflow-store.mjs";
import { applyUndoPlan } from "../foundry/document-adapter.mjs";
import { buildHudView } from "./hud-view.mjs";
import { featureEnabled } from "./levels.mjs";
import { resolveActivity, clearDamageApplied, unwrapCastActivity } from "./resolve-activity.mjs";
import { refundEconomySpend } from "./economy.mjs";
import { clearUserTargets } from "../foundry/token-actions.mjs";
import { postGmResolutionChat } from "../foundry/gm-resolution-chat.mjs";
import { MODULE_ID } from "../constants.mjs";
import {
  recordResolutionOnGameLog,
  recordAbilityUseStartedOnGameLog
} from "./combat-game-log.mjs";

const memory = new Map();
let activeResolutionId = null;
let lastCompletedId = null;
/** Target UUIDs from the last HUD launch — kept across async dnd5e rolls. */
let lastTargetUuids = [];
/** Resolution that caused the current reaction prompt (for game-log parent links). */
let causingResolutionId = null;

function storeLocal(resolution) {
  memory.set(resolution.id, resolution);
  return resolution;
}

async function persist(state) {
  storeLocal(state);
  await saveResolution(state);
  return state;
}

function emitHudRefresh() {
  try {
    Hooks.callAll(`${MODULE_ID}.resolutionUpdated`, getLastResolutionView());
  } catch {
    /* tests */
  }
}

async function notifyGmResolution(state) {
  if (!state || !["completed", "corrected"].includes(state.phase)) return;
  try {
    await postGmResolutionChat(state);
  } catch {
    /* chat unavailable in unit tests */
  }
}

function serializeRolls(rolls, kind) {
  return (rolls ?? []).map((roll) => ({
    formula: roll?.formula ?? null,
    total: Number.isFinite(roll?.total) ? roll.total : null,
    kind,
    isCritical: Boolean(roll?.isCritical),
    isFumble: Boolean(roll?.isFumble),
    options: roll?.options ? { type: roll.options.type } : null
  }));
}

/**
 * Open a pending OA / reaction resolution without firing an activity yet.
 */
export async function beginPendingReaction({
  actorUuid,
  moverUuid = null,
  trigger = "opportunity",
  rule = null,
  timeoutMs = 12000,
  parentResolutionId = null
} = {}) {
  if (!featureEnabled("reactionPause")) return null;
  const id = nextResolutionId();
  const parentId = parentResolutionId ?? activeResolutionId ?? causingResolutionId;
  let state = createActionResolution({
    id,
    actorUuid,
    rulesContext: createRuleContext(),
    phase: "created",
    parentResolutionId: parentId
  });
  if (parentId) causingResolutionId = parentId;
  const paused = advanceAction(state, {
    type: "awaitReaction",
    actorUuid,
    trigger,
    timeoutMs,
    options: { moverUuid, rule, parentResolutionId: parentId }
  });
  state = await persist(paused.state);
  activeResolutionId = state.id;
  emitHudRefresh();
  return state.id;
}

export async function startHudAction({ token, item, activity, section, event, useOptions = {} }) {
  const actor = token?.actor ?? item?.actor ?? activity?.actor;
  const rulesContext = createRuleContext(resolveRulesContext(actor, item));
  const id = nextResolutionId();
  const parentResolutionId = useOptions.parentResolutionId
    ?? (section === "reaction" ? (causingResolutionId ?? activeResolutionId) : null);
  const activationType = activity?.activation?.type
    ?? item?.system?.activation?.type
    ?? null;
  // Cast shells (Spellcasting → Fireball): log/resolve under the linked spell name.
  const cast = unwrapCastActivity(item, activity);
  const displayItem = cast.item ?? item;
  const displayActivity = cast.activity ?? activity;
  const abilityName = displayItem?.name ?? item?.name ?? "Activity";
  let state = createActionResolution({
    id,
    actorUuid: actor?.uuid ?? null,
    itemUuid: displayItem?.uuid ?? item?.uuid ?? null,
    activityId: displayActivity?.id ?? displayActivity?._id ?? activity?.id ?? activity?._id ?? null,
    rulesContext,
    phase: "created",
    parentResolutionId,
    activationType
  });

  const targetUuids = Array.isArray(useOptions.targetUuids) ? [...useOptions.targetUuids] : [];
  lastTargetUuids = targetUuids;

  const started = advanceAction(state, {
    type: "start",
    targetUuids,
    useOptions,
    domEvent: event ?? null,
    section
  });
  state = await persist(started.state);
  activeResolutionId = state.id;

  // Always stamp the attempt into the combat log up front.
  recordAbilityUseStartedOnGameLog({
    item: displayItem,
    activity: displayActivity,
    actorUuid: actor?.uuid ?? null,
    tokenUuid: token?.document?.uuid ?? token?.uuid ?? null,
    section,
    resolutionId: id
  });

  let resolved;
  try {
    resolved = await resolveActivity({
      token,
      item,
      activity,
      section,
      event,
      useOptions,
      resolutionId: id
    });
  } catch (error) {
    console.error(`${MODULE_ID} | resolveActivity failed`, error);
    const failed = advanceAction(memory.get(state.id) ?? state, {
      type: "cancel",
      summary: `${abilityName} failed`
    });
    state = await persist(failed.state);
    recordResolutionOnGameLog(state, { parentId: state.parentResolutionId ?? null });
    activeResolutionId = null;
    emitHudRefresh();
    return state.id;
  }

  let current = memory.get(state.id) ?? state;
  if (resolved.economySpend) {
    current = { ...current, economySpend: resolved.economySpend };
    current = await persist(current);
  }
  if (resolved.cancelled) {
    // Spend happened before use() — refund so a dismissed cast does not burn Action.
    if (current.economySpend?.before && current.economySpend?.after && actor) {
      try {
        await refundEconomySpend(actor, current.economySpend.before, current.economySpend.after);
      } catch {
        /* ignore */
      }
    }
    const cancelled = advanceAction(current, {
      type: "cancel",
      reason: "use-dismissed",
      summary: `${resolved.displayName ?? abilityName} cancelled`
    });
    state = await persist(cancelled.state);
    recordResolutionOnGameLog(state, { parentId: state.parentResolutionId ?? null });
    activeResolutionId = null;
    emitHudRefresh();
    return state.id;
  }
  if (resolved.countered) {
    // Countered: the action is still spent (RAW); resolve-activity already refunded the slot when 2024 allows it.
    const countered = advanceAction(current, {
      type: "cancel",
      reason: "countered",
      summary: `${resolved.displayName ?? abilityName} countered`
    });
    state = await persist(countered.state);
    recordResolutionOnGameLog(state, { parentId: state.parentResolutionId ?? null });
    activeResolutionId = null;
    await notifyGmResolution(state);
    emitHudRefresh();
    return state.id;
  }
  if (resolved.rangeBand === "long" || resolved.coverNotes?.length) {
    const bits = [];
    if (resolved.rangeBand === "long") bits.push("Long range (disadvantage)");
    for (const note of resolved.coverNotes ?? []) {
      if (note.blocked || note.level === "total") {
        bits.push("Total cover (blocked)");
      } else if (note.dexSaveBonus) {
        bits.push(`Cover ${note.level} +${note.dexSaveBonus} Dex save`);
      } else {
        bits.push(`Cover ${note.level}${note.acBonus ? ` +${note.acBonus} AC` : ""}`);
      }
    }
    current = appendTrace(current, {
      type: "note",
      rule: "combat.cover.2024",
      detail: bits.join(" · ")
    });
    current = await persist(current);
  }
  if (resolved.attackRolls?.length) {
    current = advanceAction(current, {
      type: "attackRolled",
      rolls: serializeRolls(resolved.attackRolls, "attack"),
      summary: resolved.outcomes?.length
        ? `Hits: ${resolved.outcomes.filter((o) => o.hit).length}/${resolved.outcomes.length}`
        : "Attack roll"
    }).state;
    current = await persist(current);
  }
  if (resolved.saveOutcomes?.length) {
    const saved = resolved.saveOutcomes.filter((o) => o.success).length;
    current = advanceAction(current, {
      type: "saveRolled",
      rolls: resolved.saveOutcomes.map((o) => ({
        formula: null,
        total: o.total,
        kind: "save",
        isCritical: false,
        isFumble: false,
        options: { ability: o.ability, dc: o.dc, saved: o.success }
      })),
      outcomes: resolved.outcomes ?? resolved.saveOutcomes,
      summary: `Saves: ${saved}/${resolved.saveOutcomes.length} succeeded`
    }).state;
    current = await persist(current);
  }
  if (resolved.damageRolls?.length) {
    current = advanceAction(current, {
      type: "damageRolled",
      rolls: serializeRolls(resolved.damageRolls, "damage"),
      summary: "Damage roll"
    }).state;
    current = await persist(current);
  }
  if (resolved.applied?.length) {
    current = advanceAction(current, {
      type: "recordChange",
      changes: resolved.applied,
      summary: `Applied to ${resolved.applied.length} target(s)`,
      rule: resolved.saveOutcomes?.length ? "combat.save-activity" : "combat.activity-use"
    }).state;
    current = await persist(current);
  }
  if (resolved.effects?.length) {
    current = advanceAction(current, {
      type: "recordChange",
      changes: resolved.effects.map((e) => ({
        type: "effect",
        tokenUuid: e.tokenUuid,
        actorUuid: e.actorUuid ?? null,
        effectUuids: e.effectUuids
      })),
      summary: `Effects on ${resolved.effects.length} target(s)`,
      rule: "combat.save-activity"
    }).state;
    current = await persist(current);
  }

  if (featureEnabled("reactionPause") && useOptions.pauseForReaction) {
    const paused = advanceAction(current, {
      type: "awaitReaction",
      actorUuid: useOptions.reactionActorUuid ?? null,
      trigger: useOptions.reactionTrigger ?? "reaction",
      timeoutMs: useOptions.reactionTimeoutMs
    });
    state = await persist(paused.state);
    emitHudRefresh();
    return state.id;
  }

  if (!["completed", "cancelled", "corrected", "awaiting-reaction"].includes(current.phase)) {
    let resultSummary = "";
    if (resolved.saveOutcomes?.length) {
      const saved = resolved.saveOutcomes.filter((o) => o.success).length;
      resultSummary = ` · ${saved}/${resolved.saveOutcomes.length} saved`;
    } else if (resolved.outcomes?.length) {
      resultSummary = ` · ${resolved.outcomes.filter((o) => o.hit).length} hit`;
    }
    // Changes were already recorded above — don't append HP twice on complete.
    const finished = advanceAction(current, {
      type: "useCompleted",
      summary: `${resolved.displayName ?? abilityName} finished${resultSummary}`
    });
    state = await persist(finished.state);
  } else {
    state = current;
  }

  if (state.phase === "completed" || state.phase === "corrected") lastCompletedId = state.id;
  if (state.phase === "completed" || state.phase === "cancelled") {
    recordResolutionOnGameLog(state, { parentId: state.parentResolutionId ?? null });
    if (state.phase === "completed" && !state.parentResolutionId) {
      causingResolutionId = null;
    }
  }
  if (state.phase !== "awaiting-reaction") {
    clearDamageApplied(state.id);
    activeResolutionId = null;
  }
  if (state.phase === "completed" && useOptions.clearTargets !== false) {
    clearUserTargets();
  }
  await notifyGmResolution(state);
  emitHudRefresh();
  return state.id;
}

export async function startAction({ actorUuid, itemUuid, activityId, targetUuids = [], useOptions = {} }) {
  return startHudAction({
    token: { actor: { uuid: actorUuid } },
    item: { uuid: itemUuid, name: "Activity" },
    activity: { id: activityId, use: async () => ({}) },
    useOptions: { targetUuids, ...useOptions }
  });
}

export async function submitEvent({ resolutionId, event }) {
  const id = resolutionId ?? activeResolutionId;
  const current = memory.get(id) ?? (id ? await loadResolution(id) : null);
  if (!current) throw new Error(`Unknown resolution: ${id}`);
  const result = advanceAction(current, event);
  let state = await persist(result.state);

  for (const command of result.commands ?? []) {
    if (command.type !== "applyCorrection") continue;
    const undoResults = await applyUndoPlan(command.payload?.undoPlan ?? []);
    if (state.economySpend?.before && state.economySpend?.after) {
      try {
        const actor = state.actorUuid && typeof fromUuid === "function"
          ? await fromUuid(state.actorUuid)
          : null;
        if (actor) {
          await refundEconomySpend(actor, state.economySpend.before, state.economySpend.after);
        }
      } catch {
        /* ignore */
      }
    }
    state = appendTrace(state, {
      type: "undo",
      rule: "combat.correction",
      detail: `Undo applied (${undoResults.filter((r) => r.ok).length}/${undoResults.length})`
    });
    state = await persist(state);
  }

  if (["completed", "cancelled", "corrected"].includes(state.phase)) {
    lastCompletedId = state.id;
    if (activeResolutionId === state.id) activeResolutionId = null;
  }
  if (state.phase === "completed") {
    recordResolutionOnGameLog(state, { parentId: state.parentResolutionId ?? null });
  }
  await notifyGmResolution(state);
  emitHudRefresh();
  return state;
}

export async function noteRoll({ kind, rolls = [], summary = null } = {}) {
  const id = activeResolutionId;
  if (!id || !memory.has(id)) return null;
  const type = kind === "damage" ? "damageRolled" : "attackRolled";
  return submitEvent({
    resolutionId: id,
    event: {
      type,
      rolls: rolls.map((roll) => ({
        formula: roll?.formula ?? null,
        total: roll?.total ?? null,
        kind
      })),
      summary
    }
  });
}

/**
 * Pause the parent resolution at a hard reaction window (does not complete it).
 */
export async function pauseParentForReaction({
  resolutionId,
  actorUuid = null,
  trigger = "reaction",
  windowId = null,
  triggerId = null,
  resumePhase = null,
  mode = "hard",
  timeoutMs = 12000
} = {}) {
  const id = resolutionId ?? activeResolutionId;
  const current = memory.get(id) ?? (id ? await loadResolution(id) : null);
  if (!current) return null;
  const phase = resumePhase
    ?? (current.phase !== "awaiting-reaction" ? current.phase : current.reactionWindow?.resumePhase)
    ?? "awaiting-damage-or-save";
  const paused = advanceAction(current, {
    type: "awaitReaction",
    actorUuid,
    trigger,
    triggerId,
    windowId,
    resumePhase: phase,
    mode,
    timeoutMs,
    options: { windowId, mode, resumePhase: phase, triggerId, hardParent: true }
  });
  const state = await persist(paused.state);
  activeResolutionId = state.id;
  if (state.parentResolutionId) causingResolutionId = state.parentResolutionId;
  else causingResolutionId = state.id;
  emitHudRefresh();
  return state;
}

/**
 * Resume a parent after a hard reaction window with optional rewrite patches.
 */
export async function resumeParent(resolutionId, patches = []) {
  const id = resolutionId ?? activeResolutionId;
  const current = memory.get(id) ?? (id ? await loadResolution(id) : null);
  if (!current) return null;
  const resumePhase = current.reactionWindow?.resumePhase
    ?? current.pendingDecision?.options?.resumePhase
    ?? "awaiting-damage-or-save";
  const resumed = advanceAction(current, {
    type: "reactionResolved",
    used: Array.isArray(patches) && patches.length > 0,
    patches,
    nextPhase: resumePhase,
    summary: patches?.length ? "Reaction window resolved with patches" : "Reaction window passed"
  });
  const state = await persist(resumed.state);
  activeResolutionId = state.id;
  emitHudRefresh();
  return state;
}

/**
 * Soft sibling shell: complete the pending reaction resolution.
 * Hard parent waits are resumed via resumeParent / completeHardWindowDecision — do not useCompleted here.
 */
export async function resolveReaction({
  resolutionId,
  used = false,
  summary = null,
  patches = null
} = {}) {
  const id = resolutionId ?? activeResolutionId;
  const current = memory.get(id) ?? (id ? await loadResolution(id) : null);
  if (!current) return null;

  // Only hybrid hard windows set hardParent. Soft pauseForReaction / OA shells still complete.
  const hardParent = current.pendingDecision?.options?.hardParent === true;

  if (hardParent) {
    // Parent paused for hard window — never mark completed here.
    if (Array.isArray(patches)) {
      return resumeParent(id, patches);
    }
    return current;
  }

  const state = await submitEvent({
    resolutionId: id,
    event: {
      type: "reactionResolved",
      used,
      summary,
      nextPhase: "awaiting-damage-or-save"
    }
  });
  return submitEvent({
    resolutionId: state.id,
    event: { type: "useCompleted", summary: summary ?? "Resumed after reaction" }
  });
}

export async function completeActive({ summary = null } = {}) {
  const id = activeResolutionId;
  if (!id) return null;
  return submitEvent({
    resolutionId: id,
    event: { type: "useCompleted", summary }
  });
}

export async function correctResolution({ resolutionId, correction }) {
  return submitEvent({
    resolutionId: resolutionId ?? lastCompletedId,
    event: { type: "correct", correction }
  });
}

/** GM helper: undo the last completed resolution via its appliedChanges trail. */
export async function correctLastCompleted({ reason = "GM correction" } = {}) {
  if (!lastCompletedId) return null;
  return correctResolution({
    resolutionId: lastCompletedId,
    correction: { reason }
  });
}

export function getResolution(resolutionId) {
  return memory.get(resolutionId) ?? null;
}

export function getActiveResolutionId() {
  return activeResolutionId;
}

export function getLastTargetUuids() {
  return [...lastTargetUuids];
}

export function getHudView({ workflowId }) {
  const state = memory.get(workflowId);
  return state ? buildHudView(state) : null;
}

export function getLastResolutionView() {
  const id = lastCompletedId ?? activeResolutionId;
  if (!id) return null;
  return getHudView({ workflowId: id });
}

export function listPending() {
  return [...memory.values()].filter((r) => r.phase === "awaiting-reaction" || r.pendingDecision);
}

export async function resumePending() {
  const pending = await hydrateFromStore();
  for (const res of pending) {
    storeLocal(res);
    if (res.phase === "awaiting-reaction") activeResolutionId = res.id;
  }
  emitHudRefresh();
  return pending.map((r) => r.id);
}

export function getCausingResolutionId() {
  return causingResolutionId;
}

export function _resetCombatMemory() {
  memory.clear();
  activeResolutionId = null;
  lastCompletedId = null;
  lastTargetUuids = [];
  causingResolutionId = null;
  import("./reactions/window.mjs").then((m) => m._resetHardWindowWaits?.()).catch(() => null);
}
