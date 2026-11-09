import { describe, it, expect } from "vitest";
import { installFoundry } from "./helpers.mjs";
import {
  findActorTokenDoc,
  findTokenViewById,
  nextTokenStep,
  sceneGridStep,
  stepActorToken,
  tokenViewFromDoc,
  undoActorToken
} from "../src/foundry/token-step.mjs";

describe("sceneGridStep", () => {
  it("reads Foundry grid size", () => {
    expect(sceneGridStep({ grid: { size: 100 } })).toEqual({ x: 100, y: 100 });
    expect(sceneGridStep({ grid: { sizeX: 50, sizeY: 75 } })).toEqual({ x: 50, y: 75 });
  });
});

describe("nextTokenStep", () => {
  it("moves one square", () => {
    expect(nextTokenStep({ x: 200, y: 300 }, "right", { x: 100, y: 100 }))
      .toEqual({ x: 300, y: 300 });
    expect(nextTokenStep({ x: 200, y: 300 }, "up", { x: 100, y: 100 }))
      .toEqual({ x: 200, y: 200 });
    expect(nextTokenStep({ x: 200, y: 300 }, "upRight", { x: 100, y: 100 }))
      .toEqual({ x: 300, y: 200 });
    expect(nextTokenStep({ x: 200, y: 300 }, "downLeft", { x: 100, y: 100 }))
      .toEqual({ x: 100, y: 400 });
  });

  it("rejects a bad direction", () => {
    expect(nextTokenStep({ x: 0, y: 0 }, "diagonal", { x: 100, y: 100 })).toBeNull();
  });
});

describe("findActorTokenDoc", () => {
  it("picks the owned token on the viewed scene", () => {
    const token = { id: "t1", actorId: "a1", isOwner: true, actor: { id: "a1" } };
    installFoundry({
      actors: [{ id: "a1", name: "Hero" }],
      scene: { id: "scene1", tokens: { filter: (fn) => [token].filter(fn) } }
    });
    globalThis.game.scenes = {
      current: { tokens: [token] },
      viewed: null,
      get: () => null,
      active: null
    };
    expect(findActorTokenDoc({ id: "a1" })).toBe(token);
  });

  it("ignores a token on a different map", () => {
    const other = { id: "t2", actorId: "a1", isOwner: true, parent: { id: "other" } };
    installFoundry({ actors: [{ id: "a1", name: "Hero" }] });
    globalThis.game.scenes = {
      active: { id: "scene1", tokens: [] },
      current: { id: "scene1", tokens: [] },
      get: () => null
    };
    globalThis.game.actors = {
      get: () => ({ id: "a1", getActiveTokens: () => [other] })
    };
    expect(findActorTokenDoc({ id: "a1", getActiveTokens: () => [other] })).toBeNull();
  });
});

describe("stepActorToken", () => {
  it("falls back to update when move does nothing", async () => {
    const updates = [];
    const moveOptions = [];
    const token = {
      id: "t1",
      actorId: "a1",
      isOwner: true,
      x: 200,
      y: 300,
      parent: { grid: { size: 100 } },
      async move(_waypoint, options) { moveOptions.push(options); },
      async update(data) { updates.push(data); Object.assign(this, data); }
    };
    installFoundry({ actors: [{ id: "a1", name: "Hero" }] });
    globalThis.canvas.ready = true;
    globalThis.canvas.grid = { size: 100 };
    globalThis.game.scenes = { current: { tokens: [token] }, get: () => null, active: null };
    const result = await stepActorToken({ id: "a1" }, "right");
    expect(result.ok).toBe(true);
    expect(moveOptions[0]).toMatchObject({ showRuler: true, pan: false });
    expect(moveOptions[0].animate).toBeUndefined();
    expect(updates).toEqual([{ x: 300, y: 300 }]);
  });
});

