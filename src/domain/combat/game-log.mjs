/**
 * Combat game log — LIFO of turn lists.
 *
 *   turns = [
 *     { round, turnIndex, combatantId, actions: [move, action, move] },
 *     { round, turnIndex, combatantId, actions: [move, bonus, action] },
 *     …
 *   ]
 *
 * Combat stores the whole structure; it is cleared when combat ends.
 * Going back a turn/round undoes every action in those lists and deletes them.
 */

let actionSeq = 0;
const clientTag = Math.random().toString(36).slice(2, 8);

export function combatSegmentKey(round = 1, turnIndex = 0) {
  return (Number(round) || 1) * 100_000 + (Number(turnIndex) || 0);
}

/** Ids are unique across clients: every client appends to the same synced log. */
function nextEntryId() {
  actionSeq += 1;
  return `log:${clientTag}:${actionSeq}`;
}

/** One list per (round, turn, combatant) — the same id on every client. */
export function turnListId(round = 1, turnIndex = 0, combatantId = null) {
  return `turn:${Number(round) || 1}:${Number(turnIndex) || 0}:${combatantId ?? "-"}`;
}

export function createGameLogEntry(input = {}) {
  return {
    id: input.id ?? nextEntryId(),
    kind: input.kind ?? "action",
    label: input.label ?? "Action",
    detail: input.detail ?? null,
    resolutionId: input.resolutionId ?? null,
    parentId: input.parentId ?? null,
    parentResolutionId: input.parentResolutionId ?? null,
    itemUuid: input.itemUuid ?? null,
    dependsOn: Array.isArray(input.dependsOn) ? [...new Set(input.dependsOn)] : [],
    tokenUuid: input.tokenUuid ?? null,
    actorUuid: input.actorUuid ?? null,
    round: input.round ?? null,
    turnIndex: input.turnIndex ?? null,
    combatantId: input.combatantId ?? null,
    movementId: input.movementId ?? null,
    costFeet: input.costFeet ?? null,
    at: input.at ?? Date.now(),
    appliedChanges: Array.isArray(input.appliedChanges) ? [...input.appliedChanges] : []
  };
}

export function createTurnList(input = {}) {
  return {
    id: input.id ?? turnListId(input.round, input.turnIndex, input.combatantId),
    round: input.round ?? 1,
    turnIndex: input.turnIndex ?? 0,
    combatantId: input.combatantId ?? null,
    at: input.at ?? Date.now(),
    actions: Array.isArray(input.actions)
      ? input.actions.map((a) => createGameLogEntry(a))
      : []
  };
}

export function clearGameLog() {
  return [];
}

/** Find the turn list for a combat cursor, or null. */
export function findTurnList(turns = [], round, turnIndex, combatantId = null) {
  return turns.find((t) => {
    if (t.round !== round || t.turnIndex !== turnIndex) return false;
    if (combatantId != null && t.combatantId != null && t.combatantId !== combatantId) {
      return false;
    }
    return true;
  }) ?? null;
}

/**
 * Ensure a turn list exists for the cursor, then append an action.
 * Returns `{ turns, turn, entry }`.
 */
export function pushActionOntoTurn(turns = [], turnMeta, actionInput) {
  const round = turnMeta.round ?? 1;
  const turnIndex = turnMeta.turnIndex ?? 0;
  const combatantId = turnMeta.combatantId ?? null;

  let next = [...turns];
  let turn = findTurnList(next, round, turnIndex, combatantId);
  if (!turn) {
    turn = createTurnList({ round, turnIndex, combatantId });
    next = [...next, turn];
  }

  const entry = createGameLogEntry({
    ...actionInput,
    round,
    turnIndex,
    combatantId: actionInput.combatantId ?? combatantId
  });

  if (next.some((t) => t.actions.some((a) => a.id === entry.id))) {
    return { turns: next, turn: next.find((t) => t.id === turn.id), entry };
  }

  next = next.map((t) => (
    t.id === turn.id ? { ...t, actions: [...t.actions, entry] } : t
  ));

  return {
    turns: next,
    turn: next.find((t) => t.id === turn.id),
    entry
  };
}

/** Chronological actions for one turn list (oldest first — UI order). */
export function listTurnActionsChronological(turn) {
  if (!turn?.actions?.length) return [];
  return [...turn.actions];
}

/** Newest-first actions for one turn list (undo order). */
export function listTurnActionsNewestFirst(turn) {
  if (!turn?.actions?.length) return [];
  return [...turn.actions].reverse();
}

