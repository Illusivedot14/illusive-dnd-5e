import { describe, it, expect, beforeEach } from "vitest";
import {
  REACTION_REGISTRY,
  listReactionsForWindow,
  mergePatches
} from "../src/application/reactions/registry.mjs";
import {
  openReactionWindow,
  damageTargetsFromPatches,
  _resetHardWindowWaits
} from "../src/application/reactions/window.mjs";
import { createActionResolution } from "../src/domain/combat/action-state.mjs";
import { advanceAction } from "../src/domain/combat/advance-action.mjs";
import { getRule } from "../src/rules/catalog.mjs";
import {
  _resetCombatMemory,
  pauseParentForReaction,
  resumeParent
} from "../src/application/combat.mjs";
import { saveResolution } from "../src/foundry/workflow-store.mjs";

describe("reaction registry", () => {
  it("holds only Ready; item reactions are declarations", () => {
    expect(Object.keys(REACTION_REGISTRY)).toEqual(["opportunity", "ready"]);
    expect(listReactionsForWindow("on-leave-reach").map((s) => s.id)).toEqual(["opportunity"]);
    expect(listReactionsForWindow("after-move").map((s) => s.id)).toEqual(["ready"]);
    expect(listReactionsForWindow("on-attack-hit")).toEqual([]);
  });

  it("merges rewrite patches per target", () => {
    const merged = mergePatches([
      { type: "acBonus", targetUuid: "T1", value: 5, source: "shield" },
      { type: "damageMultiplier", targetUuid: "T1", value: 0.5, source: "uncanny-dodge" },
      { type: "damageReduce", targetUuid: "T1", value: 13, source: "deflect" }
    ]);
    expect(merged.acBonusByTarget.get("T1")).toBe(5);
    expect(merged.damageMultiplierByTarget.get("T1")).toBe(0.5);
    expect(merged.damageReduceByTarget.get("T1")).toBe(13);
    expect(merged.sources).toEqual(["shield", "uncanny-dodge", "deflect"]);
  });

  it("maps damage patches per target for the trail write", () => {
    const merged = mergePatches([
      { type: "damageMultiplier", targetUuid: "T1", value: 0.5 },
      { type: "damageReduce", targetUuid: "T2", value: 7 },
      { type: "resistTypes", targetUuid: "T2", value: ["fire"] }
    ]);
    const out = damageTargetsFromPatches([{ uuid: "T1", multiplier: 0.5 }, "T2", "T3"], merged);
    expect(out[0].multiplier).toBe(0.25);
    expect(out[1]).toMatchObject({ uuid: "T2", reduce: 7, resistTypes: ["fire"] });
    expect(out[2]).toEqual({ uuid: "T3" });
  });

  it("registers catalog reaction rules", () => {
    expect(getRule("combat.reaction.shield").automation).toBe("full");
    expect(getRule("combat.reaction.deflect").id).toBe("combat.reaction.deflect");
    expect(getRule("combat.economy.reaction").notes).toMatch(/hard\/soft/i);
  });
});

describe("hard reaction window FSM", () => {
  beforeEach(() => {
    _resetCombatMemory();
    _resetHardWindowWaits();
  });

  it("stores resumePhase on awaitReaction and restores on reactionResolved", () => {
    let state = createActionResolution({
      id: "p1",
      phase: "awaiting-attack",
      actorUuid: "Actor.A"
    });
    state = advanceAction(state, {
      type: "awaitReaction",
      actorUuid: "Actor.B",
      trigger: "shield",
      windowId: "on-attack-hit",
      resumePhase: "awaiting-attack",
      mode: "hard",
      options: { hardParent: true }
    }).state;
    expect(state.phase).toBe("awaiting-reaction");
    expect(state.reactionWindow.resumePhase).toBe("awaiting-attack");
    expect(state.reactionWindow.windowId).toBe("on-attack-hit");

    state = advanceAction(state, {
      type: "reactionResolved",
      patches: [{ type: "acBonus", targetUuid: "T1", value: 5 }],
      used: true
    }).state;
    expect(state.phase).toBe("awaiting-attack");
    expect(state.pendingDecision).toBeNull();
    expect(state.reactionPatches).toEqual([{ type: "acBonus", targetUuid: "T1", value: 5 }]);
  });

  it("pauseParentForReaction and resumeParent round-trip", async () => {
    const id = "hard-parent-1";
    await saveResolution(createActionResolution({
      id,
      phase: "awaiting-damage-or-save",
      actorUuid: "Actor.A"
    }));
    // Seed combat memory by loading through pause (uses loadResolution fallback)
    const paused = await pauseParentForReaction({
      resolutionId: id,
      actorUuid: "Actor.B",
      trigger: "shield",
      windowId: "on-attack-hit",
      resumePhase: "awaiting-damage-or-save",
      mode: "hard"
    });
    expect(paused).toBeTruthy();
    expect(paused.phase).toBe("awaiting-reaction");
    expect(paused.pendingDecision?.options?.hardParent).toBe(true);

    const resumed = await resumeParent(paused.id, [{ type: "forceMiss" }]);
    expect(resumed.phase).toBe("awaiting-damage-or-save");
    expect(resumed.reactionPatches?.[0]?.type).toBe("forceMiss");
  });

  it("openReactionWindow with no candidates returns empty merge", async () => {
    const merged = await openReactionWindow({
      parentId: "missing",
      windowId: "on-attack-hit",
      candidates: []
    });
    expect(merged.cancelCast).toBe(false);
    expect(merged.attackPenalty).toBe(0);
  });

  it("cancelCast carries the 2024 slot refund through mergePatches", () => {
    const merged = mergePatches([
      { type: "cancelCast", source: "counterspell", refundSlot: true },
      { type: "attackPenalty", value: 4, source: "cutting-words" }
    ]);
    expect(merged.cancelCast).toBe(true);
    expect(merged.refundSlot).toBe(true);
    expect(merged.attackPenalty).toBe(4);
    expect(merged.rerollAttack).toBe(false);
  });
});
