import { describe, it, expect, beforeEach } from "vitest";
import { installFoundry, makeActor, makeCombat, makeCombatant, makeGroup } from "./helpers.mjs";
import {
  isEventCombatant,
  getEventRoundsLeft,
  getEventDisplayRoundsLeft,
  getHP,
  getResource,
  resolvePortraitSrc,
  buildCombatantData,
  buildUnitData
} from "../src/foundry/actor-data.mjs";

describe("isEventCombatant", () => {
  beforeEach(() => installFoundry());
  it("detects the module event flag", () => {
    expect(isEventCombatant(makeCombatant({ event: true }))).toBe(true);
    expect(isEventCombatant(makeCombatant())).toBe(false);
  });
});

describe("getEventRoundsLeft", () => {
  beforeEach(() => installFoundry());
  it("returns null when there is no duration flag", () => {
    expect(getEventRoundsLeft(makeCombatant(), makeCombat({ round: 2 }))).toBeNull();
  });
  it("counts down from the created round, flooring at 0", () => {
    const ev = makeCombatant({ event: true, duration: 3, roundCreated: 1 });
    expect(getEventRoundsLeft(ev, makeCombat({ round: 2 }))).toBe(2);
    expect(getEventRoundsLeft(ev, makeCombat({ round: 6 }))).toBe(0);
  });
});

describe("getEventDisplayRoundsLeft", () => {
  beforeEach(() => installFoundry());
  it("returns null when hideDuration is set", () => {
    const ev = makeCombatant({ event: true, duration: 3, roundCreated: 1, hideDuration: true });
    expect(getEventDisplayRoundsLeft(ev, makeCombat({ round: 2 }))).toBeNull();
  });
  it("matches getEventRoundsLeft when duration is shown", () => {
    const ev = makeCombatant({ event: true, duration: 3, roundCreated: 1 });
    const combat = makeCombat({ round: 2 });
    expect(getEventDisplayRoundsLeft(ev, combat)).toBe(getEventRoundsLeft(ev, combat));
  });
});

describe("getHP", () => {
  beforeEach(() => installFoundry());
  it("reads value/max, defaulting to zero", () => {
    expect(getHP(makeActor({ hp: { value: 7, max: 12 } }))).toEqual({ value: 7, max: 12 });
    expect(getHP(null)).toEqual({ value: 0, max: 0 });
  });
});

describe("getResource", () => {
  beforeEach(() => installFoundry());

  it("returns the primary resource when valid", () => {
    const actor = makeActor({ system: { resources: { primary: { label: "Ki", value: 3, max: 5 } } } });
    expect(getResource(actor)).toEqual({ label: "Ki", value: 3, max: 5 });
  });

  it("falls back to another resource when primary is empty", () => {
    const actor = makeActor({
      system: { resources: { primary: { max: 0 }, mana: { label: "Mana", value: 2, max: 4 } } }
    });
    expect(getResource(actor)).toEqual({ label: "Mana", value: 2, max: 4 });
  });

  it("returns null when there are no usable resources", () => {
    expect(getResource(makeActor({ system: { resources: {} } }))).toBeNull();
    expect(getResource(makeActor())).toBeNull();
  });

  it("rejects resources with an over-long label", () => {
    const actor = makeActor({ system: { resources: { primary: { label: "x".repeat(29), value: 1, max: 2 } } } });
    expect(getResource(actor)).toBeNull();
  });
});

describe("resolvePortraitSrc", () => {
  beforeEach(() => installFoundry());

  it("prefers actor avatar over canvas token texture", () => {
    const actor = makeActor({
      img: "avatars/devil.png",
      flags: { dnd5e: {} },
      prototypeToken: { texture: { src: "tokens/devil-face.png" } }
    });
    expect(resolvePortraitSrc(actor)).toBe("avatars/devil.png");
  });

  it("uses prototype token texture only when showTokenPortrait is set", () => {
    const actor = makeActor({
      img: "avatars/devil.png",
      flags: { dnd5e: { showTokenPortrait: true } },
      prototypeToken: { texture: { src: "tokens/devil-face.png" } }
    });
    expect(resolvePortraitSrc(actor)).toBe("tokens/devil-face.png");
  });

  it("ignores combatant img (often scene token art)", () => {
    const actor = makeActor({ img: "" });
    expect(resolvePortraitSrc(actor)).toBe("icons/svg/mystery-man.svg");
  });
});