/**
 * Patch an existing action on its turn list (e.g. coalesce drag movement cost).
 */
export function amendTurnAction(turns = [], entryId, patch = {}) {
  return turns.map((t) => ({
    ...t,
    actions: t.actions.map((a) => {
      if (a.id !== entryId) return a;
      const next = { ...a, ...patch };
      if (patch.appliedChanges) next.appliedChanges = [...patch.appliedChanges];
      return next;
    })
  }));
}

/** Flat newest-first view of every action across all turns (debug / all scope). */
export function listAllActionsNewestFirst(turns = []) {
  const out = [];
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    out.push(...listTurnActionsNewestFirst(turns[i]));
  }
  return out;
}

/** Find which turn owns an action id. */
export function findTurnForAction(turns = [], entryId) {
  for (const turn of turns) {
    if (turn.actions.some((a) => a.id === entryId)) return turn;
  }
  return null;
}

/**
 * Within one turn: actions at/after `entryId` (including it), newest first.
 * Used for in-turn undo.
 */
export function listActionsFromEntryInTurn(turn, entryId) {
  if (!turn) return [];
  const idx = turn.actions.findIndex((a) => a.id === entryId);
  if (idx < 0) return [];
  return turn.actions.slice(idx).reverse();
}

/**
 * Remove actions at/after `entryId` from that turn (delete, not soft-flag).
 * Returns `{ turns, removed }` where removed is newest-first.
 */
export function removeActionsFromEntry(turns = [], entryId) {
  const turn = findTurnForAction(turns, entryId);
  if (!turn) return { turns, removed: [] };

  const idx = turn.actions.findIndex((a) => a.id === entryId);
  if (idx < 0) return { turns, removed: [] };

  const removed = turn.actions.slice(idx).reverse();
  const kept = turn.actions.slice(0, idx);
  const next = turns.map((t) => (t.id === turn.id ? { ...t, actions: kept } : t));
  return { turns: next, removed };
}

/**
 * Cascade within a turn list: child reactions first, then the entry.
 */
export function cascadeUndoOrderInTurn(turn, entryId) {
  if (!turn) return [];
  const target = turn.actions.find((a) => a.id === entryId);
  if (!target) return [];

  const children = turn.actions
    .filter((e) => {
      if (e.id === entryId || e.kind !== "reaction") return false;
      if (e.parentId === entryId) return true;
      if (target.resolutionId && e.parentResolutionId === target.resolutionId) return true;
      return false;
    })
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));

  return [...children, target];
}

/**
 * Full undo cascade for one entry, any turn, newest first (the entry last):
 * its reactions, plus every later entry that depends on it (dependsOn holds
 * entry ids or resolution ids), recursively.
 */
export function collectUndoCascade(turns = [], entryId) {
  const all = turns.flatMap((t) => t.actions);
  const target = all.find((a) => a.id === entryId);
  if (!target) return [];
  const picked = new Map([[target.id, target]]);
  const queue = [target];
  while (queue.length) {
    const cause = queue.shift();
    for (const e of all) {
      if (picked.has(e.id)) continue;
      const reaction = e.kind === "reaction" && (
        e.parentId === cause.id
        || (cause.resolutionId && e.parentResolutionId === cause.resolutionId)
      );
      const deps = e.dependsOn ?? [];
      const dependent = deps.includes(cause.id)
        || (cause.resolutionId && deps.includes(cause.resolutionId));
      if (!reaction && !dependent) continue;
      picked.set(e.id, e);
      queue.push(e);
    }
  }
  picked.delete(target.id);
  const rest = [...picked.values()].sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  return [...rest, target];
}

/** Newest entry that created this effect (its undo record lists the uuid). */
export function findEntryForEffect(turns = [], effectUuid) {
  if (!effectUuid) return null;
  const hit = (c) => (c?.effectUuids ?? c?.uuids ?? []).includes(effectUuid);
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const actions = turns[i].actions;
    for (let j = actions.length - 1; j >= 0; j -= 1) {
      if ((actions[j].appliedChanges ?? []).some(hit)) return actions[j];
    }
  }
  return null;
}

/** Newest entry for a resolution id, or for a use of an item. */
export function findEntryBy(turns = [], { resolutionId = null, itemUuid = null } = {}) {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const actions = turns[i].actions;
    for (let j = actions.length - 1; j >= 0; j -= 1) {
      const a = actions[j];
      if (resolutionId && a.resolutionId === resolutionId) return a;
      if (itemUuid && a.itemUuid === itemUuid) return a;
    }
  }
  return null;
}

