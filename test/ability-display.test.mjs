import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { installFoundry, resetFoundry } from "./helpers.mjs";
import {
  formatAbilityRange,
  formatAbilityDamage,
  formatAbilityHit
} from "../src/application/ability-display.mjs";

describe("ability-display", () => {
  beforeEach(() => installFoundry());
  afterEach(() => resetFoundry());

  it("formats touch and foot ranges", () => {
    expect(formatAbilityRange(null, { range: { units: "touch" } })).toMatch(/touch/i);
    expect(formatAbilityRange(null, { range: { value: 60, units: "ft" } })).toBe("60 ft.");
    expect(formatAbilityRange(null, { range: { units: "self" } })).toBe("Self");
  });

  it("formats attack and save hit cells", () => {
    expect(formatAbilityHit({ labels: { toHit: "+7" } }, null)).toEqual({
      kind: "attack",
      text: "+7"
    });
    expect(formatAbilityHit(null, { save: { ability: "dex", dc: { value: 15 } } })).toEqual({
      kind: "save",
      ability: "DEX",
      dc: "15",
      text: "DEX 15"
    });
    expect(formatAbilityHit(null, { save: { ability: new Set(["con"]), dc: 18 } })).toEqual({
      kind: "save",
      ability: "CON",
      dc: "18",
      text: "CON 18"
    });
  });

  it("formats damage parts", () => {
    expect(formatAbilityDamage(null, {
      damage: { parts: [["1d8", "slashing"]] }
    })).toBe("1d8 slashing");
  });

  it("resolves @ tokens in damage formulas", () => {
    globalThis.Roll = {
      replaceFormulaData: (formula, data) => formula
        .replace("@mod", String(data.mod ?? 0))
        .replace("@abilities.str.mod", String(data.abilities?.str?.mod ?? 0))
    };

    expect(formatAbilityDamage(
      { getRollData: () => ({ mod: 3, abilities: { str: { mod: 4 } } }) },
      { damage: { parts: [["1d6 + @mod", "slashing"]] } }
    )).toBe("1d6 + 3 slashing");

    expect(formatAbilityDamage(
      { getRollData: () => ({ abilities: { str: { mod: 4 } } }) },
      { damage: { parts: [["1 + @abilities.str.mod"]] } }
    )).toBe("1 + 4");

    expect(formatAbilityDamage(null, {
      labels: { damages: [{ label: "2d6 + 4 bludgeoning", formula: "2d6 + @mod" }] }
    })).toBe("2d6 + 4 bludgeoning");
  });
});
