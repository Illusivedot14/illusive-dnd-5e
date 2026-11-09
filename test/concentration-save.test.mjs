import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/application/combat-actions.mjs", () => ({
  challengeConcentrationAfterDamage: vi.fn(async () => ({
    checked: true,
    dropped: true,
    dc: 15,
    total: 8
  }))
}));

vi.mock("../src/application/effect-apply.mjs", () => ({
  applyActivityEffects: vi.fn(async () => [])
}));

vi.mock("../src/application/cover.mjs", () => {
  const cover = () => ({
    level: "none",
    acBonus: 0,
    dexSaveBonus: 0,
    canTarget: true,
    ambiguous: false
  });
  return {
    evaluate: cover,
    evaluateForCombat: async () => cover()
  };
});

vi.mock("../src/application/roll-modifiers.mjs", () => ({
  collectSaveModifiers: () => ({ advantage: false, disadvantage: false, reasons: [] }),
  evasionDamageFactor: () => null,
  consumeRollAdvantage: async () => {}
}));

import { resolveSaveActivity } from "../src/application/save-resolve.mjs";
import { challengeConcentrationAfterDamage } from "../src/application/combat-actions.mjs";

function makeWizard({ immune = [] } = {}) {
  const hp = { value: 40, max: 40, temp: 0 };
  return {
    uuid: "Actor.conc",
    name: "Wizard",
    system: {
      attributes: { hp },
      traits: { di: { value: new Set(immune) }, dr: { value: new Set() } }
    },
    rollSavingThrow: vi.fn(async () => [{ total: 5 }]),
    // Mirrors Actor5e.applyDamage: immunity is applied by the system, not Illusive.
    applyDamage: vi.fn(async (damages, { multiplier = 1 } = {}) => {
      const total = damages
        .filter((d) => !immune.includes(d.type))
        .reduce((sum, d) => sum + Math.floor(d.value * multiplier), 0);
      hp.value = Math.max(0, hp.value - total);
    })
  };
}

function setup(actor) {
  const token = { actor, name: "Wizard", document: { uuid: "Token.conc" }, uuid: "Token.conc" };
  globalThis.fromUuidSync = (uuid) => (uuid === "Token.conc" ? { object: token } : null);
  globalThis.canvas = { tokens: { placeables: [token] } };
}

const fireSave = () => ({
  type: "save",
  save: { ability: new Set(["dex"]), dc: { value: 15 } },
  damage: { onSave: "half" },
  rollDamage: vi.fn(async () => [{ total: 20, options: { type: "fire" } }])
});

describe("resolveSaveActivity concentration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("challenges concentration with the HP actually lost", async () => {
    const actor = makeWizard();
    setup(actor);

    const result = await resolveSaveActivity({
      activity: fireSave(),
      targetUuids: ["Token.conc"],
      originUuid: "Token.caster"
    });

    expect(actor.applyDamage).toHaveBeenCalled();
    expect(challengeConcentrationAfterDamage).toHaveBeenCalledWith(actor, 20);
    expect(result.applied.some((c) => c.concentrationDropped)).toBe(true);
    expect(result.applied.find((c) => c.type === "actor-hp")?.next?.value).toBe(20);
  });

  it("skips the concentration check when immunity prevents all damage", async () => {
    const actor = makeWizard({ immune: ["fire"] });
    setup(actor);

    await resolveSaveActivity({
      activity: fireSave(),
      targetUuids: ["Token.conc"],
      originUuid: "Token.caster"
    });

    expect(actor.applyDamage).toHaveBeenCalled();
    expect(challengeConcentrationAfterDamage).not.toHaveBeenCalled();
  });
});
