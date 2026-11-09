import { describe, it, expect, beforeEach } from "vitest";
import { installFoundry, makeActor, makeToken, makeCombat, makeCombatant } from "./helpers.mjs";
import {
  getTargetConfig,
  requiresTargeting,
  requiresCanvasTargets,
  evaluateAbilityState,
  evaluateStandardActionState,
  allowsExtraAttackSwing,
  shouldForceTargetPick
} from "../src/application/ability.mjs";

describe("getTargetConfig", () => {
  beforeEach(() => installFoundry());

  it("prefers the activity target, then the item target, then null", () => {
    expect(getTargetConfig({}, { target: { type: "creature" } })).toEqual({ type: "creature" });
    expect(getTargetConfig({ system: { target: { type: "self" } } }, null)).toEqual({ type: "self" });
    expect(getTargetConfig({}, {})).toBeNull();
  });
});

describe("requiresTargeting", () => {
  beforeEach(() => installFoundry());

  it("is false when there is no target config", () => {
    expect(requiresTargeting({}, {})).toBe(false);
  });

  it("is false for self-targeted effects", () => {
    expect(requiresTargeting({}, { target: { affects: { type: "self" } } })).toBe(false);
  });

  it("is true when a template type is present", () => {
    expect(requiresTargeting({}, { target: { template: { type: "cone" } } })).toBe(true);
  });

  it("does not require canvas targets for templates or self", () => {
    expect(requiresCanvasTargets({}, { target: { template: { type: "cone" } } })).toBe(false);
    expect(requiresCanvasTargets({}, { target: { affects: { type: "self" } } })).toBe(false);
    expect(requiresCanvasTargets({}, { target: { affects: { type: "creature" } } })).toBe(true);
  });

  it("requires canvas targets for weapons and attack activities even without target config", () => {
    expect(requiresCanvasTargets({ type: "weapon" }, { type: "attack" })).toBe(true);
    expect(requiresCanvasTargets({ type: "weapon" }, {})).toBe(true);
    expect(requiresCanvasTargets({ type: "feat" }, { type: "attack" })).toBe(true);
    expect(shouldForceTargetPick({ type: "weapon" }, { type: "attack" })).toBe(true);
    expect(shouldForceTargetPick({ type: "spell" }, { type: "save", target: { affects: { type: "creature" } } })).toBe(false);
  });

  it("is true when an affects type is present", () => {
    expect(requiresTargeting({}, { target: { affects: { type: "creature" } } })).toBe(true);
  });

  it("is true for a legacy count/value without a template", () => {
    expect(requiresTargeting({}, { target: { value: 1 } })).toBe(true);
  });
});

