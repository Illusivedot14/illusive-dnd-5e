/**
 * Combat game log application — LIFO of turn lists for the encounter.
 *
 *   Turn 1: [move, action, move]
 *   Turn 2: [move, bonus, action]
 *   Turn 3: [move, reaction, action]
 *
 * Cleared when combat ends. Going back a turn/round undoes every action in
 * those lists (damage, movement, effects, …) and deletes the lists.
 */

import {
  createGameLogEntry,
  listAllActionsNewestFirst,
  listTurnActionsNewestFirst,
  listTurnActionsChronological,
  getCurrentTurnList,
  listTurnsInRound,
  collectUndoCascade,
  findTurnForAction,
  findEntryForEffect,
  findEntryBy,
  applyLogOp,
  clearGameLog,
  canUndoLatest,
  combatSegmentKey
} from "../domain/combat/game-log.mjs";
import { registerQuery, askGm, canAskGm, isActiveGm } from "../foundry/gm-query.mjs";
import { applyUndoPlan } from "../foundry/document-adapter.mjs";
import { refundEconomySpend } from "./economy.mjs";
import {
  undoOneTokenMovement,
  canUndoTokenMovement,
  undoTokenMovementToPrior,
  undoTokenMovementDrag,
  restoreTokenMovementAbsolute,
  getTokenMovementUsedFeet
} from "./token-movement.mjs";
import { MODULE_ID } from "../constants.mjs";
import { debugLog, DEBUG_CHANNELS } from "../foundry/debug.mjs";
import { buildHudView } from "./hud-view.mjs";
import { isFreeActivation } from "../foundry/item-interactions.mjs";
import { getActiveCombatant, getViewedCombat } from "../foundry/combat.mjs";
import { tokenFromUuid as resolveToken } from "../foundry/token-lookup.mjs";

/** @type {object[]} LIFO of turn lists for the active combat. */
let turns = [];
let combatActive = false;
let lastCursor = { round: null, turnIndex: null };

function poseBrief(p) {
  if (!p) return null;
  return { x: p.x, y: p.y, elev: p.elevation ?? p.elev ?? null };
}

function historyBrief(history = []) {
  return (history ?? []).map((h, i) => ({
    i,
    x: h?.x,
    y: h?.y,
    cost: h?.cost,
    movementId: h?.movementId ?? null
  }));
}

function segmentBrief(s) {
  if (!s) return null;
  return {
    prior: poseBrief(s.prior),
    historyLenBefore: s.historyLenBefore,
    costFeet: s.costFeet
  };
}

function dbg(tag, data = {}) {
  debugLog(DEBUG_CHANNELS.GAME_LOG, tag, data);
}

function emitRefresh() {
  try {
    Hooks.callAll(`${MODULE_ID}.gameLogUpdated`, getGameLogView());
  } catch {
    /* tests */
  }
}

/* ------------------------------------------------------------------ journal
 * The active GM holds the authoritative log and persists it on the Combat
 * (flags.illusive-dnd-5e.gameLog), so it survives a refresh and every client sees
 * every action. Other clients apply ops optimistically, send them to the GM,
 * and re-apply unacknowledged ops whenever the persisted copy arrives.
 */

const LOG_FLAG = "gameLog";
const PERSIST_DEBOUNCE_MS = 150;
/** @type {object[]} ops sent to the GM and not yet acknowledged */
let pendingOps = [];
let persistTimer = null;

function journalCombat() {
  return globalThis.game?.combat ?? getViewedCombat() ?? null;
}

function persistNow() {
  persistTimer = null;
  const combat = journalCombat();
  if (!combat?.setFlag || !combatActive) return;
  void combat.setFlag(MODULE_ID, LOG_FLAG, { v: 1, turns }).catch((err) => {
    console.warn(`${MODULE_ID} | game log persist failed`, err);
  });
}

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, PERSIST_DEBOUNCE_MS);
}

function forward(op) {
  if (!globalThis.game?.user) return;
  if (isActiveGm()) {
    schedulePersist();
    return;
  }
  if (!canAskGm()) return;
  pendingOps.push(op);
  const combatId = journalCombat()?.id ?? null;
  askGm("journal", { op, combatId })
    .catch((err) => debugLog(DEBUG_CHANNELS.GAME_LOG, "journal.forward-failed", { err: String(err) }))
    .finally(() => {
      pendingOps = pendingOps.filter((p) => p !== op);
    });
}

/** Apply one journal op here and hand it to the authority. */
function commit(op) {
  turns = applyLogOp(turns, op);
  forward(op);
  emitRefresh();
}

/** Replace the local log with the persisted copy (plus our unacknowledged ops). */
export function hydrateGameLog(combat = journalCombat()) {
  if (!combatActive || isActiveGm()) return false;
  const stored = combat?.getFlag?.(MODULE_ID, LOG_FLAG) ?? combat?.flags?.[MODULE_ID]?.[LOG_FLAG];
  if (!stored || !Array.isArray(stored.turns)) return false;
  let next = structuredClone(stored.turns);
  for (const op of pendingOps) next = applyLogOp(next, op);
  turns = next;
  emitRefresh();
  return true;
}

/** GM: load the persisted copy once (after a refresh) before appending. */
function loadPersistedOnGm(combat = journalCombat()) {
  const stored = combat?.getFlag?.(MODULE_ID, LOG_FLAG) ?? combat?.flags?.[MODULE_ID]?.[LOG_FLAG];
  if (stored && Array.isArray(stored.turns) && !turns.length) turns = structuredClone(stored.turns);
}

let journalBound = false;

/** Register the GM journal query and the hydrate hook (init/ready). */
export function bindGameLogJournal() {
  if (journalBound) return;
  journalBound = true;
  registerQuery("journal", async ({ op, combatId }) => {
    if (!globalThis.game?.user?.isGM || !op) return { ok: false };
    if (combatId && journalCombat()?.id && combatId !== journalCombat().id) return { ok: false, reason: "other-combat" };
    turns = applyLogOp(turns, op);
    schedulePersist();
    emitRefresh();
    return { ok: true };
  });
  try {
    Hooks.on("updateCombat", (combat, changes) => {
      if (changes?.flags?.[MODULE_ID]?.[LOG_FLAG] === undefined) return;
      hydrateGameLog(combat);
    });
  } catch {
    /* tests */
  }
}

export function readCombatCursor(combat = getViewedCombat()) {
  if (!combat?.started) return { round: null, turnIndex: null, combatantId: null };
  const combatant = getActiveCombatant(combat);
  return {
    round: combat.round ?? 1,
    turnIndex: combat.turn ?? 0,
    combatantId: combatant?.id ?? null
  };
}

