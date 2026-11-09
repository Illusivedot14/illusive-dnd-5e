import { describe, it, expect, beforeEach } from "vitest";
import {
  createGameLogEntry,
  createTurnList,
  pushActionOntoTurn,
  listTurnActionsNewestFirst,
  listAllActionsNewestFirst,
  removeActionsFromEntry,
  popTurnList,
  getCurrentTurnList,
  listTurnsInRound,
  cascadeUndoOrderInTurn,
  clearGameLog,
  canUndoLatest,
  combatSegmentKey
} from "../src/domain/combat/game-log.mjs";
import {
  setGameLogCombatActive,
  isGameLogEnabled,
  recordResolutionOnGameLog,
  recordAbilityUseStartedOnGameLog,
  recordMovementOnGameLog,
  recordStandardActionOnGameLog,
  recordGameLogEvent,
  noteTokenMovedDuringCombat,
  getGameLogView,
  getGameLogStack,
  undoGameLogEntry,
  undoGameLogFromEntry,
  undoGameLogCurrentTurn,
  undoGameLogCurrentRound,
  _resetGameLogForTests,
  _setGameLogCursorForTests,
  _clearMovementSnapshotsForTests
} from "../src/application/combat-game-log.mjs";
import { createActionResolution } from "../src/domain/combat/action-state.mjs";

describe("game-log domain (LIFO of turn lists)", () => {
  it("appends actions onto the matching turn list", () => {
    let turns = [];
    ({ turns } = pushActionOntoTurn(turns, { round: 1, turnIndex: 0, combatantId: "a" }, {
      kind: "movement",
      label: "move"
    }));
    ({ turns } = pushActionOntoTurn(turns, { round: 1, turnIndex: 0, combatantId: "a" }, {
      kind: "action",
      label: "attack"
    }));
    ({ turns } = pushActionOntoTurn(turns, { round: 1, turnIndex: 1, combatantId: "b" }, {
      kind: "bonus",
      label: "bonus"
    }));

    expect(turns).toHaveLength(2);
    expect(turns[0].actions.map((a) => a.label)).toEqual(["move", "attack"]);
    expect(turns[1].actions.map((a) => a.label)).toEqual(["bonus"]);
  });

  it("lists a turn’s actions newest first", () => {
    const turn = createTurnList({
      round: 1,
      turnIndex: 0,
      actions: [
        { label: "move", at: 1 },
        { label: "action", at: 2 },
        { label: "move2", at: 3 }
      ]
    });
    expect(listTurnActionsNewestFirst(turn).map((a) => a.label)).toEqual([
      "move2",
      "action",
      "move"
    ]);
  });

  it("removes an action and everything after it on that turn", () => {
    let turns = [];
    ({ turns } = pushActionOntoTurn(turns, { round: 1, turnIndex: 0 }, { id: "a", label: "A" }));
    ({ turns } = pushActionOntoTurn(turns, { round: 1, turnIndex: 0 }, { id: "b", label: "B" }));
    ({ turns } = pushActionOntoTurn(turns, { round: 1, turnIndex: 0 }, { id: "c", label: "C" }));

    const { turns: next, removed } = removeActionsFromEntry(turns, "b");
    expect(removed.map((a) => a.label)).toEqual(["C", "B"]);
    expect(next[0].actions.map((a) => a.label)).toEqual(["A"]);
  });

  it("pops a turn list entirely", () => {
    let turns = [
      createTurnList({ id: "t1", round: 1, turnIndex: 0, actions: [{ label: "A" }] }),
      createTurnList({ id: "t2", round: 1, turnIndex: 1, actions: [{ label: "B" }] })
    ];
    const { turns: next, removedTurn } = popTurnList(turns, "t2");
    expect(removedTurn.id).toBe("t2");
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("t1");
  });

  it("cascades reactions before their parent inside a turn", () => {
    const turn = createTurnList({
      actions: [
        { id: "parent", kind: "action", label: "Attack", resolutionId: "res-parent", at: 1 },
        { id: "react-1", kind: "reaction", label: "Shield", parentId: "parent", at: 2 },
        {
          id: "react-2",
          kind: "reaction",
          label: "Absorb",
          parentResolutionId: "res-parent",
          at: 3
        }
      ]
    });
    expect(cascadeUndoOrderInTurn(turn, "parent").map((e) => e.id)).toEqual([
      "react-2",
      "react-1",
      "parent"
    ]);
  });

  it("orders segment keys and lists turns in a round", () => {
    expect(combatSegmentKey(1, 5)).toBeLessThan(combatSegmentKey(2, 0));
    const turns = [
      createTurnList({ id: "a", round: 1, turnIndex: 0 }),
      createTurnList({ id: "b", round: 1, turnIndex: 1 }),
      createTurnList({ id: "c", round: 2, turnIndex: 0 })
    ];
    expect(listTurnsInRound(turns, 1).map((t) => t.id)).toEqual(["b", "a"]);
    expect(getCurrentTurnList(turns, 1, 1)?.id).toBe("b");
    expect(clearGameLog()).toEqual([]);
    expect(canUndoLatest(turns)).toBe(false);
    expect(createGameLogEntry({ label: "x" }).label).toBe("x");
  });
});