describe("evaluateAbilityState", () => {
  beforeEach(() => installFoundry());

  it("is enabled for a simple usable ability out of combat", () => {
    const state = evaluateAbilityState({
      item: {},
      activity: {},
      actor: makeActor(),
      section: "action",
      inCombat: false
    });
    expect(state.disabled).toBe(false);
    expect(state.needsTarget).toBe(false);
    expect(state.disabledReason).toBeNull();
  });

  it("is disabled when the item is flagged disabled", () => {
    const state = evaluateAbilityState({
      item: { disabled: true },
      activity: {},
      actor: makeActor(),
      section: "action",
      inCombat: false
    });
    expect(state.disabled).toBe(true);
  });

  it("is disabled when the activity cannot be used", () => {
    const state = evaluateAbilityState({
      item: {},
      activity: { canUse: false },
      actor: makeActor(),
      section: "action",
      inCombat: false
    });
    expect(state.disabled).toBe(true);
  });

  it("is disabled when the action economy is already spent in combat", () => {
    const actor = makeActor({ id: "hero" });
    const cmb = makeCombatant({
      actor,
      flags: { "illusive-dnd-5e": { turn: { action: 0, bonus: 1, reaction: 1, attacks: { granted: 0, used: 0 } } } }
    });
    installFoundry({ combat: makeCombat({ started: true, combatants: [cmb], active: cmb }) });
    const state = evaluateAbilityState({
      item: {},
      activity: {},
      actor,
      section: "action",
      inCombat: true
    });
    expect(state.disabled).toBe(true);
  });

  it("keeps weapons usable after Action is spent (Extra Attack)", () => {
    const actor = makeActor({
      id: "hero",
      items: [{ name: "Extra Attack", type: "feat", system: { identifier: "extra-attack" } }]
    });
    const cmb = makeCombatant({
      actor,
      flags: {
        "illusive-dnd-5e": {
          turn: { action: 0, bonus: 1, reaction: 1, attacks: { granted: 2, used: 1 }, nickAvailable: false, slotCast: false }
        }
      }
    });
    installFoundry({ combat: makeCombat({ started: true, combatants: [cmb], active: cmb }) });
    const state = evaluateAbilityState({
      item: { type: "weapon" },
      activity: { type: "attack" },
      actor,
      section: "action",
      inCombat: true
    });
    expect(state.disabled).toBe(false);
    expect(allowsExtraAttackSwing({ type: "weapon" }, { type: "attack" }, "action", actor)).toBe(true);
  });

  it("locks weapons after Action is spent when the actor has no Extra Attack", () => {
    const actor = makeActor({ id: "hero" });
    const cmb = makeCombatant({
      actor,
      flags: { "illusive-dnd-5e": { turn: { action: 0, bonus: 1, reaction: 1, attacks: { granted: 0, used: 0 } } } }
    });
    installFoundry({ combat: makeCombat({ started: true, combatants: [cmb], active: cmb }) });
    const state = evaluateAbilityState({
      item: { type: "weapon" },
      activity: { type: "attack" },
      actor,
      section: "action",
      inCombat: true
    });
    expect(state.disabled).toBe(true);
    expect(allowsExtraAttackSwing({ type: "weapon" }, { type: "attack" }, "action", actor)).toBe(false);
  });

  it("still locks spells after Action is spent", () => {
    const actor = makeActor({ id: "hero" });
    const cmb = makeCombatant({
      actor,
      flags: { "illusive-dnd-5e": { turn: { action: 0, bonus: 1, reaction: 1, attacks: { granted: 0, used: 0 } } } }
    });
    installFoundry({ combat: makeCombat({ started: true, combatants: [cmb], active: cmb }) });
    const state = evaluateAbilityState({
      item: { type: "spell", system: { level: 0 } },
      activity: { type: "attack" },
      actor,
      section: "action",
      inCombat: true
    });
    expect(state.disabled).toBe(true);
    expect(allowsExtraAttackSwing({ type: "spell" }, { type: "attack" }, "action")).toBe(false);
  });

  it("is disabled on another combatant's turn (non-reaction)", () => {
    const actor = makeActor({ id: "hero" });
    const other = makeCombatant({ id: "villain", actor: makeActor({ id: "villain" }) });
    const combat = makeCombat({ started: true, combatants: [other], active: other });
    installFoundry({ combat });
    const state = evaluateAbilityState({ item: {}, activity: {}, actor, section: "action", inCombat: true });
    expect(state.disabled).toBe(true);
  });

  it("is disabled when a spell has no available slot", () => {
    const actor = makeActor({ spells: { spell1: { value: 0, max: 4 } } });
    const state = evaluateAbilityState({
      item: { type: "spell", system: { level: 1 } },
      activity: {},
      actor,
      section: "action",
      inCombat: false
    });
    expect(state.disabled).toBe(true);
  });

  it("allows innate and at-will spells without slot pools", () => {
    const actor = makeActor({ spells: {} });
    const innate = evaluateAbilityState({
      item: { type: "spell", system: { level: 2, method: "innate" } },
      activity: { type: "save", canUse: true },
      actor,
      section: "action",
      inCombat: false
    });
    expect(innate.disabled).toBe(false);

    const atWill = evaluateAbilityState({
      item: { type: "spell", system: { level: 1, method: "atwill" } },
      activity: { type: "utility", canUse: true },
      actor,
      section: "action",
      inCombat: false
    });
    expect(atWill.disabled).toBe(false);
  });

  it("allows feature cast activities that do not require spell slots", () => {
    const actor = makeActor({ spells: {} });
    const state = evaluateAbilityState({
      item: { type: "feat", name: "Spellcasting" },
      activity: {
        type: "cast",
        requiresSpellSlot: false,
        spell: { level: 1 },
        canUse: true
      },
      actor,
      section: "action",
      inCombat: false
    });
    expect(state.disabled).toBe(false);
  });

  it("allows prepared spells on monsters with no slot pools", () => {
    const actor = makeActor({ spells: { spell1: { value: 0, max: 0 } } });
    const state = evaluateAbilityState({
      item: { type: "spell", system: { level: 1, method: "spell" } },
      activity: { type: "save", canUse: true },
      actor,
      section: "action",
      inCombat: false
    });
    expect(state.disabled).toBe(false);
  });

  it("flags missing targets without disabling (HUD opens target picker)", () => {
    const state = evaluateAbilityState({
      item: { system: { target: { affects: { type: "creature" } } } },
      activity: {},
      actor: makeActor(),
      section: "action",
      inCombat: false
    });
    expect(state.needsTarget).toBe(true);
    expect(state.hasTargets).toBe(false);
    expect(state.disabled).toBe(false);
  });

  it("is out of range when the target is beyond activity range", () => {
    const origin = makeToken({ id: "t1" });
    origin.document.x = 0;
    origin.document.y = 0;
    origin.document.width = 1;
    origin.document.height = 1;
    const target = makeToken({ id: "t2" });
    target.document.x = 1000;
    target.document.y = 0;
    target.document.width = 1;
    target.document.height = 1;
    installFoundry({
      scene: { id: "scene1", grid: { size: 100, distance: 5 } },
      targets: [target]
    });
    canvas.scene = { id: "scene1", grid: { size: 100, distance: 5 } };
    const state = evaluateAbilityState({
      item: {
        system: {
          target: { affects: { type: "creature" } },
          activities: { contents: [{ id: "a", range: { value: 5 } }] }
        }
      },
      activity: { id: "a", range: { value: 5 } },
      actor: makeActor(),
      section: "action",
      inCombat: false,
      token: origin
    });
    expect(state.outOfRange).toBe(true);
    expect(state.disabled).toBe(true);
  });
});

describe("evaluateStandardActionState", () => {
  it("is disabled out of combat", () => {
    installFoundry();
    const state = evaluateStandardActionState({ id: "dash" }, makeActor(), false);
    expect(state.disabled).toBe(true);
  });

  it("is enabled in combat on the actor's turn with economy available", () => {
    const actor = makeActor({ id: "hero" });
    const cmb = makeCombatant({ id: "c", actor });
    const combat = makeCombat({ started: true, combatants: [cmb], active: cmb });
    installFoundry({ combat });
    const state = evaluateStandardActionState({ id: "dash" }, actor, true);
    expect(state.disabled).toBe(false);
  });

  it("allows Help with no targets so the HUD can open the target picker", () => {
    const actor = makeActor({ id: "hero" });
    const cmb = makeCombatant({ id: "c", actor });
    const combat = makeCombat({ started: true, combatants: [cmb], active: cmb });
    installFoundry({ combat });
    const state = evaluateStandardActionState({ id: "help" }, actor, true);
    expect(state.disabled).toBe(false);
  });
});