function stampFromCursor(extra = {}) {
  const cursor = readCombatCursor();
  return {
    round: extra.round ?? cursor.round ?? 1,
    turnIndex: extra.turnIndex ?? cursor.turnIndex ?? 0,
    combatantId: extra.combatantId ?? cursor.combatantId ?? null
  };
}

export function setGameLogCombatActive(active) {
  const next = Boolean(active);
  if (combatActive === next) return;
  combatActive = next;
  if (!next) {
    turns = clearGameLog();
    pendingOps = [];
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = null;
    lastCursor = { round: null, turnIndex: null };
  } else {
    const cursor = readCombatCursor();
    lastCursor = { round: cursor.round, turnIndex: cursor.turnIndex };
    if (isActiveGm()) loadPersistedOnGm();
    else hydrateGameLog();
  }
  emitRefresh();
}

export function isGameLogEnabled() {
  return combatActive;
}

/** Full turn-list structure (copy). */
export function getGameLogStack() {
  return turns.map((t) => ({
    ...t,
    actions: [...t.actions]
  }));
}

function mapEntryView(e) {
  return {
    id: e.id,
    kind: e.kind,
    label: e.label,
    detail: e.detail,
    resolutionId: e.resolutionId,
    parentId: e.parentId,
    parentResolutionId: e.parentResolutionId ?? null,
    tokenUuid: e.tokenUuid,
    actorUuid: e.actorUuid,
    round: e.round,
    turnIndex: e.turnIndex,
    combatantId: e.combatantId,
    canUndo: true
  };
}

/** One indent per reaction in the chain: move, then the attack, then Shield, then Counterspell. */
function withReactionDepth(entries) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const byResolution = new Map();
  for (const entry of entries) {
    if (entry.resolutionId) byResolution.set(entry.resolutionId, entry);
  }
  const depthOf = (entry, seen) => {
    if (!entry || seen.has(entry.id)) return 0;
    const parent = (entry.parentId && byId.get(entry.parentId))
      || (entry.parentResolutionId && byResolution.get(entry.parentResolutionId))
      || null;
    if (!parent) return 0;
    seen.add(entry.id);
    return depthOf(parent, seen) + 1;
  };
  return entries.map((entry) => ({ ...entry, depth: depthOf(entry, new Set()) }));
}

/**
 * Default UI scope is the current turn’s action list (oldest → newest, latest at bottom).
 * `scope: "all"` flattens every turn chronologically for debugging.
 */
export function getGameLogView(filter = {}) {
  const scope = filter.scope ?? "token-turn";
  const cursor = readCombatCursor();
  const round = filter.round ?? cursor.round;
  const turnIndex = filter.turnIndex ?? cursor.turnIndex;

  let listed;
  if (scope === "all") {
    listed = turns.flatMap((t) => listTurnActionsChronological(t));
  } else {
    const turn = getCurrentTurnList(turns, round, turnIndex);
    listed = listTurnActionsChronological(turn);
  }

  const entries = withReactionDepth(listed.map(mapEntryView));
  return {
    enabled: combatActive,
    empty: entries.length === 0,
    canUndo: canUndoLatest(turns),
    cursor: { ...lastCursor },
    scope,
    turnCount: turns.length,
    entries
  };
}

function tokenUuidForActor(actorUuid) {
  if (!actorUuid) return null;
  try {
    const actor = typeof fromUuidSync === "function" ? fromUuidSync(actorUuid) : null;
    const token = actor?.getActiveTokens?.()?.[0]
      ?? actor?.token?.object
      ?? actor?.token
      ?? null;
    return token?.document?.uuid ?? token?.uuid ?? null;
  } catch {
    return null;
  }
}

/** Append an action onto the current (or stamped) turn list. */
export function recordGameLogEvent(input = {}) {
  if (!combatActive) return null;
  const stamp = stampFromCursor(input);
  const label = String(input.label ?? "").trim() || "Action";
  const entry = createGameLogEntry({
    kind: input.kind ?? "action",
    label,
    detail: input.detail ?? null,
    resolutionId: input.resolutionId ?? null,
    parentId: input.parentId ?? null,
    parentResolutionId: input.parentResolutionId ?? null,
    itemUuid: input.itemUuid ?? null,
    dependsOn: input.dependsOn ?? [],
    tokenUuid: input.tokenUuid ?? null,
    actorUuid: input.actorUuid ?? null,
    appliedChanges: input.appliedChanges ?? [],
    round: stamp.round,
    turnIndex: stamp.turnIndex,
    combatantId: input.combatantId ?? stamp.combatantId,
    movementId: input.movementId ?? null,
    costFeet: input.costFeet ?? null,
    economySpend: input.economySpend ?? null
  });
  commit({ type: "push", stamp, entry });
  return findTurnForAction(turns, entry.id)?.actions?.find((a) => a.id === entry.id) ?? entry;
}

function amendEntry(entryId, patch) {
  commit({ type: "amend", entryId, patch });
  return listAllActionsNewestFirst(turns).find((e) => e.id === entryId) ?? null;
}

/**
 * Journal writes nobody clicked (turn-start ticks, expiries, passive triggers).
 * Lands on the live resolution's trail when it is still open, else on that
 * resolution's row, else on a system row of the current turn.
 * @returns {object|null} the row the changes were recorded on
 */
export async function journalChanges({
  changes = [],
  label = "Automatic",
  detail = null,
  resolutionId = null,
  actorUuid = null,
  tokenUuid = null,
  dependsOn = []
} = {}) {
  const list = (changes ?? []).filter(Boolean);
  if (!combatActive || !list.length) return null;
  if (resolutionId) {
    const { getResolution, submitEvent } = await import("./combat.mjs");
    const live = getResolution(resolutionId);
    if (live && !["completed", "cancelled", "corrected"].includes(live.phase)) {
      await submitEvent({
        resolutionId,
        event: { type: "recordChange", changes: list, summary: label, rule: "combat.triggers" }
      });
      return findEntryBy(turns, { resolutionId });
    }
    const row = findEntryBy(turns, { resolutionId });
    if (row) {
      return amendEntry(row.id, {
        appliedChanges: [...(row.appliedChanges ?? []), ...list],
        dependsOn: [...new Set([...(row.dependsOn ?? []), ...dependsOn])]
      });
    }
  }
  return recordGameLogEvent({
    kind: "system",
    label,
    detail,
    actorUuid,
    tokenUuid,
    appliedChanges: list,
    dependsOn
  });
}

