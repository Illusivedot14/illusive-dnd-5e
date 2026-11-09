import { describe, it, expect, beforeEach } from "vitest";
import { createActionResolution, isTerminalPhase } from "../src/domain/combat/action-state.mjs";
import { advanceAction } from "../src/domain/combat/advance-action.mjs";
import { createRuleContext } from "../src/domain/rule-context.mjs";
import { buildHudView } from "../src/application/hud-view.mjs";
import { _resetCombatMemory, startHudAction, getLastResolutionView, correctResolution } from "../src/application/combat.mjs";

describe("combat action state", () => {
  it("starts an action and emits a useActivity command", () => {
    const state = createActionResolution({
      id: "r1",
      actorUuid: "Actor.1",
      itemUuid: "Actor.1.Item.1",
      activityId: "act1",
      rulesContext: createRuleContext({ edition: "2024" })
    });
    const result = advanceAction(state, {
      type: "start",
      targetUuids: ["Scene.1.Token.2"],
      useOptions: { configureDialog: false }
    });
    expect(result.state.phase).toBe("awaiting-attack");
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0].type).toBe("useActivity");
    expect(result.state.targets).toEqual([{ uuid: "Scene.1.Token.2", outcome: null }]);
  });

  it("records attack then damage phases", () => {
    let state = createActionResolution({ id: "r1", phase: "awaiting-attack" });
    state = advanceAction(state, {
      type: "attackRolled",
      rolls: [{ total: 18, formula: "1d20+5" }]
    }).state;
    expect(state.phase).toBe("awaiting-damage-or-save");
    state = advanceAction(state, {
      type: "damageRolled",
      rolls: [{ total: 9, formula: "1d8+3" }]
    }).state;
    expect(state.phase).toBe("ready-to-apply");
    expect(state.rolls).toHaveLength(2);
  });

  it("completes after useCompleted", () => {
    const state = createActionResolution({ id: "r1", phase: "awaiting-attack" });
    const result = advanceAction(state, { type: "useCompleted" });
    expect(result.state.phase).toBe("completed");
    expect(isTerminalPhase(result.state.phase)).toBe(true);
  });

  it("ignores events on terminal states", () => {
    const state = createActionResolution({ id: "r1", phase: "completed" });
    const result = advanceAction(state, { type: "start" });
    expect(result.state.phase).toBe("completed");
    expect(result.commands).toEqual([]);
  });

  it("builds a HUD view with explanation and correction", () => {
    let state = createActionResolution({
      id: "r1",
      rulesContext: createRuleContext({ edition: "2024" }),
      phase: "awaiting-attack"
    });
    state = advanceAction(state, { type: "useCompleted", summary: "Longsword finished" }).state;
    const view = buildHudView(state);
    expect(view.phase).toBe("completed");
    expect(view.headline).toContain("Longsword finished");
    expect(view.corrections).toHaveLength(1);
    expect(view.explanation.some((e) => e.rule === "combat.activity-use")).toBe(true);
  });
});

describe("combat application C1", () => {
  beforeEach(() => _resetCombatMemory());

  it("startHudAction completes and exposes a last view", async () => {
    const activity = {
      id: "act1",
      use: async () => ({})
    };
    const item = { id: "i1", uuid: "Actor.1.Item.i1", name: "Longsword" };
    const token = { actor: { uuid: "Actor.1" } };

    const id = await startHudAction({
      token,
      item,
      activity,
      section: "action",
      useOptions: { targetUuids: [] }
    });

    const view = getLastResolutionView();
    expect(id).toBeTruthy();
    expect(view?.id).toBe(id);
    expect(view?.phase).toBe("completed");
    expect(view?.headline).toMatch(/Longsword|finished/i);
  });

  it("correctResolution marks the action corrected", async () => {
    const activity = { id: "act1", use: async () => ({}) };
    const item = { id: "i1", uuid: "Actor.1.Item.i1", name: "Dagger" };
    await startHudAction({
      token: { actor: { uuid: "Actor.1" } },
      item,
      activity,
      section: "action",
      useOptions: {}
    });
    const view = getLastResolutionView();
    const corrected = await correctResolution({
      resolutionId: view.id,
      correction: { reason: "test" }
    });
    expect(corrected.phase).toBe("corrected");
  });
});