describe("undoActorToken", () => {
  it("puts the token back on a square instead of walking the path", async () => {
    const moves = [];
    const updates = [];
    const token = {
      id: "t-undo",
      actorId: "a1",
      isOwner: true,
      x: 0,
      y: 0,
      _source: {
        _movementHistory: [
          { x: 0, y: 0, movementId: "origin" },
          { x: 100, y: 0, movementId: "step-up" },
          { x: 200, y: 0, movementId: "step-right" },
          { x: 200, y: 100, movementId: "step-down" }
        ]
      },
      parent: { id: "scene1", grid: { size: 100, distance: 5 } },
      async move(waypoint) {
        moves.push(waypoint);
        this.x = waypoint.x;
        this.y = waypoint.y;
        return true;
      },
      async update(data, options) {
        updates.push({ data, options });
        Object.assign(this, data);
      },
      async revertRecordedMovement() { return false; }
    };
    installFoundry({ actors: [{ id: "a1", name: "Hero" }] });
    globalThis.canvas.ready = true;
    globalThis.canvas.grid = { size: 100 };
    globalThis.game.scenes = {
      current: { id: "scene1", tokens: [token], grid: { size: 100, distance: 5 } },
      get: () => null,
      active: null
    };

    await stepActorToken({ id: "a1" }, "up");
    await stepActorToken({ id: "a1" }, "right");
    await stepActorToken({ id: "a1" }, "down");
    expect(moves.map((waypoint) => ({ x: waypoint.x, y: waypoint.y }))).toEqual([
      { x: 0, y: -100 },
      { x: 100, y: -100 },
      { x: 100, y: 0 }
    ]);
    moves.length = 0;
    updates.length = 0;

    const undone = await undoActorToken({ id: "a1" }, { all: true });
    expect(undone.ok).toBe(true);
    expect(moves).toEqual([]);
    expect(updates.at(-1)?.options).toMatchObject({ animate: false });
    expect(updates.at(-1)?.data).toMatchObject({ x: 0, y: 0 });
  });

  it("undo one leaves the previous square when the last point is on the same square", async () => {
    const updates = [];
    const token = {
      id: "t-undo",
      actorId: "a1",
      isOwner: true,
      x: 560,
      y: 1260,
      _source: {
        _movementHistory: [
          { x: 560, y: 1540, movementId: "origin" },
          { x: 560, y: 1400, movementId: "step-1" },
          { x: 560, y: 1273, movementId: "hit" },
          { x: 560, y: 1260, movementId: "nudge" }
        ]
      },
      parent: { id: "scene1", grid: { size: 140, distance: 5 } },
      async update(data, options) {
        updates.push({ data, options });
        Object.assign(this, data);
      }
    };
    installFoundry({ actors: [{ id: "a1", name: "Hero" }] });
    globalThis.canvas.ready = true;
    globalThis.canvas.grid = { size: 140 };
    globalThis.game.scenes = {
      current: { id: "scene1", tokens: [token], grid: { size: 140, distance: 5 } },
      get: () => null,
      active: null
    };
    const undone = await undoActorToken({ id: "a1" }, { all: false });
    expect(undone.ok).toBe(true);
    expect(updates.at(-1)?.data).toMatchObject({ x: 560, y: 1400 });
  });
});

describe("tokenViewFromDoc", () => {
  it("wraps a token document for movement helpers", () => {
    const doc = { id: "t1", actor: { id: "a1" } };
    expect(tokenViewFromDoc(doc)).toEqual({
      id: "t1",
      actor: { id: "a1" },
      document: doc,
      isOwner: undefined
    });
  });
});

describe("findTokenViewById", () => {
  it("returns the canvas token when present", () => {
    const token = { id: "t1", actor: { id: "a1" } };
    installFoundry();
    globalThis.canvas.tokens.get = (id) => (id === "t1" ? token : null);
    expect(findTokenViewById("t1")).toBe(token);
  });

  it("wraps the scene document when the canvas has no token", () => {
    const doc = { id: "t1", actor: { id: "a1" } };
    installFoundry();
    globalThis.canvas.tokens.get = () => null;
    globalThis.game.scenes = {
      active: { id: "scene1", tokens: { get: (id) => (id === "t1" ? doc : null) } },
      current: null,
      get: () => null
    };
    expect(findTokenViewById("t1")).toEqual({
      id: "t1",
      actor: { id: "a1" },
      document: doc,
      isOwner: undefined
    });
  });
});