/** Rows that created these effects (for dependsOn links). */
export function entriesForEffects(effectUuids = []) {
  return [...new Set(effectUuids
    .map((uuid) => findEntryForEffect(turns, uuid)?.id)
    .filter(Boolean))];
}

/** Newest row for a use of this item (Hex cast for a Hex rider). */
export function entryForItemUse(itemUuid) {
  return findEntryBy(turns, { itemUuid })?.id ?? null;
}

function kindForResolution(resolution, { parentLogId, parentResolutionId } = {}) {
  if (parentLogId || parentResolutionId) return "reaction";
  const activation = resolution?.activationType
    ?? resolution?.trace?.find?.((t) => t.activationType)?.activationType
    ?? null;
  if (isFreeActivation(activation)) return "free";
  if (activation === "legendary" || activation === "mythic") return "legendary";
  if (activation === "lair") return "lair";
  if (activation === "bonus") return "bonus";
  if (activation === "reaction") return "reaction";
  return "action";
}

/**
 * Record a completed (or cancelled) resolution. Always logs during combat —
 * sparse resolutions still get a row so the master log matches what happened.
 * If a start row already exists for this resolutionId, amend it in place.
 */
export function recordResolutionOnGameLog(resolution, { parentId = null } = {}) {
  if (!combatActive || !resolution?.id) return null;
  if (resolution.phase !== "completed" && resolution.phase !== "cancelled") return null;

  const view = buildHudView(resolution);
  const summary = view?.headline
    || resolution.trace?.filter?.((t) => t.detail)?.at?.(-1)?.detail
    || null;

  const parentResolutionId = parentId ?? resolution.parentResolutionId ?? null;
  let parentLogId = null;
  if (parentResolutionId) {
    const parentEntry = listAllActionsNewestFirst(turns).find(
      (e) => e.resolutionId === parentResolutionId
    );
    parentLogId = parentEntry?.id ?? null;
  }

  const actorUuid = resolution.actorUuid ?? null;
  const appliedChanges = resolution.appliedChanges ?? [];
  // Prefer a real result line over the "Activity launched · … finished" mashup.
  const usefulSummary = summary && !/Activity launched/i.test(summary)
    ? summary
    : (summary?.split?.(" · ")?.filter((part) => part && !/^Activity launched$/i.test(part)).at(-1) ?? null);
  const existing = listAllActionsNewestFirst(turns).find(
    (e) => e.resolutionId === resolution.id
  );
  let kind = resolution.phase === "cancelled"
    ? "skip"
    : kindForResolution(resolution, { parentLogId, parentResolutionId });
  // A reaction use is logged up front as a reaction. Completing it must not
  // flatten it back into an action just because the weapon's activation is "action".
  if (existing?.kind === "reaction" && kind === "action") kind = "reaction";
  const label = usefulSummary
    || existing?.label
    || (resolution.phase === "cancelled" ? "Action cancelled" : null)
    || (kind === "reaction" ? "Reaction" : "Action");
  const detail = view?.explanation?.at?.(-1)?.detail ?? usefulSummary ?? summary;

  dbg("record.resolution", {
    resolutionId: resolution.id,
    phase: resolution.phase,
    kind,
    label,
    itemUuid: resolution.itemUuid ?? null,
    applied: appliedChanges.map((c) => ({
      type: c.type,
      actorUuid: c.actorUuid ?? null,
      prior: c.prior ?? null,
      effectUuids: c.effectUuids ?? null
    }))
  });

  const economySpend = resolution.economySpend ?? null;
  const dependsOn = Array.isArray(resolution.dependsOn) ? resolution.dependsOn : [];

  if (existing) {
    // Keep the start label (e.g. Fireball) — never replace it with "Spellcasting finished".
    const nextDetail = usefulSummary && usefulSummary !== existing.label
      ? usefulSummary
      : (detail ?? existing.detail);
    return amendEntry(existing.id, {
      kind,
      label: existing.label || label,
      detail: nextDetail,
      parentId: parentLogId ?? existing.parentId,
      parentResolutionId: parentResolutionId ?? existing.parentResolutionId,
      itemUuid: resolution.itemUuid ?? existing.itemUuid ?? null,
      dependsOn: [...new Set([...(existing.dependsOn ?? []), ...dependsOn])],
      actorUuid: actorUuid ?? existing.actorUuid,
      tokenUuid: tokenUuidForActor(actorUuid) ?? existing.tokenUuid,
      appliedChanges,
      economySpend: economySpend ?? existing.economySpend ?? null
    }) ?? existing;
  }

  const entry = recordGameLogEvent({
    kind,
    label,
    detail,
    resolutionId: resolution.id,
    parentId: parentLogId,
    parentResolutionId,
    itemUuid: resolution.itemUuid ?? null,
    dependsOn,
    actorUuid,
    tokenUuid: tokenUuidForActor(actorUuid),
    appliedChanges
  });
  if (entry && economySpend) return amendEntry(entry.id, { economySpend }) ?? entry;
  return entry;
}

/** Log an ability/item use the moment it starts (before rolls / templates). */
export function recordAbilityUseStartedOnGameLog({
  item = null,
  activity = null,
  actorUuid = null,
  tokenUuid = null,
  section = "action",
  resolutionId = null,
  parentId = null
} = {}) {
  if (!combatActive) return null;
  const name = item?.name ?? activity?.name ?? "Ability";
  const detail = activity?.name && activity.name !== name
    ? activity.name
    : (section && section !== "action" ? String(section) : null);
  return recordGameLogEvent({
    kind: section === "reaction" ? "reaction"
      : section === "bonus" ? "bonus"
        : section === "legendary" ? "legendary"
          : section === "lair" ? "lair"
            : "action",
    label: name,
    detail,
    resolutionId,
    parentId,
    actorUuid,
    tokenUuid: tokenUuid ?? tokenUuidForActor(actorUuid)
  });
}

/** A row for a move that is still waiting on reactions, so those reactions can sit under it. */
export function openProvokedMovement(tokenDoc) {
  if (!combatActive || !tokenDoc) return null;
  const token = tokenDoc.object ?? null;
  const tokenUuid = tokenDoc.uuid ?? token?.document?.uuid ?? token?.uuid ?? null;
  if (!tokenUuid) return null;
  const name = token?.name ?? tokenDoc.name ?? "Token";
  const entry = recordMovementOnGameLog({
    tokenUuid,
    actorUuid: token?.actor?.uuid ?? tokenDoc.actor?.uuid ?? null,
    label: `${name} moved`,
    detail: "Combat movement"
  });
  return entry?.id ?? null;
}