describe("buildCombatantData", () => {
  it("summarizes a rolled, active, GM-visible combatant", () => {
    const actor = makeActor({ isOwner: true, hp: { value: 8, max: 10 } });
    const cmb = makeCombatant({ id: "hero", name: "Hero", initiative: 17, actor });
    const combat = makeCombat({ combatants: [cmb], active: cmb });
    installFoundry({ isGM: true, combat });

    const data = buildCombatantData(cmb, combat);
    expect(data).toMatchObject({
      id: "hero",
      name: "Hero",
      initiative: 17,
      hasRolled: true,
      canRollInitiative: false,
      isActive: true,
      markedDefeated: false,
      isDead: false,
      secret: false,
      hidden: false,
      showHp: true
    });
  });

  it("offers initiative rolling for an owned, unrolled combatant", () => {
    const actor = makeActor({ isOwner: true });
    const cmb = makeCombatant({ initiative: null, actor });
    const combat = makeCombat({ combatants: [cmb] });
    installFoundry({ isGM: false, combat });

    const data = buildCombatantData(cmb, combat);
    expect(data.hasRolled).toBe(false);
    expect(data.initiative).toBe("\u2014");
    expect(data.canRollInitiative).toBe(true);
  });

  it("marks GM-hidden combatants as secret", () => {
    const cmb = makeCombatant({ hidden: true, actor: makeActor() });
    const combat = makeCombat({ combatants: [cmb] });
    installFoundry({ isGM: true, combat });
    expect(buildCombatantData(cmb, combat).secret).toBe(true);
  });

  it("shows enemy health status wash to non-owner players", () => {
    const cmb = makeCombatant({ actor: makeActor({ isOwner: false }) });
    const combat = makeCombat({ combatants: [cmb] });

    installFoundry({ isGM: false, combat });
    expect(buildCombatantData(cmb, combat).showHp).toBe(true);
  });

  it("hides defeated combatants from players (but not the GM) when the setting is on", () => {
    const cmb = makeCombatant({ defeated: true, actor: makeActor() });
    const combat = makeCombat({ combatants: [cmb] });

    installFoundry({ isGM: false, combat, settings: { hideDefeatedCombatants: true } });
    expect(buildCombatantData(cmb, combat).hidden).toBe(true);

    installFoundry({ isGM: true, combat, settings: { hideDefeatedCombatants: true } });
    expect(buildCombatantData(cmb, combat).hidden).toBe(false);
  });

  it("flags death saving at 0 HP when not defeated", () => {
    const actor = makeActor({ hp: { value: 0, max: 10 } });
    const cmb = makeCombatant({ actor, defeated: false });
    const combat = makeCombat({ combatants: [cmb] });
    installFoundry({ isGM: true, combat });

    const data = buildCombatantData(cmb, combat);
    expect(data.isDeathSaving).toBe(true);
    expect(data.vitalityIcon?.kind).toBe("unconscious");
    expect(data.vitalityIcon?.icon).toBe("fa-dizzy");
    expect(data.showHp).toBe(false);
  });

  it("does not flag death saving when defeated or at full HP", () => {
    const down = makeActor({ hp: { value: 0, max: 10 } });
    const defeatedCmb = makeCombatant({ actor: down, defeated: true });
    const healthyCmb = makeCombatant({ actor: makeActor({ hp: { value: 8, max: 10 } }) });
    const combat = makeCombat({ combatants: [defeatedCmb, healthyCmb] });
    installFoundry({ isGM: true, combat });

    const defeatedData = buildCombatantData(defeatedCmb, combat);
    expect(defeatedData.isDeathSaving).toBe(false);
    expect(defeatedData.isDead).toBe(true);
    expect(defeatedData.markedDefeated).toBe(true);
    expect(defeatedData.vitalityIcon?.kind).toBe("dead");
    expect(defeatedData.showHp).toBe(false);

    const healthyData = buildCombatantData(healthyCmb, combat);
    expect(healthyData.isDeathSaving).toBe(false);
    expect(healthyData.vitalityIcon).toBeNull();
  });

  it("flags stabilized at 0 HP with three death save successes", () => {
    const actor = makeActor({ hp: { value: 0, max: 10 } });
    actor.system.attributes.death = { success: 3, failure: 0 };
    const cmb = makeCombatant({ actor, defeated: false });
    const combat = makeCombat({ combatants: [cmb] });
    installFoundry({ isGM: true, combat });

    const data = buildCombatantData(cmb, combat);
    expect(data.isStabilized).toBe(true);
    expect(data.isDeathSaving).toBe(false);
    expect(data.vitalityIcon?.kind).toBe("stabilized");
    expect(data.vitalityIcon?.icon).toBe("fa-bed");
  });

  it("renders an event combatant without HP and with rounds remaining", () => {
    const ev = makeCombatant({ event: true, duration: 4, roundCreated: 1, initiative: 20 });
    const combat = makeCombat({ round: 2, combatants: [ev] });
    installFoundry({ isGM: true, combat });

    const data = buildCombatantData(ev, combat);
    expect(data.isEvent).toBe(true);
    expect(data.showHp).toBe(false);
    expect(data.roundsLeft).toBe(3);
  });
});