/**
 * Journal operations — every mutation of the log, replayable on any client.
 * All are idempotent so a replayed op (GM ack race) never duplicates rows.
 *   push   { stamp: {round, turnIndex, combatantId}, entry }
 *   amend  { entryId, patch }
 *   remove { entryIds }
 *   popTurn { turnId }
 *   clear  {}
 */
export function applyLogOp(turns = [], op = {}) {
  switch (op.type) {
    case "push":
      return pushActionOntoTurn(turns, op.stamp ?? {}, op.entry ?? {}).turns;
    case "amend":
      return amendTurnAction(turns, op.entryId, op.patch ?? {});
    case "remove": {
      const ids = new Set(op.entryIds ?? []);
      return turns.map((t) => ({ ...t, actions: t.actions.filter((a) => !ids.has(a.id)) }));
    }
    case "popTurn":
      return popTurnList(turns, op.turnId).turns;
    case "clear":
      return clearGameLog();
    default:
      return turns;
  }
}

/** Pop (delete) a turn by id. Returns `{ turns, removedTurn }`. */
export function popTurnList(turns = [], turnId) {
  const removedTurn = turns.find((t) => t.id === turnId) ?? null;
  if (!removedTurn) return { turns, removedTurn: null };
  return {
    turns: turns.filter((t) => t.id !== turnId),
    removedTurn
  };
}

/** All turn lists in a round, newest first. */
export function listTurnsInRound(turns = [], round) {
  return turns.filter((t) => t.round === round).reverse();
}

/** Newest turn matching round+turnIndex. */
export function getCurrentTurnList(turns = [], round, turnIndex) {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const t = turns[i];
    if (t.round === round && t.turnIndex === turnIndex) return t;
  }
  return null;
}

export function canUndoLatest(turns = []) {
  const last = turns.at(-1);
  return Boolean(last?.actions?.length);
}

/* ---- Compatibility shims used by older tests / callers ---- */

export function pushGameLogEntry(turns = [], entry) {
  const { turns: next } = pushActionOntoTurn(
    turns,
    {
      round: entry.round ?? 1,
      turnIndex: entry.turnIndex ?? 0,
      combatantId: entry.combatantId ?? null
    },
    entry
  );
  return next;
}

export function listActiveGameLog(turns = []) {
  return listAllActionsNewestFirst(turns);
}

export function cascadeUndoOrder(turns = [], entryId) {
  const turn = findTurnForAction(turns, entryId);
  return cascadeUndoOrderInTurn(turn, entryId);
}

export function markGameLogUndone(turns = [], entryIds = []) {
  // Hard-delete semantics: remove listed ids from their turn lists.
  const ids = new Set(entryIds);
  return turns.map((t) => ({
    ...t,
    actions: t.actions.filter((a) => !ids.has(a.id))
  }));
}

export function listEntriesAfterEntry(turns = [], entryId) {
  const turn = findTurnForAction(turns, entryId);
  if (!turn) return [];
  const idx = turn.actions.findIndex((a) => a.id === entryId);
  if (idx < 0) return [];
  return turn.actions.slice(idx + 1).reverse();
}

export function listEntriesAfterSegment(turns = [], round, turnIndex) {
  const key = combatSegmentKey(round, turnIndex);
  return listAllActionsNewestFirst(turns).filter((e) => {
    if (e.round == null || e.turnIndex == null) return false;
    return combatSegmentKey(e.round, e.turnIndex) > key;
  });
}

export function listTokenTurnEntries(turns = [], {
  round = null,
  turnIndex = null,
  tokenUuid = null,
  actorUuid = null,
  combatantId = null
} = {}) {
  const turn = getCurrentTurnList(turns, round, turnIndex);
  if (!turn) return [];
  // Current turn list belongs to the combatant whose turn it is — show whole list.
  if (combatantId && turn.combatantId && turn.combatantId !== combatantId) {
    // Still allow filter by token/actor for reactions logged on this turn.
  }
  const actions = listTurnActionsNewestFirst(turn);
  if (!tokenUuid && !actorUuid && !combatantId) return actions;
  // Actor-facing view: this turn’s full list (reactions by others stay visible).
  return actions;
}

export function listTurnSegmentEntries(turns = [], round, turnIndex) {
  const turn = getCurrentTurnList(turns, round, turnIndex);
  return listTurnActionsNewestFirst(turn);
}

export function listRoundSegmentEntries(turns = [], round) {
  return listTurnsInRound(turns, round).flatMap((t) => listTurnActionsNewestFirst(t));
}