export function recordMovementOnGameLog({
  tokenUuid,
  actorUuid = null,
  label = "Movement",
  detail = null,
  appliedChanges = [],
  movementId = null,
  costFeet = null
} = {}) {
  if (!combatActive || !tokenUuid) return null;
  return recordGameLogEvent({
    kind: "movement",
    label,
    detail,
    tokenUuid,
    actorUuid,
    appliedChanges,
    movementId,
    costFeet
  });
}

/** Update an existing turn action in place (coalesce drag steps). */
function amendGameLogEntry(entryId, patch) {
  return amendEntry(entryId, patch);
}

export function recordStandardActionOnGameLog({
  actionId,
  label,
  detail = null,
  tokenUuid = null,
  actorUuid = null,
  appliedChanges = [],
  economySpend = null
} = {}) {
  if (!combatActive) return null;
  const entry = recordGameLogEvent({
    kind: "standard",
    label: label || actionId || "Standard action",
    detail: detail ?? actionId ?? null,
    tokenUuid,
    actorUuid,
    appliedChanges
  });
  if (entry && economySpend) return amendEntry(entry.id, { economySpend }) ?? entry;
  return entry;
}

/** uuid → last noted pose. Map (not WeakMap): Foundry may replace the TokenDocument. */
const lastMovementSnapshot = new Map();

function readMovementHistory(token) {
  return token?.document?._source?._movementHistory
    ?? token?.document?.movementHistory
    ?? [];
}

function movementDetail(costFeet) {
  const n = Number(costFeet);
  if (Number.isFinite(n) && n > 0) return `Combat movement (${n} ft)`;
  return "Combat movement";
}

function snapshotKey(token, doc = token?.document) {
  return doc?.uuid ?? token?.uuid ?? null;
}

function readMovementSnapshot(token, doc = token?.document) {
  const key = snapshotKey(token, doc);
  return key ? lastMovementSnapshot.get(key) ?? null : null;
}

function writeMovementSnapshot(token, snap, doc = token?.document) {
  const key = snapshotKey(token, doc);
  if (!key) return;
  lastMovementSnapshot.set(key, snap);
}

function syncMovementSnapshotAfterUndo(token) {
  const doc = token?.document;
  if (!doc) return;
  const history = readMovementHistory(token);
  writeMovementSnapshot(token, {
    len: Array.isArray(history) ? history.length : 0,
    x: Number(doc.x ?? token.x),
    y: Number(doc.y ?? token.y),
    elev: Number(doc.elevation ?? token.elevation ?? 0),
    usedFeet: getTokenMovementUsedFeet(token)
  }, doc);
}

/** Sum step costs for the newest movementId run only. */
function movementIdRunCost(history, movementId) {
  if (!Array.isArray(history) || !history.length) return 0;
  if (movementId == null) return Math.max(0, Number(history.at(-1)?.cost) || 0);
  let sum = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.movementId !== movementId) break;
    sum += Math.max(0, Number(history[i]?.cost) || 0);
  }
  return sum;
}

/**
 * Where this new segment started.
 *
 * - sameDrag: prior is the previous waypoint (snapshot / history tip-1)
 * - new drag: prior is the history point before this movementId run
 *   (Foundry often updates `_movementHistory` before `x`/`y`, so a stale
 *   snapshot of an older start must not win over history)
 */
function resolveSegmentAnchor(doc, history, prev, { sameDrag = false } = {}) {
  const len = Array.isArray(history) ? history.length : 0;
  const poseFrom = (pt, elevFallback = 0) => ({
    x: Number(pt?.x ?? doc.x),
    y: Number(pt?.y ?? doc.y),
    elevation: Number(pt?.elevation ?? elevFallback),
    width: doc.width,
    height: doc.height,
    depth: doc.depth,
    shape: doc.shape,
    level: doc.level
  });

  // Mid-drag coalesce: each segment peels back one waypoint.
  if (sameDrag) {
    if (prev && Number.isFinite(prev.x) && Number.isFinite(prev.y)) {
      return {
        prior: {
          x: prev.x,
          y: prev.y,
          elevation: prev.elev,
          width: doc.width,
          height: doc.height,
          depth: doc.depth,
          shape: doc.shape,
          level: doc.level
        },
        historyLenBefore: Math.max(0, Number(prev.len) || 0),
        usedFeetAtStart: Math.max(0, Number(prev.usedFeet) || 0)
      };
    }
    if (len >= 2) {
      const priorPt = history[len - 2];
      return {
        prior: poseFrom(priorPt, Number(doc.elevation ?? 0)),
        historyLenBefore: len - 1,
        usedFeetAtStart: 0
      };
    }
  }

  if (len) {
    const movementId = history.at(-1)?.movementId ?? null;
    let firstNew = len - 1;
    if (movementId != null) {
      while (firstNew > 0 && history[firstNew - 1]?.movementId === movementId) {
        firstNew -= 1;
      }
    }
    const priorIdx = Math.max(0, firstNew - 1);
    const priorPt = history[priorIdx] ?? history[0];
    let usedFeetAtStart = 0;
    if (firstNew > 0) {
      for (let i = 1; i < firstNew; i += 1) {
        usedFeetAtStart += Math.max(0, Number(history[i]?.cost) || 0);
      }
    } else if (prev && Number.isFinite(prev.usedFeet)) {
      usedFeetAtStart = Math.max(0, Number(prev.usedFeet) || 0);
    }
    return {
      prior: poseFrom(priorPt, Number(doc.elevation ?? 0)),
      historyLenBefore: priorIdx + 1,
      usedFeetAtStart,
      runCost: movementIdRunCost(history, movementId)
    };
  }

  if (prev && Number.isFinite(prev.x) && Number.isFinite(prev.y)) {
    return {
      prior: {
        x: prev.x,
        y: prev.y,
        elevation: prev.elev,
        width: doc.width,
        height: doc.height,
        depth: doc.depth,
        shape: doc.shape,
        level: doc.level
      },
      historyLenBefore: Math.max(0, Number(prev.len) || 0),
      usedFeetAtStart: Math.max(0, Number(prev.usedFeet) || 0)
    };
  }

  return {
    prior: poseFrom(doc, Number(doc.elevation ?? 0)),
    historyLenBefore: 0,
    usedFeetAtStart: 0
  };
}

/**
 * One Foundry drag (shared movementId) → one log row with total feet + segments[].
 * Undo peels the last segment (A→B→C → B); turn/round rewind restores the start.
 */
