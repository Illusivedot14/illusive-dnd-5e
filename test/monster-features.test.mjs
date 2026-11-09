import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { installFoundry, makeActor, makeCollection, resetFoundry } from "./helpers.mjs";
import {
  isMonsterFeatureItem,
  defaultActivationForMonsterActivity,
  monsterSpecialShowsUnderAction
} from "../src/domain/combat/monster-features.mjs";
import { getAbilitiesForTypes, buildCombatToolbarSections } from "../src/application/action-data.mjs";

function makeActivities(entries) {
  const arr = [...entries];
  arr.get = (id) => arr.find((entry) => entry.id === id) ?? null;
  arr.contents = arr;
  arr.size = arr.length;
  return arr;
}

describe("monster-features domain", () => {
  it("detects monster feats and natural weapons", () => {
    expect(isMonsterFeatureItem({
      type: "feat",
      system: { type: { value: "monster" } }
    })).toBe(true);
    expect(isMonsterFeatureItem({
      type: "weapon",
      system: { type: { value: "natural" } }
    })).toBe(true);
    expect(isMonsterFeatureItem({
      type: "feat",
      system: { type: { value: "class" } }
    })).toBe(false);
  });

  it("defaults blank activations for combat activities to action", () => {
    expect(defaultActivationForMonsterActivity(
      { type: "weapon", system: { type: { value: "natural" } } },
      { type: "attack" }
    )).toBe("action");
    expect(defaultActivationForMonsterActivity(
      { type: "feat", system: { type: { value: "monster" } } },
      { type: "save" }
    )).toBe("action");
    expect(defaultActivationForMonsterActivity(
      { type: "feat", system: { type: { value: "monster" } } },
      { type: "utility" }
    )).toBe("special");
  });

  it("flags monster specials for the Action gem", () => {
    expect(monsterSpecialShowsUnderAction(
      { type: "feat", system: { type: { value: "monster" } } },
      "special"
    )).toBe(true);
    expect(monsterSpecialShowsUnderAction(
      { type: "feat", system: { type: { value: "monster" } } },
      "action"
    )).toBe(false);
  });
});

describe("NPC monster features on the action bar", () => {
  beforeEach(() => installFoundry());
  afterEach(() => resetFoundry());

  it("lists blank-activation natural attacks under Action", () => {
    const actor = makeActor({
      type: "npc",
      items: [{
        id: "bite1",
        name: "Bite",
        type: "weapon",
        img: "bite.png",
        system: {
          type: { value: "natural" },
          activities: makeActivities([{
            id: "atk",
            type: "attack",
            name: "",
            activation: { type: "" },
            canUse: true
          }])
        }
      }]
    });

    const abilities = getAbilitiesForTypes(actor, ["action"], "action", { inCombat: true });
    expect(abilities.some((a) => a.name === "Bite")).toBe(true);
  });

  it("lists monster specials under Action for NPCs, not only suitcase", () => {
    const actor = makeActor({
      type: "npc",
      items: [{
        id: "burst1",
        name: "Death Burst",
        type: "feat",
        img: "burst.png",
        system: {
          type: { value: "monster" },
          activities: makeActivities([{
            id: "save1",
            type: "save",
            name: "",
            activation: { type: "special" },
            canUse: true
          }])
        }
      }]
    });

    const action = getAbilitiesForTypes(actor, ["action"], "action", { inCombat: true });
    expect(action.some((a) => a.name === "Death Burst")).toBe(true);
  });

  it("exposes lair section when the creature has lair resources", () => {
    const actor = makeActor({
      type: "npc",
      resources: { lair: { value: 1, max: 1 } },
      items: [{
        id: "lair1",
        name: "Lair Tremor",
        type: "feat",
        system: {
          type: { value: "monster" },
          activities: makeActivities([{
            id: "save1",
            type: "save",
            activation: { type: "lair" },
            canUse: true
          }])
        }
      }]
    });
    // makeActor may nest resources under system — mirror dnd5e shape
    actor.system = actor.system ?? {};
    actor.system.resources = { lair: { value: 1, max: 1 } };

    const sections = buildCombatToolbarSections(actor, { inCombat: true });
    expect(sections.some((s) => s.id === "lair")).toBe(true);
    const lair = sections.find((s) => s.id === "lair");
    expect(lair.abilities.some((a) => a.name === "Lair Tremor")).toBe(true);
  });
});