describe("combat game-log application", () => {
  beforeEach(() => {
    _resetGameLogForTests();
  });

  it("stays disabled out of combat", () => {
    expect(isGameLogEnabled()).toBe(false);
    recordResolutionOnGameLog(createActionResolution({
      id: "r1",
      phase: "completed",
      trace: [{ detail: "Sword" }]
    }));
    expect(getGameLogView().empty).toBe(true);
  });

  it("records into a turn list while combat is active", () => {
    setGameLogCombatActive(true);
    _setGameLogCursorForTests(1, 0);
    recordResolutionOnGameLog(createActionResolution({
      id: "res-a",
      phase: "completed",
      actorUuid: "Actor.1",
      appliedChanges: [{ type: "actor-hp", actorUuid: "Actor.2", prior: { value: 10 } }],
      trace: [{ detail: "Longsword hit" }]
    }));
    recordMovementOnGameLog({
      tokenUuid: "Token.1",
      label: "Fighter moved",
      round: 1,
      turnIndex: 0
    });

    const stack = getGameLogStack();
    expect(stack).toHaveLength(1);
    expect(stack[0].actions).toHaveLength(2);

    const view = getGameLogView({ scope: "all" });
    // Oldest first — latest at the bottom.
    expect(view.entries[0].kind).toBe("action");
    expect(view.entries[1].kind).toBe("movement");
  });

  it("stamps a start row then amends it on complete (no duplicate)", () => {
    setGameLogCombatActive(true);
    _setGameLogCursorForTests(1, 0);
    recordAbilityUseStartedOnGameLog({
      item: { name: "Fireball" },
      actorUuid: "Actor.1",
      section: "action",
      resolutionId: "res-fb"
    });
    expect(getGameLogStack()[0].actions).toHaveLength(1);
    expect(getGameLogStack()[0].actions[0].label).toBe("Fireball");

    recordResolutionOnGameLog(createActionResolution({
      id: "res-fb",
      phase: "completed",
      actorUuid: "Actor.1",
      appliedChanges: [{ type: "actor-hp", actorUuid: "Actor.2", prior: { value: 20 } }],
      trace: [{ detail: "Fireball · 2 hit" }]
    }));

    const actions = getGameLogStack()[0].actions;
    expect(actions).toHaveLength(1);
    expect(actions[0].label).toBe("Fireball");
    expect(actions[0].detail).toBe("Fireball · 2 hit");
    expect(actions[0].appliedChanges).toHaveLength(1);
  });

  it("links reactions on the same turn for cascade undo and deletes them", async () => {
    setGameLogCombatActive(true);
    _setGameLogCursorForTests(1, 0);
    recordResolutionOnGameLog(createActionResolution({
      id: "res-parent",
      phase: "completed",
      itemUuid: "Item.sword",
      appliedChanges: [{ type: "actor-hp", actorUuid: "Actor.2", prior: { value: 12 } }],
      trace: [{ detail: "Attack" }]
    }));
    recordResolutionOnGameLog(createActionResolution({
      id: "res-react",
      phase: "completed",
      itemUuid: "Item.shield",
      parentResolutionId: "res-parent",
      appliedChanges: [{ type: "flag", uuid: "Actor.2", scope: "dnd5e", key: "ac.bonus", prior: 0 }],
      trace: [{ detail: "Shield" }]
    }), { parentId: "res-parent" });

    const view = getGameLogView({ scope: "all" });
    const parent = view.entries.find((e) => e.kind === "action");
    const reaction = view.entries.find((e) => e.kind === "reaction");
    expect(parent).toBeTruthy();
    expect(reaction).toBeTruthy();

    const result = await undoGameLogEntry(parent.id);
    expect(result.undoneIds).toContain(reaction.id);
    expect(result.undoneIds).toContain(parent.id);
    expect(getGameLogView({ scope: "all" }).empty).toBe(true);
  });

  it("clears all turn lists when combat ends", () => {
    setGameLogCombatActive(true);
    recordMovementOnGameLog({ tokenUuid: "T1", label: "Move" });
    expect(getGameLogStack().length).toBeGreaterThan(0);
    setGameLogCombatActive(false);
    expect(isGameLogEnabled()).toBe(false);
    expect(getGameLogStack()).toEqual([]);
  });

  it("records free uses, standards, and summary-only resolutions", () => {
    setGameLogCombatActive(true);
    recordResolutionOnGameLog(createActionResolution({
      id: "res-free",
      phase: "completed",
      itemUuid: "Item.feature",
      activationType: "free",
      appliedChanges: [],
      trace: [{ detail: "Amphibious" }]
    }));
    recordStandardActionOnGameLog({
      actionId: "dash",
      label: "Dash",
      detail: "Speed doubled this turn",
      tokenUuid: "Token.1"
    });
    recordResolutionOnGameLog(createActionResolution({
      id: "res-miss",
      phase: "completed",
      itemUuid: "Item.bow",
      activationType: "action",
      appliedChanges: [],
      trace: [{ detail: "Longbow miss" }]
    }));

    const labels = getGameLogView({ scope: "all" }).entries.map((e) => e.kind);
    expect(labels).toContain("free");
    expect(labels).toContain("standard");
    expect(labels).toContain("action");
  });

  it("records movement without requiring undo history", () => {
    setGameLogCombatActive(true);
    _setGameLogCursorForTests(1, 0);
    const doc = {
      uuid: "Token.mover",
      x: 100,
      y: 200,
      elevation: 0,
      _source: {
        _movementHistory: [
          { x: 0, y: 0, cost: 0 },
          { x: 100, y: 200, cost: 5, movementId: "drag-1" }
        ]
      },
      movementHistory: [
        { x: 0, y: 0, cost: 0 },
        { x: 100, y: 200, cost: 5, movementId: "drag-1" }
      ]
    };
    const token = {
      name: "Fighter",
      document: doc,
      actor: { uuid: "Actor.f" },
      x: 100,
      y: 200
    };
    const entry = noteTokenMovedDuringCombat(token, { x: 100, y: 200 });
    expect(entry).toBeTruthy();
    expect(entry.kind).toBe("movement");
    expect(entry.detail).toMatch(/5 ft/);
  });

  it("keeps separate drags as separate rows so undo stops at B not A", () => {
    setGameLogCombatActive(true);
    _setGameLogCursorForTests(1, 0);
    const doc = {
      uuid: "Token.sep",
      x: 0,
      y: 0,
      elevation: 0,
      width: 1,
      height: 1,
      _source: { _movementHistory: [{ x: 0, y: 0, cost: 0 }] },
      movementHistory: [{ x: 0, y: 0, cost: 0 }]
    };
    const token = {
      name: "Fighter",
      document: doc,
      actor: { uuid: "Actor.s" },
      x: 0,
      y: 0
    };

    // Drag 1: A → B
    doc._source._movementHistory = [
      { x: 0, y: 0, cost: 0 },
      { x: 100, y: 0, cost: 5, movementId: "drag-a" }
    ];
    doc.movementHistory = doc._source._movementHistory;
    doc.x = 100;
    token.x = 100;
    noteTokenMovedDuringCombat(token, { x: 100, y: 0 });

    // Drag 2: B → C
    doc._source._movementHistory = [
      { x: 0, y: 0, cost: 0 },
      { x: 100, y: 0, cost: 5, movementId: "drag-a" },
      { x: 200, y: 0, cost: 5, movementId: "drag-b" }
    ];
    doc.movementHistory = doc._source._movementHistory;
    doc.x = 200;
    token.x = 200;
    noteTokenMovedDuringCombat(token, { x: 200, y: 0 });

    const actions = getGameLogStack()[0].actions;
    expect(actions).toHaveLength(2);
    expect(actions[0].appliedChanges[0].prior).toMatchObject({ x: 0, y: 0 });
    expect(actions[1].appliedChanges[0].prior).toMatchObject({ x: 100, y: 0 });
  });

  it("second drag prior comes from history even when doc/snapshot still show the old start", () => {
    setGameLogCombatActive(true);
    _setGameLogCursorForTests(1, 0);
    const doc = {
      uuid: "Token.stale",
      x: 0,
      y: 0,
      elevation: 0,
      width: 1,
      height: 1,
      _source: { _movementHistory: [{ x: 0, y: 0, cost: 0 }] },
      movementHistory: [{ x: 0, y: 0, cost: 0 }]
    };
    const token = {
      name: "Lich",
      document: doc,
      actor: { uuid: "Actor.lich" },
      x: 0,
      y: 0
    };

    // Drag 1 ends at B — but leave doc.x/y and a stale snapshot at A intentionally
    // after writing via note (simulates Foundry committing history before x/y).
    doc._source._movementHistory = [
      { x: 0, y: 0, cost: 0 },
      { x: 100, y: 0, cost: 5, movementId: "d1" },
      { x: 200, y: 0, cost: 5, movementId: "d1" }
    ];
    doc.movementHistory = doc._source._movementHistory;
    // Tip is B; doc still at A (Foundry lag).
    doc.x = 0;
    token.x = 0;
    noteTokenMovedDuringCombat(token, { _movementHistory: doc.movementHistory });

    // Drag 2: history includes C, doc still lagging at A, snapshot may be stale.
    doc._source._movementHistory = [
      { x: 0, y: 0, cost: 0 },
      { x: 100, y: 0, cost: 5, movementId: "d1" },
      { x: 200, y: 0, cost: 5, movementId: "d1" },
      { x: 300, y: 0, cost: 5, movementId: "d2" }
    ];
    doc.movementHistory = doc._source._movementHistory;
    doc.x = 0;
    token.x = 0;
    noteTokenMovedDuringCombat(token, { _movementHistory: doc.movementHistory });

    const actions = getGameLogStack()[0].actions;
    expect(actions).toHaveLength(2);
    expect(actions[0].appliedChanges[0].prior).toMatchObject({ x: 0, y: 0 });
    expect(actions[1].appliedChanges[0].prior).toMatchObject({ x: 200, y: 0 });
  });

  it("round rewind restores stored prior when Foundry cleared movement history", async () => {
    setGameLogCombatActive(true);
    _setGameLogCursorForTests(1, 0);
    const doc = {
      uuid: "Token.round",
      x: 300,
      y: 0,
      elevation: 0,
      width: 1,
      height: 1,
      _source: {
        _movementHistory: [
          { x: 0, y: 0, cost: 0 },
          { x: 100, y: 0, cost: 5, movementId: "r1" },
          { x: 200, y: 0, cost: 5, movementId: "r1" },
          { x: 300, y: 0, cost: 5, movementId: "r1" }
        ]
      },
      movementHistory: null,
      async revertRecordedMovement() {
        return false; // simulate cleared history — id gone
      },
      async update(data) {
        if ("x" in data) this.x = data.x;
        if ("y" in data) this.y = data.y;
        if ("_movementHistory" in data) {
          this._source._movementHistory = data._movementHistory;
          this.movementHistory = data._movementHistory;
        }
        return this;
      }
    };
    doc.object = { document: doc, x: 300, y: 0, stopAnimation() {} };
    const token = { name: "Dragon", document: doc, actor: { uuid: "Actor.d" }, x: 300, y: 0 };
    globalThis.fromUuidSync = (uuid) => (uuid === doc.uuid ? doc : null);

    noteTokenMovedDuringCombat(token, { x: 300, y: 0 });
    expect(getGameLogStack()[0].actions[0].appliedChanges[0].prior).toMatchObject({ x: 0, y: 0 });

    // Foundry clearMovementHistories on later turn start
    doc._source._movementHistory = [];
    doc.movementHistory = [];

    const result = await undoGameLogCurrentRound({ started: true, round: 1, turn: 0 });
    expect(result.ok).toBe(true);
    expect(doc.x).toBe(0);
    expect(doc.y).toBe(0);
    expect(getGameLogStack()).toHaveLength(0);
  });

  it("second drag prior is B even when the pose snapshot was lost", async () => {
    setGameLogCombatActive(true);
    _setGameLogCursorForTests(1, 0);
    const doc = {
      uuid: "Token.lost",
      x: 0,
      y: 0,
      elevation: 0,
      width: 1,
      height: 1,
      _source: { _movementHistory: [{ x: 0, y: 0, cost: 0 }] },
      movementHistory: [{ x: 0, y: 0, cost: 0 }],
      async update(data) {
        if ("x" in data) {
          this.x = data.x;
          if (this.object) this.object.x = data.x;
        }
        if ("y" in data) {
          this.y = data.y;
          if (this.object) this.object.y = data.y;
        }
        if ("_movementHistory" in data) {
          this._source._movementHistory = data._movementHistory;
          this.movementHistory = data._movementHistory;
        }
        return this;
      }
    };
    const token = {
      name: "Dragon",
      document: doc,
      actor: { uuid: "Actor.lost" },
      x: 0,
      y: 0,
      uuid: "Token.lost"
    };
    doc.object = token;
    globalThis.fromUuidSync = (uuid) => (uuid === doc.uuid ? doc : null);

    // Drag 1: A → B (15 ft)
    doc._source._movementHistory = [
      { x: 0, y: 0, cost: 0 },
      { x: 100, y: 0, cost: 5, movementId: "d1" },
      { x: 200, y: 0, cost: 5, movementId: "d1" },
      { x: 300, y: 0, cost: 5, movementId: "d1" }
    ];
    doc.movementHistory = doc._source._movementHistory;
    doc.x = 300;
    token.x = 300;
    noteTokenMovedDuringCombat(token, { x: 300, y: 0 });

    _clearMovementSnapshotsForTests();

    // Drag 2: B → C (15 ft) with no in-memory pose snapshot
    doc._source._movementHistory = [
      { x: 0, y: 0, cost: 0 },
      { x: 100, y: 0, cost: 5, movementId: "d1" },
      { x: 200, y: 0, cost: 5, movementId: "d1" },
      { x: 300, y: 0, cost: 5, movementId: "d1" },
      { x: 400, y: 0, cost: 5, movementId: "d2" },
      { x: 500, y: 0, cost: 5, movementId: "d2" },
      { x: 600, y: 0, cost: 5, movementId: "d2" }
    ];
    doc.movementHistory = doc._source._movementHistory;
    doc.x = 600;
    token.x = 600;
    noteTokenMovedDuringCombat(token, { x: 600, y: 0 });

    const actions = getGameLogStack()[0].actions;
    expect(actions).toHaveLength(2);
    expect(actions[1].appliedChanges[0].prior).toMatchObject({ x: 300, y: 0 });

    const result = await undoGameLogFromEntry(actions[1].id);
    expect(result.ok).toBe(true);
    expect(doc.x).toBe(300);
    expect(getGameLogStack()[0].actions).toHaveLength(1);
    expect(getGameLogStack()[0].actions[0].id).toBe(actions[0].id);
  });

  it("coalesces one drag into a single log row with total feet", () => {
    setGameLogCombatActive(true);
    _setGameLogCursorForTests(1, 0);
    const history = [
      { x: 0, y: 0, cost: 0 },
      { x: 100, y: 0, cost: 5, movementId: "drag-9" },
      { x: 200, y: 0, cost: 5, movementId: "drag-9" },
      { x: 300, y: 0, cost: 5, movementId: "drag-9" },
      { x: 400, y: 0, cost: 5, movementId: "drag-9" },
      { x: 500, y: 0, cost: 5, movementId: "drag-9" },
      { x: 600, y: 0, cost: 5, movementId: "drag-9" },
      { x: 700, y: 0, cost: 5, movementId: "drag-9" }
    ];
    const doc = {
      uuid: "Token.dragon",
      x: 0,
      y: 0,
      elevation: 0,
      width: 1,
      height: 1,
      _source: { _movementHistory: [history[0]] },
      movementHistory: [history[0]]
    };
    const token = {
      name: "Adult Red Dragon",
      document: doc,
      actor: { uuid: "Actor.d" },
      x: 0,
      y: 0
    };

    for (let i = 1; i < history.length; i += 1) {
      doc._source._movementHistory = history.slice(0, i + 1);
      doc.movementHistory = doc._source._movementHistory;
      doc.x = history[i].x;
      token.x = history[i].x;
      noteTokenMovedDuringCombat(token, { x: history[i].x, y: 0, _movementHistory: doc.movementHistory });
    }

    const stack = getGameLogStack();
    expect(stack[0].actions).toHaveLength(1);
    expect(stack[0].actions[0].costFeet).toBe(35);
    expect(stack[0].actions[0].detail).toBe("Combat movement (35 ft)");
    expect(stack[0].actions[0].appliedChanges[0].prior).toMatchObject({ x: 0, y: 0 });
    expect(stack[0].actions[0].appliedChanges[0].segments).toHaveLength(7);
  });

  it("uses Foundry revertRecordedMovement so spent feet roll back with the drag", async () => {
    setGameLogCombatActive(true);
    _setGameLogCursorForTests(1, 0);
    let revertedId = null;
    const doc = {
      uuid: "Token.revert",
      x: 300,
      y: 0,
      elevation: 0,
      width: 1,
      height: 1,
      _source: {
        _movementHistory: [
          { x: 0, y: 0, cost: 0 },
          { x: 100, y: 0, cost: 5, movementId: "drag-r" },
          { x: 200, y: 0, cost: 5, movementId: "drag-r" },
          { x: 300, y: 0, cost: 5, movementId: "drag-r" }
        ]
      },
      movementHistory: null,
      async revertRecordedMovement(movementId) {
        revertedId = movementId ?? null;
        this._source._movementHistory = [{ x: 0, y: 0, cost: 0 }];
        this.movementHistory = this._source._movementHistory;
        this.x = 0;
        if (this.object) this.object.x = 0;
        return true;
      }
    };
    doc.movementHistory = doc._source._movementHistory;
    const token = {
      name: "Dragon",
      document: doc,
      actor: { uuid: "Actor.revert" },
      x: 300,
      y: 0,
      uuid: "Token.revert"
    };
    doc.object = token;
    globalThis.fromUuidSync = (uuid) => (uuid === doc.uuid ? doc : null);

    noteTokenMovedDuringCombat(token, { x: 300, y: 0 });
    const entry = getGameLogStack()[0].actions[0];
    expect(entry.movementId).toBe("drag-r");

    const result = await undoGameLogFromEntry(entry.id);
    expect(result.ok).toBe(true);
    expect(revertedId).toBe("drag-r");
    expect(doc.x).toBe(0);
    expect(getGameLogStack()[0]?.actions ?? []).toHaveLength(0);
  });

  it("peels the last segment of a coalesced drag so A→B→C undoes to B", async () => {
    setGameLogCombatActive(true);
    _setGameLogCursorForTests(1, 0);
    const history = [
      { x: 0, y: 0, cost: 0 },
      { x: 100, y: 0, cost: 5, movementId: "drag-abc" },
      { x: 200, y: 0, cost: 5, movementId: "drag-abc" },
      { x: 300, y: 0, cost: 5, movementId: "drag-abc" }
    ];
    const doc = {
      uuid: "Token.abc",
      x: 0,
      y: 0,
      elevation: 0,
      width: 1,
      height: 1,
      _source: { _movementHistory: [history[0]] },
      movementHistory: [history[0]],
      async update(data) {
        if ("x" in data) {
          this.x = data.x;
          if (this.object) this.object.x = data.x;
        }
        if ("y" in data) {
          this.y = data.y;
          if (this.object) this.object.y = data.y;
        }
        if ("elevation" in data) this.elevation = data.elevation;
        if ("_movementHistory" in data) {
          this._source._movementHistory = data._movementHistory;
          this.movementHistory = data._movementHistory;
        }
        return this;
      }
    };
    const token = {
      name: "Fighter",
      document: doc,
      actor: { uuid: "Actor.abc" },
      x: 0,
      y: 0,
      uuid: "Token.abc"
    };
    globalThis.fromUuidSync = (uuid) => (uuid === doc.uuid ? doc : null);
    doc.object = token;

    for (let i = 1; i < history.length; i += 1) {
      doc._source._movementHistory = history.slice(0, i + 1);
      doc.movementHistory = doc._source._movementHistory;
      doc.x = history[i].x;
      token.x = history[i].x;
      noteTokenMovedDuringCombat(token, { x: history[i].x, y: 0 });
    }

    const entry = getGameLogStack()[0].actions[0];
    expect(entry.appliedChanges[0].segments).toHaveLength(3);
    expect(entry.costFeet).toBe(15);

    const result = await undoGameLogFromEntry(entry.id);
    expect(result.peeled).toBe(true);
    expect(doc.x).toBe(200);
    expect(token.x).toBe(200);

    const kept = getGameLogStack()[0].actions[0];
    expect(kept.id).toBe(entry.id);
    expect(kept.costFeet).toBe(10);
    expect(kept.detail).toBe("Combat movement (10 ft)");
    expect(kept.appliedChanges[0].segments).toHaveLength(2);
    expect(kept.appliedChanges[0].prior).toMatchObject({ x: 0, y: 0 });
  });

  it("does not record movementAction-only updates", () => {
    setGameLogCombatActive(true);
    const doc = {
      uuid: "Token.mode",
      x: 0,
      y: 0,
      elevation: 0,
      _source: { _movementHistory: [] }
    };
    const token = { name: "Rogue", document: doc, actor: { uuid: "Actor.r" } };
    expect(noteTokenMovedDuringCombat(token, { movementAction: "fly" })).toBeNull();
  });

  it("undo from entry deletes that action and later ones on the same turn", async () => {
    setGameLogCombatActive(true);
    _setGameLogCursorForTests(1, 0);
    recordGameLogEvent({ kind: "action", label: "A", round: 1, turnIndex: 0 });
    const mid = recordGameLogEvent({ kind: "action", label: "B", round: 1, turnIndex: 0 });
    recordGameLogEvent({ kind: "action", label: "C", round: 1, turnIndex: 0 });

    await undoGameLogFromEntry(mid.id);
    expect(getGameLogView({ scope: "all" }).entries.map((e) => e.label)).toEqual(["A"]);
    expect(getGameLogStack()[0].actions.map((a) => a.label)).toEqual(["A"]);
  });

  it("UI token-turn scope shows only the current turn list", () => {
    setGameLogCombatActive(true);
    recordGameLogEvent({
      kind: "action",
      label: "Alice A",
      round: 1,
      turnIndex: 0,
      combatantId: "c-a"
    });
    recordGameLogEvent({
      kind: "movement",
      label: "Bob moved",
      round: 1,
      turnIndex: 1,
      combatantId: "c-b",
      tokenUuid: "Token.b"
    });
    recordGameLogEvent({
      kind: "action",
      label: "Alice B",
      round: 1,
      turnIndex: 0,
      combatantId: "c-a"
    });

    const view = getGameLogView({ scope: "token-turn", round: 1, turnIndex: 0 });
    expect(view.entries.map((e) => e.label)).toEqual(["Alice A", "Alice B"]);
  });

  it("going back a turn undoes and deletes that turn list", async () => {
    setGameLogCombatActive(true);
    recordGameLogEvent({ kind: "action", label: "Alice", round: 1, turnIndex: 0, combatantId: "a" });
    recordGameLogEvent({ kind: "action", label: "Bob", round: 1, turnIndex: 1, combatantId: "b" });
    _setGameLogCursorForTests(1, 1);

    const result = await undoGameLogCurrentTurn({ started: true, round: 1, turn: 1 });
    expect(result.deletedTurnIds).toHaveLength(1);
    expect(getGameLogStack()).toHaveLength(1);
    expect(getGameLogStack()[0].actions.map((a) => a.label)).toEqual(["Alice"]);
  });

  it("going back a turn also clears any later turn lists", async () => {
    setGameLogCombatActive(true);
    recordGameLogEvent({ kind: "action", label: "T0", round: 1, turnIndex: 0 });
    recordGameLogEvent({ kind: "movement", label: "T0 move", round: 1, turnIndex: 0, tokenUuid: "Token.a" });
    recordGameLogEvent({ kind: "action", label: "T1", round: 1, turnIndex: 1 });
    _setGameLogCursorForTests(1, 0);

    const result = await undoGameLogCurrentTurn({ started: true, round: 1, turn: 0 });
    expect(result.deletedTurnIds.length).toBe(2);
    expect(getGameLogStack()).toHaveLength(0);
  });

  it("going back a round undoes and deletes every turn in that round", async () => {
    setGameLogCombatActive(true);
    recordGameLogEvent({ kind: "action", label: "R1T0", round: 1, turnIndex: 0 });
    recordGameLogEvent({ kind: "action", label: "R1T1", round: 1, turnIndex: 1 });
    recordGameLogEvent({ kind: "action", label: "R2T0", round: 2, turnIndex: 0 });
    _setGameLogCursorForTests(1, 1);

    const result = await undoGameLogCurrentRound({ started: true, round: 1, turn: 1 });
    expect(result.deletedTurnIds.length).toBe(2);
    expect(getGameLogStack()).toHaveLength(1);
    expect(getGameLogStack()[0].round).toBe(2);
    expect(listAllActionsNewestFirst(getGameLogStack()).map((a) => a.label)).toEqual(["R2T0"]);
  });
});