export function noteTokenMovedDuringCombat(token, changes = null, options = null) {
  if (!combatActive || !token?.document) return null;

  const keys = Object.keys(changes ?? {});
  if (keys.length && keys.every((k) => k === "movementAction")) return null;

  const doc = token.document;
  const tokenUuid = doc.uuid ?? token.uuid;
  if (!tokenUuid) return null;

  const history = readMovementHistory(token);
  const len = Array.isArray(history) ? history.length : 0;
  // Foundry often commits history before document x/y — prefer the tip.
  const tip = len ? history[len - 1] : null;
  const x = Number(tip?.x ?? doc.x ?? token.x);
  const y = Number(tip?.y ?? doc.y ?? token.y);
  const elev = Number(tip?.elevation ?? doc.elevation ?? token.elevation ?? 0);
  const usedFeet = getTokenMovementUsedFeet(token);
  const prev = readMovementSnapshot(token, doc);

  const positionChanged = changes
    ? ("x" in changes || "y" in changes || "elevation" in changes)
    : !prev || prev.x !== x || prev.y !== y || prev.elev !== elev;
  const historyGrew = len > (prev?.len ?? 0);

  if (!positionChanged && !historyGrew) return null;

  if (!positionChanged && (prev?.len ?? 0) === 0 && len <= 1) {
    writeMovementSnapshot(token, { len, x, y, elev, usedFeet }, doc);
    return null;
  }

  const movementId = history.at(-1)?.movementId ?? null;
  const name = token.name ?? token.actor?.name ?? "Token";

  const stamp = stampFromCursor();
  const turn = getCurrentTurnList(turns, stamp.round, stamp.turnIndex);
  const last = turn?.actions?.at(-1) ?? null;
  const lastMove = last?.kind === "movement" && last.tokenUuid === tokenUuid ? last : null;
  const lastChange = lastMove?.appliedChanges?.find((c) => c.type === "token-movement") ?? null;
  // Only coalesce waypoints from the *same* Foundry drag. A later A→B then B→C
  // must stay two rows so undoing B→C returns to B, not A.
  const sameDrag = Boolean(
    lastMove
    && lastChange
    && movementId
    && lastChange.movementId
    && lastChange.movementId === movementId
  );

  const anchor = resolveSegmentAnchor(doc, history, prev, { sameDrag });
  const segmentCost = prev
    ? (Math.max(0, usedFeet - (prev.usedFeet ?? 0))
      || Math.max(0, Number(history.at(-1)?.cost) || 0))
    : (Math.max(0, Number(anchor.runCost) || 0)
      || Math.max(0, Number(history.at(-1)?.cost) || 0));
  const segment = {
    prior: anchor.prior,
    historyLenBefore: anchor.historyLenBefore,
    costFeet: segmentCost
  };

  writeMovementSnapshot(token, { len, x, y, elev, usedFeet }, doc);

  const reservedId = options?.illusiveMovementLogId ?? null;
  if (reservedId && findTurnForAction(turns, reservedId)) {
    return amendGameLogEntry(reservedId, {
      detail: movementDetail(segmentCost),
      costFeet: segmentCost,
      movementId,
      appliedChanges: [{
        type: "token-movement",
        tokenUuid,
        prior: anchor.prior,
        historyLenBefore: anchor.historyLenBefore,
        movementId,
        costFeet: segmentCost,
        usedFeetAtStart: anchor.usedFeetAtStart,
        segments: [segment]
      }]
    });
  }

  if (sameDrag && lastMove) {
    const segments = [...(lastChange.segments ?? [{
      prior: lastChange.prior,
      historyLenBefore: lastChange.historyLenBefore,
      costFeet: lastChange.costFeet
    }]), segment];
    const costFeet = segments.reduce((sum, s) => sum + (Number(s.costFeet) || 0), 0);
    dbg("record.coalesce", {
      tokenUuid,
      name,
      movementId,
      sameDrag: true,
      entryId: lastMove.id,
      pose: { x, y, elev, usedFeet, historyLen: len },
      prevSnapshot: prev ? { ...prev } : null,
      segment: segmentBrief(segment),
      segments: segments.map(segmentBrief),
      costFeet,
      history: historyBrief(history)
    });
    return amendGameLogEntry(lastMove.id, {
      detail: movementDetail(costFeet),
      costFeet,
      movementId: movementId ?? lastChange.movementId ?? null,
      appliedChanges: [{
        ...lastChange,
        prior: segments[0]?.prior ?? lastChange.prior,
        historyLenBefore: segments[0]?.historyLenBefore ?? lastChange.historyLenBefore,
        costFeet,
        movementId: movementId ?? lastChange.movementId ?? null,
        segments
      }]
    });
  }

  dbg("record.new-row", {
    tokenUuid,
    name,
    movementId,
    sameDrag: false,
    lastMoveId: lastMove?.id ?? null,
    lastMoveMovementId: lastChange?.movementId ?? null,
    pose: { x, y, elev, usedFeet, historyLen: len },
    prevSnapshot: prev ? { ...prev } : null,
    segment: segmentBrief(segment),
    history: historyBrief(history)
  });

  return recordMovementOnGameLog({
    tokenUuid,
    actorUuid: token.actor?.uuid ?? null,
    label: `${name} moved`,
    detail: movementDetail(segmentCost),
    movementId,
    costFeet: segmentCost,
    appliedChanges: [{
      type: "token-movement",
      tokenUuid,
      prior: anchor.prior,
      historyLenBefore: anchor.historyLenBefore,
      movementId,
      costFeet: segmentCost,
      usedFeetAtStart: anchor.usedFeetAtStart,
      segments: [segment]
    }]
  });
}

/**
 * Undo one grid-segment of a movement log row (A→B→C undoes C→B first).
 * When `all` is true (turn/round rewind), jump back to the start of the move.
 */
