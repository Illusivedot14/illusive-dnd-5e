import { describe, it, expect } from "vitest";
import {
  findAuraFeatures,
  resolveAuraFeet,
  auraSaveBonus,
  isIncapacitated,
  AURA_CATALOG,
  readDeclaredAura,
  declaredAuraReaches,
  resolveSourceFormula
} from "../src/domain/combat/aura-effects.mjs";
import {
  collectAttackModifiers,
  collectAbilityCheckModifiers,
  collectSaveModifiers,
  evasionDamageFactor,
  hexAbilityDisadvantage,
  targetHasCastersMark
} from "../src/application/roll-modifiers.mjs";

describe("aura catalog", () => {
  it("finds Aura of Protection on an actor", () => {
    const actor = {
      items: [{ name: "Aura of Protection", system: { identifier: "aura-of-protection" } }],
      system: { abilities: { cha: { mod: 3 } }, details: { level: 5 } }
    };
    const found = findAuraFeatures(actor);
    expect(found).toHaveLength(1);
    expect(found[0].spec.id).toBe("aura-of-protection");
    expect(auraSaveBonus(actor, found[0].spec)).toBe(3);
    expect(resolveAuraFeet(actor, found[0].spec)).toBe(10);
  });

  it("blocks when incapacitated", () => {
    expect(isIncapacitated({ statuses: new Set(["incapacitated"]) })).toBe(true);
    expect(AURA_CATALOG.length).toBeGreaterThanOrEqual(3);
  });
});

describe("declared auras", () => {
  const passWithoutTrace = {
    flags: {
      "illusive-dnd-5e": {
        aura: {
          radius: "30",
          disposition: "ally",
          applyToSelf: true,
          changes: [{ key: "system.skills.ste.bonuses.check", type: "add", value: "+10" }]
        }
      }
    }
  };

  it("reads an aura declared on an effect", () => {
    const aura = readDeclaredAura(passWithoutTrace);
    expect(aura).toMatchObject({ radius: "30", disposition: "ally", applyToSelf: true, combatOnly: false });
    expect(aura.changes).toHaveLength(1);
    expect(readDeclaredAura({ flags: {} })).toBe(null);
    expect(readDeclaredAura({ flags: { "illusive-dnd-5e": { aura: { radius: "" } } } })).toBe(null);
  });

  it("reaches tokens by disposition and self", () => {
    const ally = readDeclaredAura(passWithoutTrace);
    expect(declaredAuraReaches(ally, { isSelf: true, friendly: true })).toBe(true);
    expect(declaredAuraReaches(ally, { isSelf: false, friendly: true })).toBe(true);
    expect(declaredAuraReaches(ally, { isSelf: false, friendly: false })).toBe(false);
    const enemy = { disposition: "enemy", applyToSelf: false };
    expect(declaredAuraReaches(enemy, { isSelf: true, friendly: true })).toBe(false);
    expect(declaredAuraReaches(enemy, { isSelf: false, friendly: false })).toBe(true);
    const any = { disposition: "any", applyToSelf: false };
    expect(declaredAuraReaches(any, { isSelf: false, friendly: true })).toBe(true);
  });

  it("resolves formulas against the source's roll data", () => {
    const rollData = { flags: { dnd5e: { summon: { level: 3 } } }, attributes: { spell: { dc: 15 } }, prof: 2 };
    expect(resolveSourceFormula("(@flags.dnd5e.summon.level)d10", rollData)).toBe("(3)d10");
    expect(resolveSourceFormula("@attributes.spell.dc", rollData)).toBe("15");
    expect(resolveSourceFormula("@missing.path", rollData)).toBe("@missing.path");
    expect(resolveSourceFormula(5, rollData)).toBe(5);
  });
});

describe("roll modifiers", () => {
  it("gives disadvantage when poisoned via hasConditionEffect", () => {
    const attacker = { hasConditionEffect: (k) => k === "attackDisadvantage", statuses: new Set() };
    const mods = collectAttackModifiers({ attacker });
    expect(mods.disadvantage).toBe(true);
  });

  it("gives melee advantage vs prone", () => {
    const mods = collectAttackModifiers({
      attacker: { statuses: new Set() },
      defender: { statuses: new Set(["prone"]) },
      item: { system: { actionType: "mwak" } }
    });
    expect(mods.advantage).toBe(true);
  });

  it("evasion zeros damage on success", () => {
    const actor = { items: [{ name: "Evasion", system: { identifier: "evasion" } }] };
    expect(evasionDamageFactor(actor, { ability: "dex", success: true })).toBe(0);
    expect(evasionDamageFactor(actor, { ability: "dex", success: false })).toBe(0.5);
    expect(evasionDamageFactor(actor, { ability: "wis", success: true })).toBe(null);
  });

  it("detects marked targets for Hex/HM", () => {
    const attacker = { uuid: "Actor.1", id: "1" };
    const defender = {
      statuses: new Set(["marked"]),
      effects: [{ statuses: new Set(["marked"]), origin: "Actor.1.Item.x" }]
    };
    expect(targetHasCastersMark(attacker, defender)).toBe(true);
  });

  it("applies Hex ability-check disadvantage from Hexed Strength", () => {
    const actor = {
      effects: [{
        name: "Hexed Strength",
        statuses: new Set(["cursed"]),
        system: { changes: [{ key: "system.abilities.str.check.roll.mode", value: -1 }] }
      }]
    };
    expect(hexAbilityDisadvantage(actor, "str")).toBe(true);
    expect(hexAbilityDisadvantage(actor, "dex")).toBe(false);
    const mods = collectAbilityCheckModifiers({ actor, ability: "str" });
    expect(mods.disadvantage).toBe(true);
    expect(mods.reasons).toContain("hex-str");
  });

  it("applies restrained Dex save disadvantage", () => {
    const actor = {
      hasConditionEffect: (k) => k === "dexteritySaveDisadvantage",
      statuses: new Set(["restrained"])
    };
    expect(collectSaveModifiers({ actor, ability: "dex" }).disadvantage).toBe(true);
    expect(collectSaveModifiers({ actor, ability: "wis" }).disadvantage).toBe(false);
  });
});
