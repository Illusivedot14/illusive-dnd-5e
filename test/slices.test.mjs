import { describe, it, expect, beforeEach, vi } from "vitest";
import { findPath } from "../src/domain/movement/find-path.mjs";
import { evaluateMove } from "../src/domain/movement/evaluate-move.mjs";
import { evaluateVisibility } from "../src/domain/vision/evaluate-visibility.mjs";
import { evaluateLightAt } from "../src/domain/lighting/evaluate-light.mjs";
import { evaluateLootOperation } from "../src/domain/loot/evaluate-operation.mjs";
import { advanceAction } from "../src/domain/combat/advance-action.mjs";
import { createActionResolution } from "../src/domain/combat/action-state.mjs";
import { levelFeatures } from "../src/application/levels.mjs";
import { listRules, getRule } from "../src/rules/catalog.mjs";
import {
  _resetCombatMemory,
  startHudAction,
  submitEvent,
  resolveReaction,
  correctResolution,
  getLastResolutionView,
  listPending
} from "../src/application/combat.mjs";
import { installFoundry } from "./helpers.mjs";

describe("movement domain", () => {
  it("finds a path around a blocked cell", () => {
    const blocked = new Set(["1,0"]);
    const result = findPath({ x: 0, y: 0 }, { x: 2, y: 0 }, { blocked });
    expect(result.blocked).toBe(false);
    expect(result.path[0]).toEqual({ x: 0, y: 0 });
    expect(result.path.at(-1)).toEqual({ x: 2, y: 0 });
    expect(result.path.some((p) => p.x === 1 && p.y === 0)).toBe(false);
  });

  it("rejects moves that cost more than remaining feet", () => {
    const evaluation = evaluateMove({
      fromGrid: { x: 0, y: 0 },
      toGrid: { x: 10, y: 0 },
      remainingFeet: 15,
      gridDistance: 5,
      blocked: new Set()
    });
    expect(evaluation.ok).toBe(false);
    expect(evaluation.reason).toBe("insufficient-movement");
  });
});

describe("vision + lighting domain", () => {
  it("marks darkness without darkvision as not visible", () => {
    const result = evaluateVisibility({
      observer: { x: 0, y: 0 },
      target: { x: 10, y: 0 },
      factors: { hasLOS: true, darkness: true, illuminated: false, observerHasDarkvision: false }
    });
    expect(result.result).toBe("not-visible");
    expect(result.reason).toBe("darkness");
  });

  it("evaluates bright light near a source", () => {
    const light = evaluateLightAt({
      point: { x: 50, y: 50 },
      gridSize: 100,
      lights: [{ x: 50, y: 50, bright: 2, dim: 4 }]
    });
    expect(light.level).toBe("bright");
    expect(light.illuminated).toBe(true);
  });
});

describe("loot domain", () => {
  it("validates transfer preconditions", () => {
    expect(evaluateLootOperation(
      { type: "transfer", sourceActorUuid: "A", targetActorUuid: "B", itemId: "i1", quantity: 2 },
      { sourceOwnsItem: true, quantityAvailable: 1, targetCanReceive: true }
    ).ok).toBe(false);

    expect(evaluateLootOperation(
      { type: "transfer", sourceActorUuid: "A", targetActorUuid: "B", itemId: "i1", quantity: 1 },
      { sourceOwnsItem: true, quantityAvailable: 3, targetCanReceive: true }
    ).ok).toBe(true);
  });
});

describe("automation levels", () => {
  it("always enables the full feature set", () => {
    const features = levelFeatures();
    expect(features.movementPreview).toBe(true);
    expect(features.visionEval).toBe(true);
    expect(features.lootTransfer).toBe(true);
    expect(features.opportunityAttacks).toBe(true);
    expect(features.coverMatrix).toBe(true);
    expect(levelFeatures("essentials").movementPreview).toBe(true);
  });
});

describe("rules catalog", () => {
  it("includes grapple legacy and 2024 entries", () => {
    expect(getRule("combat.grapple.2014").edition).toBe("2014");
    expect(getRule("combat.grapple.2024").errata.checked).toBe(true);
    expect(listRules({ automation: "full" }).length).toBeGreaterThan(3);
  });
});

describe("combat C2 reaction + correction", () => {
  beforeEach(() => {
    installFoundry();
    _resetCombatMemory();
  });

  it("pauses for reaction then resumes", async () => {
    const activity = { id: "act1", use: vi.fn(async () => ({})) };
    const id = await startHudAction({
      token: { actor: { uuid: "Actor.1" } },
      item: { id: "i1", uuid: "Actor.1.Item.i1", name: "Sword" },
      activity,
      useOptions: { pauseForReaction: true, targetUuids: [] }
    });
    expect(listPending().some((r) => r.id === id)).toBe(true);
    const done = await resolveReaction({ resolutionId: id, used: false });
    expect(done.phase).toBe("completed");
  });

  it("completes a normal activity use", async () => {
    const activity = { id: "act1", use: vi.fn(async () => ({})) };
    await startHudAction({
      token: { actor: { uuid: "Actor.1" } },
      item: { id: "i1", uuid: "Actor.1.Item.i1", name: "Bow" },
      activity,
      useOptions: {}
    });
    const view = getLastResolutionView();
    expect(view.phase).toBe("completed");
    expect(activity.use).toHaveBeenCalled();
  });

  it("corrects a completed resolution", async () => {
    const activity = { id: "act1", use: async () => ({}) };
    await startHudAction({
      token: { actor: { uuid: "Actor.1" } },
      item: { id: "i1", uuid: "Actor.1.Item.i1", name: "Axe" },
      activity,
      useOptions: {}
    });
    const view = getLastResolutionView();
    // Seed an applied change then correct
    await submitEvent({
      resolutionId: view.id,
      event: {
        type: "recordChange",
        // recordChange ignored on completed — seed via recreating flow:
      }
    }).catch(() => null);

    let state = createActionResolution({ id: "manual", phase: "completed", appliedChanges: [] });
    state = advanceAction(state, {
      type: "correct",
      correction: { reason: "test" }
    }).state;
    // completed -> correct allowed
    state = createActionResolution({
      id: "manual2",
      phase: "completed",
      appliedChanges: [{ type: "token-position", tokenUuid: "T", prior: { x: 0, y: 0 }, next: { x: 1, y: 1 } }]
    });
    const advanced = advanceAction(state, { type: "correct", correction: { reason: "rewind" } });
    expect(advanced.state.phase).toBe("corrected");
    expect(advanced.commands[0].payload.undoPlan).toHaveLength(1);

    const corrected = await correctResolution({
      resolutionId: view.id,
      correction: { reason: "GM fix" }
    });
    expect(corrected.phase).toBe("corrected");
  });
});
