import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { installFoundry, makeActor, makeCollection, resetFoundry } from "./helpers.mjs";
import { getAbilitiesForTypes, shortAbilityLabel } from "../src/application/action-data.mjs";

function makeActivities(entries) {
  const arr = [...entries];
  arr.get = (id) => arr.find((entry) => entry.id === id) ?? null;
  arr.contents = arr;
  arr.size = arr.length;
  return arr;
}

describe("getAbilitiesForTypes spell collection", () => {
  beforeEach(() => installFoundry());
  afterEach(() => resetFoundry());

  it("lists spell items when activity activation is empty but item activation is action", () => {
    const fireball = {
      id: "spell1",
      name: "Fireball",
      img: "fireball.png",
      type: "spell",
      system: {
        level: 3,
        activation: { type: "action" },
        target: { affects: { type: "creature" } },
        activities: makeActivities([{
          id: "save1",
          type: "save",
          name: "Save",
          activation: { type: "" },
          canUse: true,
          target: { affects: { type: "creature" } }
        }])
      }
    };

    const actor = makeActor({ items: [fireball] });
    const abilities = getAbilitiesForTypes(actor, ["action"], "action", { inCombat: true });

    expect(abilities).toHaveLength(1);
    expect(abilities[0].name).toBe("Fireball");
    expect(abilities[0].activityId).toBe("save1");
    expect(abilities[0].img).toBe("fireball.png");
  });

  it("lists innate cast activities from a feature when activation comes from the linked spell", () => {
    const linkedSpell = {
      type: "spell",
      system: {
        activation: { type: "action" },
        level: 1,
        target: { affects: { type: "creature" } },
        activities: makeActivities([{
          id: "spell-save",
          type: "save",
          canUse: true,
          target: { affects: { type: "creature" } }
        }])
      }
    };

    globalThis.foundry = {
      utils: {
        fromUuidSync: () => linkedSpell
      }
    };

    const actor = makeActor({
      spells: { spell1: { value: 4, max: 4 } },
      items: [{
        id: "feat1",
        name: "Spellcasting",
        img: "spellcasting.png",
        type: "feat",
        system: {
          activities: makeActivities([{
            id: "cast1",
            type: "cast",
            name: "Magic Missile",
            img: "magic-missile.png",
            activation: { type: "" },
            canUse: true,
            spell: { uuid: "Compendium.dnd5e.spells.Item.magicMissile", level: 1 },
            target: { override: false }
          }])
        }
      }]
    });

    const abilities = getAbilitiesForTypes(actor, ["action"], "action", { inCombat: true });

    expect(abilities).toHaveLength(1);
    expect(abilities[0].name).toBe("Magic Missile");
    expect(abilities[0].activityId).toBe("cast1");
    expect(abilities[0].img).toBe("magic-missile.png");
  });

  it("still lists activities that report canUse false, but marks them disabled", () => {
    const actor = makeActor({
      items: [{
        id: "spell1",
        name: "Shield",
        img: "shield.png",
        type: "spell",
        system: {
          level: 1,
          activation: { type: "reaction" },
          activities: makeActivities([{
            id: "save1",
            type: "save",
            activation: { type: "reaction" },
            canUse: false
          }])
        }
      }]
    });

    const abilities = getAbilitiesForTypes(actor, ["reaction"], "reaction", { inCombat: true });

    expect(abilities).toHaveLength(1);
    expect(abilities[0].disabled).toBe(true);
  });

  it("collapses multi-activity spells to a single action button", () => {
    const actor = makeActor({
      items: [{
        id: "spell1",
        name: "Fireball",
        img: "fireball.png",
        type: "spell",
        system: {
          level: 3,
          activation: { type: "action" },
          activities: makeActivities([
            { id: "save1", type: "save", activation: { type: "action" }, canUse: true },
            { id: "dmg1", type: "damage", activation: { type: "action" }, canUse: true },
            { id: "util1", type: "utility", activation: { type: "action" }, canUse: true }
          ])
        }
      }]
    });

    const abilities = getAbilitiesForTypes(actor, ["action"], "action");
    expect(abilities).toHaveLength(1);
    expect(abilities[0].activityId).toBe("save1");
  });

  it("skips cached spell copies created by cast activities", () => {
    const actor = makeActor({
      items: [
        {
          id: "feat1",
          name: "Spellcasting",
          type: "feat",
          system: {
            activities: makeActivities([{
              id: "cast1",
              type: "cast",
              name: "Fireball",
              img: "fireball.png",
              activation: { type: "action" },
              canUse: true,
              spell: { uuid: "Compendium.dnd5e.spells.Item.fireball", level: 3 }
            }])
          }
        },
        {
          id: "cached1",
          name: "Fireball",
          img: "fireball.png",
          type: "spell",
          flags: { dnd5e: { cachedFor: ".Item.feat1.Activity.cast1" } },
          system: {
            level: 3,
            activation: { type: "action" },
            activities: makeActivities([
              { id: "save1", type: "save", activation: { type: "action" }, canUse: true },
              { id: "dmg1", type: "damage", activation: { type: "action" }, canUse: true }
            ])
          }
        }
      ]
    });

    const abilities = getAbilitiesForTypes(actor, ["action"], "action");
    expect(abilities).toHaveLength(1);
    expect(abilities[0].itemId).toBe("feat1");
    expect(abilities[0].activityId).toBe("cast1");
  });

  it("shows only the attack activity when a weapon also has rider damage", () => {
    const actor = makeActor({
      items: [{
        id: "sword1",
        name: "Longsword",
        img: "sword.png",
        type: "weapon",
        system: {
          activation: { type: "action" },
          activities: makeActivities([
            { id: "atk1", type: "attack", activation: { type: "action" }, canUse: true },
            { id: "dmg1", type: "damage", activation: { type: "action" }, isRider: true, canUse: true }
          ])
        }
      }]
    });

    const abilities = getAbilitiesForTypes(actor, ["action"], "action");
    expect(abilities).toHaveLength(1);
    expect(abilities[0].activityId).toBe("atk1");
  });

  it("uses item name and icon instead of generic Attack activity defaults", () => {
    const actor = makeActor({
      items: [{
        id: "sword1",
        name: "Flame Tongue",
        img: "icons/weapons/swords/flame-tongue.webp",
        type: "weapon",
        system: {
          activation: { type: "action" },
          activities: makeActivities([{
            id: "atk1",
            type: "attack",
            name: "Attack",
            img: "systems/dnd5e/icons/svg/activity/attack.svg",
            _source: { name: "", img: "" },
            metadata: {
              title: "DND5E.ATTACK.Title.one",
              img: "systems/dnd5e/icons/svg/activity/attack.svg"
            },
            activation: { type: "action" },
            canUse: true
          }])
        }
      }]
    });

    const abilities = getAbilitiesForTypes(actor, ["action"], "action");
    expect(abilities).toHaveLength(1);
    expect(abilities[0].name).toBe("Flame Tongue");
    expect(abilities[0].img).toBe("icons/weapons/swords/flame-tongue.webp");
  });

  it("keeps custom activity names and art", () => {
    const actor = makeActor({
      items: [{
        id: "claws1",
        name: "Claws",
        img: "claws.png",
        type: "weapon",
        system: {
          activation: { type: "action" },
          activities: makeActivities([{
            id: "rend1",
            type: "attack",
            name: "Rend",
            img: "rend.png",
            _source: { name: "Rend", img: "rend.png" },
            activation: { type: "action" },
            canUse: true
          }])
        }
      }]
    });

    const abilities = getAbilitiesForTypes(actor, ["action"], "action");
    expect(abilities).toHaveLength(1);
    expect(abilities[0].name).toBe("Claws: Rend");
    expect(abilities[0].img).toBe("rend.png");
  });
});

describe("shortAbilityLabel", () => {
  it("shortens weapon names and activity labels", () => {
    expect(shortAbilityLabel("Crossbow, Light")).toBe("Crossbow");
    expect(shortAbilityLabel("Unarmed Strike")).toBe("Unarmed");
    expect(shortAbilityLabel("Longsword: Attack")).toBe("Longsword");
    expect(shortAbilityLabel("Longsword: Attack")).toBe("Longsword");
    expect(shortAbilityLabel("Claws: Rend")).toBe("Rend");
  });

  it("truncates very long names", () => {
    expect(shortAbilityLabel("Extraordinary Magical Blade of Destiny", { max: 16 })).toBe("Extraordinary M…");
  });
});