async function peelMovementEntry(entry, { all = false } = {}) {
  const token = resolveToken(entry.tokenUuid);
  const moveChange = entry.appliedChanges?.find((c) => c.type === "token-movement")
    ?? entry.appliedChanges?.find((c) => c.type === "token-position");
  const doc = token?.document;
  const movementId = moveChange?.movementId ?? entry.movementId ?? null;
  const beforePose = doc
    ? {
      x: doc.x,
      y: doc.y,
      elev: doc.elevation,
      historyLen: readMovementHistory(token).length,
      usedFeet: getTokenMovementUsedFeet(token)
    }
    : null;

  dbg("peel.start", {
    entryId: entry.id,
    label: entry.label,
    detail: entry.detail,
    costFeet: entry.costFeet,
    all,
    movementId,
    tokenResolved: Boolean(token),
    tokenUuid: entry.tokenUuid,
    hasRevertApi: Boolean(doc && typeof doc.revertRecordedMovement === "function"),
    beforePose,
    moveChangeType: moveChange?.type ?? null,
    moveChangePrior: poseBrief(moveChange?.prior),
    moveChangeHistoryLenBefore: moveChange?.historyLenBefore ?? null,
    segments: (moveChange?.segments ?? []).map(segmentBrief),
    history: token ? historyBrief(readMovementHistory(token)) : null
  });

  if (token && moveChange) {
    const segments = Array.isArray(moveChange.segments) && moveChange.segments.length
      ? [...moveChange.segments]
      : (moveChange.prior
        ? [{
          prior: moveChange.prior,
          historyLenBefore: moveChange.historyLenBefore,
          costFeet: moveChange.costFeet
        }]
        : []);

    // Turn/round rewind (all=true): always restore the whole row, never peel one leg.
    if (all) {
      let ok = false;
      const history = readMovementHistory(token);
      const historyHasDrag = Boolean(
        movementId && history.some((h) => h?.movementId === movementId)
      );
      // Prefer Foundry revert only while this drag is still in live history.
      // After turn-start clearMovementHistories, revert fails and slicing a
      // foreign/empty history by historyLenBefore teleports to the wrong square.
      if (historyHasDrag && typeof doc?.revertRecordedMovement === "function") {
        ok = await undoTokenMovementDrag(token, movementId);
      }
      if (!ok) {
        const first = segments[0] ?? {
          prior: moveChange.prior,
          historyLenBefore: moveChange.historyLenBefore
        };
        if (first?.prior) {
          ok = historyHasDrag
            ? await undoTokenMovementToPrior(
              token,
              first.prior,
              first.historyLenBefore ?? 0,
              { movementId }
            )
            : await restoreTokenMovementAbsolute(token, first.prior);
        } else if (canUndoTokenMovement(token)) {
          ok = Boolean(await undoOneTokenMovement(token));
        }
      }
      syncMovementSnapshotAfterUndo(token);
      dbg("peel.full-row", {
        entryId: entry.id,
        movementId,
        ok,
        historyHasDrag,
        afterPose: {
          x: doc?.x,
          y: doc?.y,
          historyLen: readMovementHistory(token).length,
          usedFeet: getTokenMovementUsedFeet(token)
        }
      });
      return { ok, entry, keep: false };
    }

    // Single-click undo: Foundry drag revert restores position + spent feet together.
    if (movementId && typeof doc?.revertRecordedMovement === "function") {
      const ok = await undoTokenMovementDrag(token, movementId);
      syncMovementSnapshotAfterUndo(token);
      dbg("peel.revert-drag", {
        entryId: entry.id,
        movementId,
        ok,
        afterPose: {
          x: doc?.x,
          y: doc?.y,
          historyLen: readMovementHistory(token).length,
          usedFeet: getTokenMovementUsedFeet(token)
        }
      });
      // If Foundry revert fails, fall through to segment prior restore.
      if (ok || !segments.length) {
        return { ok, entry, keep: false };
      }
    }

    if (!segments.length) {
      dbg("peel.no-segments-fallback-drag", { entryId: entry.id, movementId });
      const ok = Boolean(await undoTokenMovementDrag(token, movementId));
      syncMovementSnapshotAfterUndo(token);
      return { ok, entry, keep: false };
    }

    if (segments.length === 1) {
      const first = segments[0];
      dbg("peel.fallback-to-prior", {
        entryId: entry.id,
        target: segmentBrief(first),
        all,
        segmentCount: segments.length
      });
      let ok = false;
      if (movementId) ok = await undoTokenMovementDrag(token, movementId);
      if (!ok && first?.prior) {
        ok = await undoTokenMovementToPrior(
          token,
          first.prior,
          first.historyLenBefore ?? 0,
          { movementId }
        );
      }
      syncMovementSnapshotAfterUndo(token);
      dbg("peel.fallback-done", {
        entryId: entry.id,
        ok,
        afterPose: {
          x: doc?.x,
          y: doc?.y,
          historyLen: readMovementHistory(token).length,
          usedFeet: getTokenMovementUsedFeet(token)
        }
      });
      return { ok, entry, keep: false };
    }

    const last = segments.pop();
    dbg("peel.one-segment", {
      entryId: entry.id,
      undoing: segmentBrief(last),
      remainingAfter: segments.map(segmentBrief)
    });
    const ok = await undoTokenMovementToPrior(
      token,
      last.prior,
      last.historyLenBefore ?? 0,
      { movementId }
    );
    syncMovementSnapshotAfterUndo(token);

    if (segments.length) {
      const costFeet = segments.reduce((sum, s) => sum + (Number(s.costFeet) || 0), 0);
      amendGameLogEntry(entry.id, {
        detail: movementDetail(costFeet),
        costFeet,
        appliedChanges: [{
          ...moveChange,
          prior: segments[0].prior,
          historyLenBefore: segments[0].historyLenBefore,
          costFeet,
          segments
        }]
      });
      dbg("peel.kept-row", {
        entryId: entry.id,
        ok,
        costFeet,
        remainingSegments: segments.map(segmentBrief),
        afterPose: { x: doc?.x, y: doc?.y, historyLen: readMovementHistory(token).length }
      });
      return { ok, entry, keep: true };
    }

    dbg("peel.removed-row", {
      entryId: entry.id,
      ok,
      afterPose: { x: doc?.x, y: doc?.y, historyLen: readMovementHistory(token).length }
    });
    return { ok, entry, keep: false };
  }

  dbg("peel.no-move-change", {
    entryId: entry.id,
    tokenResolved: Boolean(token),
    hasAppliedChanges: Boolean(entry.appliedChanges?.length)
  });

  if (token && canUndoTokenMovement(token)) {
    return { ok: Boolean(await undoTokenMovementDrag(token, movementId)), entry, keep: false };
  }
  if (entry.appliedChanges?.length) {
    const results = await applyUndoPlan([...entry.appliedChanges].reverse());
    return { ok: results.some((r) => r.ok), entry, keep: false };
  }
  return { ok: false, entry, keep: false };
}

async function refundEntrySpend(entry, actorUuid = entry?.actorUuid) {
  const spend = entry?.economySpend;
  if (!spend?.before || !spend?.after || !actorUuid || typeof fromUuid !== "function") return false;
  try {
    const actor = await fromUuid(actorUuid);
    if (!actor) return false;
    await refundEconomySpend(actor, spend.before, spend.after);
    return true;
  } catch {
    return false;
  }
}

