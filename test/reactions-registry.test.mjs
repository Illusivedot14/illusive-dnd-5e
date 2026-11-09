import { describe, it, expect, beforeEach } from "vitest";
import {
  REACTION_REGISTRY,
  getReactionSpec,
  listReactionsForWindow,
  buildReactionPatches,
  resolveCounterspell,
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
  it("maps hard windows for rewrite reactions", () => {
    expect(getReactionSpec("shield").window).toBe("on-attack-hit");
    expect(getReactionSpec("shield").mode).toBe("hard");
    expect(getReactionSpec("counterspell").window).toBe("on-cast");
    expect(getReactionSpec("uncanny-dodge").window).toBe("on-damage-known");
    expect(getReactionSpec("hellish-rebuke").mode).toBe("soft");
  });

  it("matches 2024 Deflect Attacks and 2014 Deflect Missiles", () => {
    const deflect = getReactionSpec("deflect");
    expect(deflect.match({ name: "Deflect Missiles" })).toBe(true);
    expect(deflect.match({ name: "Deflect Attacks" })).toBe(true);
    expect(deflect.match({ name: "Deflect Energy" })).toBe(true);
    expect(deflect.match({ system: { identifier: "deflect-attacks" } })).toBe(true);
  });

  it("lists reactions per window", () => {
    const hit = listReactionsForWindow("on-attack-hit").map((s) => s.id);
    expect(hit).toContain("shield");
    expect(hit).toContain("silvery-barbs");
    expect(hit).toContain("cutting-words");
    expect(listReactionsForWindow("after-damage-applied").map((s) => s.id)).toEqual([
      "hellish-rebuke", "storms-thunder", "wrath-of-the-storm", "retaliation"
    ]);
  });

  it("merges rewrite patches", async () => {
    const monk = { system: { abilities: { dex: { mod: 3 } } }, classes: { monk: { system: { levels: 5 } } } };
    const merged = mergePatches([
      ...await buildReactionPatches("shield", { targetUuid: "T1" }),
      ...await buildReactionPatches("uncanny-dodge", { targetUuid: "T1" }),
      ...await buildReactionPatches("deflect", { targetUuid: "T1", reactor: monk })
    ]);
    expect(merged.acBonusByTarget.get("T1")).toBe(5);
    expect(merged.damageMultiplierByTarget.get("T1")).toBe(0.5);
    // 1d10 + Dex + monk level; average fallback without Roll = 5 + 3 + 5.
    expect(merged.damageReduceByTarget.get("T1")).toBe(13);
  });

  it("matches Deflect variants by edition trigger", () => {
    const deflect = getReactionSpec("deflect");
    const missiles = { name: "Deflect Missiles" };
    const attacks = { name: "Deflect Attacks" };
    const energy = { name: "Deflect Energy" };
    const meleeSlash = { attackRoll: true, ranged: false, damageTypes: ["slashing"] };
    const rangedFire = { attackRoll: true, ranged: true, damageTypes: ["fire"] };
    expect(deflect.match(missiles, meleeSlash)).toBe(false);
    expect(deflect.match(missiles, rangedFire)).toBe(true);
    expect(deflect.match(attacks, meleeSlash)).toBe(true);
    expect(deflect.match(attacks, rangedFire)).toBe(false);
    expect(deflect.match(energy, rangedFire)).toBe(true);
    expect(deflect.match(energy, { attackRoll: false, damageTypes: ["fire"] })).toBe(false);
  });

  it("Cutting Words subtracts the bardic die instead of forcing a miss", async () => {
    const bard = { system: { scale: { bard: { "bardic-inspiration": { die: "d8" } } } } };
    const [patch] = await buildReactionPatches("cutting-words", { reactor: bard });
    expect(patch.type).toBe("attackPenalty");
    expect(patch.formula).toBe("1d8");
    expect(mergePatches([patch]).attackPenalty).toBeGreaterThan(0);
  });

  it("Silvery Barbs rerolls and keeps the lower roll", async () => {
    const [patch] = await buildReactionPatches("silvery-barbs", { windowId: "on-attack-hit" });
    expect(patch).toMatchObject({ type: "rerollAttack", keep: "lower" });
  });

  it("Absorb Elements resists only the elemental damage types", async () => {
    const [patch] = await buildReactionPatches("absorb-elements", {
      targetUuid: "T1",
      damageTypes: ["slashing", "fire"]
    });
    expect(patch.value).toEqual(["fire"]);
  });

  it("Counterspell 2014 auto-counters level 3 or lower; 2024 refunds the slot", async () => {
    const legacy = await resolveCounterspell({ spellLevel: 3, ctx: { rulesContext: { legacy: true } } });
    expect(legacy).toMatchObject({ countered: true, auto: true, edition: "2014" });

    const caster = { rollSavingThrow: async () => [{ total: 5 }] };
    const reactor = { system: { attributes: { spell: { dc: 15 } } } };
    const modern = await resolveCounterspell({ reactor, caster, spellLevel: 5, ctx: {} });
    expect(modern).toMatchObject({ countered: true, edition: "2024", refundSlot: true });

    const saved = await resolveCounterspell({
      reactor,
      caster: { rollSavingThrow: async () => [{ total: 18 }] },
      spellLevel: 5
    });
    expect(saved.countered).toBe(false);
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

  it("exposes every registry entry", () => {
    expect(Object.keys(REACTION_REGISTRY).length).toBeGreaterThanOrEqual(8);
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
