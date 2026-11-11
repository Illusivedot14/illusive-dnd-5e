import { describe, it, expect } from "vitest";
import { planMastery, planMasteryRule, weaponAbilityKey, abilityModifier } from "../src/domain/combat/mastery.mjs";
import { listAvailableHitRiders } from "../src/domain/combat/hit-riders.mjs";
import { freshBudget, spendUse } from "../src/domain/combat/turn-budget.mjs";

describe("planMastery", () => {
  it("graze only on miss", () => {
    expect(planMastery({ mastery: "graze", hit: false })).toMatchObject({
      key: "graze",
      effect: "abilityModDamage"
    });
    expect(planMastery({ mastery: "graze", hit: true })).toBe(null);
  });

  it("hit masteries require a hit", () => {
    expect(planMastery({ mastery: "vex", hit: true })?.effect).toBe("advantageNextAttackVsTarget");
    expect(planMastery({ mastery: "push", hit: false })).toBe(null);
    expect(planMastery({ mastery: "topple", hit: true })?.effect).toBe("conSaveOrProne");
    expect(planMastery({ mastery: "nick", hit: true })?.effect).toBe("lightAttackAsAttackAction");
  });

  it("ignores fumbles and unknown keys", () => {
    expect(planMastery({ mastery: "sap", hit: true, fumble: true })).toBe(null);
    expect(planMastery({ mastery: "nope", hit: true })).toBe(null);
  });

  it("a new mastery is a rule", () => {
    const plan = planMasteryRule({
      id: "hamstring",
      phase: "hit",
      effect: "steps",
      do: [{ step: "damage", value: 3 }, { step: "applyStatus", status: "prone" }]
    }, { hit: true });
    expect(plan).toMatchObject({ key: "hamstring", effect: "steps" });
    expect(plan.steps).toHaveLength(2);
  });
});

describe("weaponAbilityKey", () => {
  it("prefers finesse higher mod", () => {
    const actor = { system: { abilities: { str: { mod: 2 }, dex: { mod: 4 } } } };
    const item = { system: { properties: { has: (k) => k === "fin" } } };
    expect(weaponAbilityKey(item, actor)).toBe("dex");
    expect(abilityModifier(16)).toBe(3);
  });
});

describe("hit riders catalog", () => {
  it("finds smite and sneak by name/identifier", () => {
    const actor = {
      items: [
        { name: "Divine Smite", system: { identifier: "divine-smite", activities: { a: { type: "damage", id: "a" } } } },
        { name: "Sneak Attack", system: { identifier: "sneak-attack", activities: { s: { type: "damage", id: "s" } } } },
        { name: "Second Wind", system: { identifier: "second-wind", activities: {} } }
      ]
    };
    const riders = listAvailableHitRiders(actor);
    expect(riders.map((r) => r.id).sort()).toEqual(["divine-smite", "sneak-attack"]);
  });
});

describe("nick budget spend", () => {
  it("clears nickAvailable without debiting bonus", () => {
    const before = { ...freshBudget(), nickAvailable: true, bonus: 1 };
    const after = spendUse(before, {
      cost: "bonus",
      lightWeapon: true,
      weaponAttack: true
    });
    expect(after.nickAvailable).toBe(false);
    expect(after.bonus).toBe(1);
  });
});