async function undoSingleEntry(entry, { allMovement = false } = {}) {
  if (entry.kind === "skip") {
    return { ok: true, entry, soft: true };
  }

  if (entry.kind === "movement") {
    return peelMovementEntry(entry, { all: allMovement });
  }

  dbg("undo.action.start", {
    entryId: entry.id,
    kind: entry.kind,
    label: entry.label,
    detail: entry.detail,
    resolutionId: entry.resolutionId ?? null,
    applied: (entry.appliedChanges ?? []).map((c) => ({
      type: c.type,
      actorUuid: c.actorUuid ?? null,
      tokenUuid: c.tokenUuid ?? null,
      prior: c.prior ?? null,
      effectUuids: c.effectUuids ?? null
    }))
  });

  const { correctResolution, getResolution } = await import("./combat.mjs");
  let corrected = false;
  let resolutionRefunded = false;
  if (entry.resolutionId) {
    const before = getResolution(entry.resolutionId);
    dbg("undo.action.resolution", {
      entryId: entry.id,
      phase: before?.phase ?? null,
      resolutionChanges: before?.appliedChanges?.length ?? 0
    });
    if (before && before.phase === "completed") {
      resolutionRefunded = Boolean(before.economySpend?.before && before.economySpend?.after);
      await correctResolution({
        resolutionId: entry.resolutionId,
        correction: { reason: "Game log undo", cascade: true }
      });
      corrected = true;
    }
  }

  // The log row can hold the spend when the live resolution does not.
  if (corrected && !resolutionRefunded) {
    const refunded = await refundEntrySpend(entry);
    if (refunded) return { ok: true, entry };
  }

  // Live resolution missing/already corrected — undo from the log row itself
  // (HP priors, effect uuids) so spell damage/effects still reverse.
  if (!corrected && entry.appliedChanges?.length) {
    const results = await applyUndoPlan([...entry.appliedChanges].reverse());
    dbg("undo.action.apply-plan", {
      entryId: entry.id,
      results: results.map((r) => ({
        ok: r.ok,
        reason: r.reason ?? null,
        type: r.change?.type ?? null
      }))
    });
    const resolution = entry.resolutionId ? getResolution(entry.resolutionId) : null;
    if (!resolution?.economySpend) {
      await refundEntrySpend(entry, resolution?.actorUuid ?? entry.actorUuid);
    }
    return { ok: results.some((r) => r.ok), entry };
  }

  // No applied changes but we still owe an economy refund (cancelled cast after spend, etc.).
  if (!corrected && await refundEntrySpend(entry)) {
    return { ok: true, entry };
  }

  if (corrected) {
    dbg("undo.action.corrected", { entryId: entry.id });
    return { ok: true, entry };
  }

  dbg("undo.action.soft", { entryId: entry.id, reason: "no-resolution-no-changes" });
  return { ok: true, entry, soft: true };
}

/** Undo a list of entries (newest first) against the game world. */
async function undoGameState(entriesNewestFirst, { allMovement = true } = {}) {
  const results = [];
  const undoneIds = [];
  const seen = new Set();

  for (const entry of entriesNewestFirst) {
    if (seen.has(entry.id)) continue;
    const order = collectUndoCascade(turns, entry.id);
    const steps = order.length ? order : [entry];
    for (const step of steps) {
      if (seen.has(step.id)) continue;
      seen.add(step.id);
      results.push(await undoSingleEntry(step, { allMovement }));
      undoneIds.push(step.id);
    }
  }

  return { results, undoneIds };
}

/**
 * Undo one action (and its reactions) and delete it from its turn list.
 * Movement rows peel one segment at a time when more than one remains.
 */
/**
 * Undo is refused while a hard reaction window is waiting (its parent would resume
 * against a world that no longer exists). Soft prompts tied to undone rows are dismissed.
 */
async function undoBlocked() {
  try {
    const { hasOpenHardWindow } = await import("./reactions/window.mjs");
    if (!hasOpenHardWindow()) return null;
  } catch {
    return null;
  }
  try {
    ui.notifications?.warn?.("Illusive D&D 5e: finish the open reaction prompt before undoing.");
  } catch {
    /* tests */
  }
  return { ok: false, reason: "reaction-pending", results: [], undoneIds: [], deletedTurnIds: [] };
}

async function dismissPromptsFor(entries = []) {
  const ids = entries.map((e) => e?.resolutionId).filter(Boolean);
  if (!ids.length) return;
  try {
    const { dismissReactionPromptsFor } = await import("./reaction-context.mjs");
    dismissReactionPromptsFor(ids);
  } catch {
    /* ignore */
  }
}

export async function undoGameLogEntry(entryId) {
  if (!combatActive) return { ok: false, reason: "ooc" };
  const blocked = await undoBlocked();
  if (blocked) return blocked;
  const turn = findTurnForAction(turns, entryId);
  if (!turn) return { ok: false, reason: "missing" };

  const entry = turn.actions.find((a) => a.id === entryId) ?? null;
  if (entry?.kind === "movement") {
    const peel = await peelMovementEntry(entry, { all: false });
    if (peel.keep) {
      emitRefresh();
      return { ok: peel.ok, results: [peel], undoneIds: [], peeled: true };
    }
  }

  const order = collectUndoCascade(turns, entryId);
  if (!order.length) return { ok: false, reason: "missing" };

  await dismissPromptsFor(order);
  const { results, undoneIds } = await undoGameState(order, { allMovement: true });
  commit({ type: "remove", entryIds: undoneIds });
  return { ok: results.some((r) => r.ok) || undoneIds.length > 0, results, undoneIds };
}

/**
 * Keep actions before `entryId` on that turn; undo that action and everything after.
 * Multi-segment movement peels one leg and keeps the row when segments remain.
 */