describe("buildUnitData", () => {
  it("dispatches solo combatants to combatant data", () => {
    const cmb = makeCombatant({ id: "solo", actor: makeActor() });
    const combat = makeCombat({ combatants: [cmb] });
    installFoundry({ isGM: true, combat });

    const unit = { id: "solo", kind: "combatant", combatant: cmb, members: [cmb], memberIds: ["solo"] };
    const data = buildUnitData(unit, combat);
    expect(data.isGroup).toBe(false);
    expect(data.kind).toBe("combatant");
    expect(data.id).toBe("solo");
  });

  describe("group units", () => {
    function groupSetup({ isGM = true, settings = {}, defeated = [false, false], hidden = [false, false] } = {}) {
      const m1 = makeCombatant({ id: "m1", name: "Goblin A", initiative: 12, actor: makeActor(), defeated: defeated[0], hidden: hidden[0] });
      const m2 = makeCombatant({ id: "m2", name: "Goblin B", initiative: 12, actor: makeActor(), defeated: defeated[1], hidden: hidden[1] });
      const group = makeGroup({ id: "g1", name: "Goblins", members: [m1, m2] });
      const combat = makeCombat({ combatants: [m1, m2], groups: [group], active: m1 });
      installFoundry({ isGM, combat, settings });
      const unit = { id: "group:g1", kind: "group", group, members: [m1, m2], memberIds: ["m1", "m2"] };
      return { unit, combat, m1, m2 };
    }

    it("collapses members into one card with a visible count", () => {
      const { unit, combat } = groupSetup();
      const data = buildUnitData(unit, combat);
      expect(data).toMatchObject({
        isGroup: true,
        kind: "group",
        groupId: "g1",
        name: "Goblins",
        count: 2,
        initiative: 12,
        hasRolled: true,
        showHp: false
      });
    });

    it("is active when any member is the active combatant", () => {
      const { unit, combat } = groupSetup();
      expect(buildUnitData(unit, combat).isActive).toBe(true);
    });

    it("reports markedDefeated only when every member is defeated", () => {
      const partial = groupSetup({ defeated: [true, false] });
      expect(buildUnitData(partial.unit, partial.combat).markedDefeated).toBe(false);
      const all = groupSetup({ defeated: [true, true] });
      expect(buildUnitData(all.unit, all.combat).markedDefeated).toBe(true);
    });

    it("drops defeated members from the count for players when hide-defeated is on", () => {
      const { unit, combat } = groupSetup({ isGM: false, settings: { hideDefeatedCombatants: true }, defeated: [true, false] });
      const data = buildUnitData(unit, combat);
      expect(data.count).toBe(1);
      expect(data.hidden).toBe(false);
    });

    it("hides the whole group when no members remain visible", () => {
      const { unit, combat } = groupSetup({ isGM: false, settings: { hideDefeatedCombatants: true }, defeated: [true, true] });
      expect(buildUnitData(unit, combat).hidden).toBe(true);
    });

    it("is secret only when all members are hidden", () => {
      const { unit, combat } = groupSetup({ hidden: [true, true] });
      expect(buildUnitData(unit, combat).secret).toBe(true);
    });
  });
});