export async function undoGameLogFromEntry(entryId) {
  if (!combatActive) return { ok: false, reason: "ooc" };
  const blocked = await undoBlocked();
  if (blocked) return blocked;
  const turn = findTurnForAction(turns, entryId);
  if (!turn) return { ok: false, reason: "missing" };

  const idx = turn.actions.findIndex((a) => a.id === entryId);
  if (idx < 0) return { ok: false, reason: "missing" };

  const target = turn.actions[idx];
  const after = turn.actions.slice(idx + 1);
  const results = [];
  const undoneIds = [];

  dbg("undo-from-entry", {
    entryId,
    target: {
      id: target.id,
      kind: target.kind,
      label: target.label,
      detail: target.detail,
      costFeet: target.costFeet,
      segments: (target.appliedChanges?.[0]?.segments ?? []).map(segmentBrief),
      prior: poseBrief(target.appliedChanges?.[0]?.prior)
    },
    turnActionIds: turn.actions.map((a) => ({ id: a.id, kind: a.kind, detail: a.detail })),
    afterIds: after.map((a) => ({ id: a.id, kind: a.kind, detail: a.detail })),
    willAlsoUndoAfter: after.length
  });

  await dismissPromptsFor([target, ...after]);
  if (after.length) {
    const batch = await undoGameState([...after].reverse(), { allMovement: true });
    results.push(...batch.results);
    undoneIds.push(...batch.undoneIds);
  }

  let keepTarget = false;
  if (target.kind === "movement") {
    const peel = await peelMovementEntry(target, { all: false });
    results.push(peel);
    if (peel.keep) {
      keepTarget = true;
    } else {
      undoneIds.push(target.id);
    }
  } else {
    const batch = await undoGameState([target], { allMovement: true });
    results.push(...batch.results);
    undoneIds.push(...batch.undoneIds);
  }

  commit({ type: "remove", entryIds: undoneIds.filter((id) => !(keepTarget && id === target.id)) });

  const turnAfter = turns.find((t) => t.id === turn.id) ?? null;
  dbg("undo-from-entry-done", {
    entryId,
    keepTarget,
    undoneIds,
    remaining: (turnAfter?.actions ?? []).map((a) => ({
      id: a.id,
      kind: a.kind,
      detail: a.detail,
      prior: poseBrief(a.appliedChanges?.[0]?.prior),
      segments: (a.appliedChanges?.[0]?.segments ?? []).map(segmentBrief)
    }))
  });

  emitRefresh();
  return {
    ok: results.some((r) => r.ok) || undoneIds.length > 0 || keepTarget,
    results,
    undoneIds,
    peeled: keepTarget
  };
}

/**
 * Undo every action on the current turn (and any later turn lists) and delete them.
 * Carousel back must fully reverse world state for that slice, not peel one step.
 */
export async function undoGameLogCurrentTurn(combat = getViewedCombat()) {
  if (!combatActive) return { ok: false, reason: "ooc" };
  const blocked = await undoBlocked();
  if (blocked) return blocked;
  const cursor = readCombatCursor(combat);
  if (cursor.round == null || cursor.turnIndex == null) {
    return { ok: true, undoneIds: [], results: [], deletedTurnIds: [] };
  }

  const key = combatSegmentKey(cursor.round, cursor.turnIndex);
  // Current turn + anything stamped later (safety if cursor and stack drifted).
  const doomed = turns
    .filter((t) => combatSegmentKey(t.round, t.turnIndex) >= key)
    .sort((a, b) => combatSegmentKey(b.round, b.turnIndex) - combatSegmentKey(a.round, a.turnIndex));

  dbg("undo.current-turn", {
    cursor,
    key,
    doomed: doomed.map((t) => ({
      id: t.id,
      round: t.round,
      turnIndex: t.turnIndex,
      actions: t.actions.length
    }))
  });

  if (!doomed.length) {
    return { ok: true, undoneIds: [], results: [], deletedTurnIds: [] };
  }

  const results = [];
  const undoneIds = [];
  const deletedTurnIds = [];

  for (const turn of doomed) {
    const batch = await undoGameState(listTurnActionsNewestFirst(turn), { allMovement: true });
    results.push(...batch.results);
    undoneIds.push(...batch.undoneIds);
    commit({ type: "remove", entryIds: batch.undoneIds });
    commit({ type: "popTurn", turnId: turn.id });
    deletedTurnIds.push(turn.id);
  }

  emitRefresh();
  return { ok: true, results, undoneIds, deletedTurnIds };
}

/**
 * Undo every action in the current round (and later rounds) and delete those lists.
 */
export async function undoGameLogCurrentRound(combat = getViewedCombat()) {
  if (!combatActive) return { ok: false, reason: "ooc" };
  const blocked = await undoBlocked();
  if (blocked) return blocked;
  const cursor = readCombatCursor(combat);
  if (cursor.round == null) {
    return { ok: true, undoneIds: [], results: [], deletedTurnIds: [] };
  }

  // This round only, newest turn first so Foundry movement reverts stay ordered.
  const doomed = listTurnsInRound(turns, cursor.round);

  dbg("undo.current-round", {
    cursor,
    doomed: doomed.map((t) => ({
      id: t.id,
      round: t.round,
      turnIndex: t.turnIndex,
      actions: t.actions.length
    }))
  });

  const results = [];
  const undoneIds = [];
  const deletedTurnIds = [];

  for (const turn of doomed) {
    const batch = await undoGameState(listTurnActionsNewestFirst(turn), { allMovement: true });
    results.push(...batch.results);
    undoneIds.push(...batch.undoneIds);
    commit({ type: "remove", entryIds: batch.undoneIds });
    commit({ type: "popTurn", turnId: turn.id });
    deletedTurnIds.push(turn.id);
  }

  emitRefresh();
  return { ok: true, results, undoneIds, deletedTurnIds };
}

export function recordTurnSkipped(combat = getViewedCombat()) {
  if (!combatActive || !combat?.started) return null;
  const combatant = getActiveCombatant(combat);
  const name = combatant?.name ?? "Combatant";
  return recordGameLogEvent({
    kind: "skip",
    label: `${name}'s turn skipped`,
    detail: `Round ${combat.round ?? 1}`,
    combatantId: combatant?.id ?? null,
    actorUuid: combatant?.actor?.uuid ?? combatant?.actorId ?? null,
    tokenUuid: combatant?.token?.uuid
      ?? combatant?.token?.document?.uuid
      ?? null
  });
}

export function recordRoundSkipped(combat = getViewedCombat()) {
  if (!combatActive || !combat?.started) return null;
  const round = combat.round ?? 1;
  return recordGameLogEvent({
    kind: "skip",
    label: `Round ${round} skipped`,
    detail: "Advanced to next round"
  });
}

export function _resetGameLogForTests() {
  turns = [];
  pendingOps = [];
  combatActive = false;
  lastCursor = { round: null, turnIndex: null };
  lastMovementSnapshot.clear();
}

export function _clearMovementSnapshotsForTests() {
  lastMovementSnapshot.clear();
}

export function _setGameLogCursorForTests(round, turnIndex) {
  lastCursor = { round, turnIndex };
}
