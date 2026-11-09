import { describe, it, expect, vi, beforeEach } from "vitest";

const windowScript = new Map();
vi.mock("../src/application/reactions/window.mjs", async (importOriginal) => {
  const actual = await importOriginal();
  const { mergePatches } = await import("../src/application/reactions/registry.mjs");
  return {
    ...actual,
    openReactionWindow: vi.fn(async ({ windowId }) => mergePatches(windowScript.get(windowId) ?? []))
  };
});
vi.mock("../src/foundry/dnd5e-adapter.mjs", async (importOriginal) => ({
  ...(await importOriginal()),
  useActivity: vi.fn(async () => ({ updates: { actor: { "system.spells.spell3.value": 1 } } }))
}));
vi.mock("../src/application/cover.mjs", () => ({
  evaluate: () => ({ level: "none", acBonus: 0, canTarget: true }),
  evaluateForCombat: async () => ({ level: "none", acBonus: 0, canTarget: true })
}));
vi.mock("../src/application/range.mjs", () => ({ checkAbilityRange: () => ({ result: "normal", inRange: true }) }));
vi.mock("../src/application/roll-modifiers.mjs", () => ({
  collectAttackModifiers: () => ({ advantage: false, disadvantage: false, reasons: [], attackBonus: 0, damageBonus: 0 }),
  rageDamageBonus: () => 2,
  collectAbilityCheckModifiers: () => ({ advantage: false, disadvantage: false, reasons: [] }),
  consumeHelpAdvantage: async () => false,
  consumeRollAdvantage: async () => {},
  targetHasCastersMark: () => true
}));
vi.mock("../src/application/hit-riders.mjs", () => ({
  offerHitRiders: vi.fn(async ({ hitUuids }) => [{
    rider: "divine-smite",
    targetUuids: hitUuids,
    rolls: [{ total: 9, options: { type: "radiant" } }]
  }])
}));
vi.mock("../src/application/feature-toggles.mjs", () => ({
  listPassiveHitRiders: () => [],
  wasPassiveRiderUsed: () => false,
  markPassiveRiderUsed: async () => {},
  hasRecklessAttack: () => false
}));
vi.mock("../src/application/mastery.mjs", () => ({
  applyWeaponMastery: async () => [],
  consumeVexAdvantage: () => false,
  consumeSapDisadvantage: () => false
}));
vi.mock("../src/application/special-duration.mjs", () => ({
  expireOnAttack: async () => {},
  expireOnAttacked: async () => {},
  expireOnDamaged: async () => {}
}));
vi.mock("../src/application/effect-apply.mjs", () => ({ applyActivityEffects: async () => [] }));
vi.mock("../src/application/action-economy.mjs", () => ({
  isTokenInCombat: () => false,
  spendLegendaryAction: async () => {},
  spendLairAction: async () => {}
}));
vi.mock("../src/application/combat-actions.mjs", () => ({
  challengeConcentrationAfterDamage: async () => null
}));

import { resolveActivity } from "../src/application/resolve-activity.mjs";

function d20(total, face = 10) {
  return { total, d20: { results: [{ result: face }] }, options: {} };
}

function setup({ attackRolls, ac = 15 }) {
  const hp = { value: 50, max: 50, temp: 0 };
  const defender = {
    uuid: "Actor.orc",
    name: "Orc",
    system: { attributes: { hp, ac: { value: ac } }, traits: {} },
    applyDamage: vi.fn(async (damages) => {
      hp.value -= damages.reduce((s, d) => s + d.value, 0);
    })
  };
  const target = { actor: defender, name: "Orc", document: { uuid: "Token.orc" } };
  const attacker = { uuid: "Actor.pal", name: "Paladin", system: {}, update: vi.fn(async () => {}) };
  const token = { actor: attacker, document: { uuid: "Token.pal" } };
  globalThis.canvas = { tokens: { placeables: [token, target] } };
  globalThis.fromUuidSync = (uuid) => (uuid === "Token.orc" ? { object: target } : null);
  const rolls = [...attackRolls];
  const activity = {
    id: "atk",
    type: "attack",
    rollAttack: vi.fn(async () => [rolls.shift()]),
    rollDamage: vi.fn(async () => [{ total: 8, options: { type: "slashing" } }])
  };
  const item = { type: "weapon", name: "Longsword", system: { actionType: "mwak" } };
  return { token, item, activity, defender, hp, attacker };
}

describe("attack pipeline", () => {
  beforeEach(() => {
    windowScript.clear();
  });

  it("writes weapon, rider, and rage damage in one HP change per target", async () => {
    const { token, item, activity, defender, hp } = setup({ attackRolls: [d20(20)] });
    const result = await resolveActivity({
      token, item, activity, useOptions: { targetUuids: ["Token.orc"] }, resolutionId: "r1"
    });

    expect(defender.applyDamage).toHaveBeenCalledTimes(1);
    const sent = defender.applyDamage.mock.calls[0][0];
    expect(sent.map((d) => [d.type, d.value])).toEqual([
      ["slashing", 8],
      ["radiant", 9],
      ["slashing", 2]
    ]);
    expect(hp.value).toBe(31);
    expect(result.applied.filter((c) => c.type === "actor-hp")).toHaveLength(1);
  });

  it("Silvery Barbs keeps the lower reroll and can turn a hit into a miss", async () => {
    windowScript.set("on-attack-hit", [{ type: "rerollAttack", keep: "lower", source: "silvery-barbs" }]);
    const { token, item, activity, defender } = setup({ attackRolls: [d20(19), d20(7)] });
    const result = await resolveActivity({
      token, item, activity, useOptions: { targetUuids: ["Token.orc"] }, resolutionId: "r2"
    });
    expect(activity.rollAttack).toHaveBeenCalledTimes(2);
    expect(result.hitUuids).toEqual([]);
    expect(defender.applyDamage).not.toHaveBeenCalled();
  });

  it("Silvery Barbs never raises the roll", async () => {
    windowScript.set("on-attack-hit", [{ type: "rerollAttack", keep: "lower", source: "silvery-barbs" }]);
    const { token, item, activity } = setup({ attackRolls: [d20(16), d20(24)] });
    const result = await resolveActivity({
      token, item, activity, useOptions: { targetUuids: ["Token.orc"] }, resolutionId: "r3"
    });
    expect(result.attackRolls[0].total).toBe(16);
    expect(result.hitUuids).toEqual(["Token.orc"]);
  });

  it("Cutting Words subtracts from the attack but a natural 20 still hits", async () => {
    windowScript.set("on-attack-hit", [{ type: "attackPenalty", value: 6, source: "cutting-words" }]);
    const miss = setup({ attackRolls: [d20(17)] });
    const r1 = await resolveActivity({
      token: miss.token, item: miss.item, activity: miss.activity,
      useOptions: { targetUuids: ["Token.orc"] }, resolutionId: "r4"
    });
    expect(r1.hitUuids).toEqual([]);

    const crit = setup({ attackRolls: [d20(22, 20)] });
    const r2 = await resolveActivity({
      token: crit.token, item: crit.item, activity: crit.activity,
      useOptions: { targetUuids: ["Token.orc"] }, resolutionId: "r5"
    });
    expect(r2.hitUuids).toEqual(["Token.orc"]);
  });

  it("Shield raises AC for the hit but cannot stop a critical", async () => {
    windowScript.set("on-attack-hit", [{ type: "acBonus", targetUuid: "Token.orc", value: 5, source: "shield" }]);
    const normal = setup({ attackRolls: [d20(17)] });
    const r1 = await resolveActivity({
      token: normal.token, item: normal.item, activity: normal.activity,
      useOptions: { targetUuids: ["Token.orc"] }, resolutionId: "r6"
    });
    expect(r1.outcomes[0]).toMatchObject({ hit: false, reason: "shield-ac" });

    const crit = setup({ attackRolls: [d20(21, 20)] });
    const r2 = await resolveActivity({
      token: crit.token, item: crit.item, activity: crit.activity,
      useOptions: { targetUuids: ["Token.orc"] }, resolutionId: "r7"
    });
    expect(r2.hitUuids).toEqual(["Token.orc"]);
  });

  it("Uncanny Dodge halves the whole hit, riders included", async () => {
    windowScript.set("on-damage-known", [{ type: "damageMultiplier", targetUuid: "Token.orc", value: 0.5, source: "uncanny-dodge" }]);
    const { token, item, activity, defender } = setup({ attackRolls: [d20(20)] });
    await resolveActivity({ token, item, activity, useOptions: { targetUuids: ["Token.orc"] }, resolutionId: "r8" });
    expect(defender.applyDamage.mock.calls[0][1]).toMatchObject({ multiplier: 0.5 });
  });

  it("Counterspell (2024) stops the spell and refunds the slot", async () => {
    windowScript.set("on-cast", [{ type: "cancelCast", refundSlot: true, source: "counterspell" }]);
    const { token, activity, attacker } = setup({ attackRolls: [d20(20)] });
    attacker.system = { spells: { spell3: { value: 1, max: 3 } } };
    const spell = { type: "spell", name: "Fireball", system: { level: 3 } };
    const result = await resolveActivity({
      token, item: spell, activity, useOptions: { targetUuids: ["Token.orc"] }, resolutionId: "r9"
    });
    expect(result.countered).toBe(true);
    expect(result.cancelled).toBeUndefined();
    expect(activity.rollAttack).not.toHaveBeenCalled();
    expect(attacker.update).toHaveBeenCalledWith({ "system.spells.spell3.value": 2 });
  });

  it("Counterspell refunds only the slot through dnd5e consumption deltas", async () => {
    const { useActivity } = await import("../src/foundry/dnd5e-adapter.mjs");
    useActivity.mockResolvedValueOnce({
      updates: { actor: { "system.spells.spell3.value": 1 } },
      message: { system: { deltas: { actor: [
        { keyPath: "system.spells.spell3.value", delta: -1 },
        { keyPath: "system.resources.primary.value", delta: -1 }
      ] } } }
    });
    windowScript.set("on-cast", [{ type: "cancelCast", refundSlot: true, source: "counterspell" }]);
    const { token, activity, attacker } = setup({ attackRolls: [d20(20)] });
    activity.refund = vi.fn(async () => {});
    const spell = { type: "spell", name: "Fireball", system: { level: 3 } };
    const result = await resolveActivity({
      token, item: spell, activity, useOptions: { targetUuids: ["Token.orc"] }, resolutionId: "r10"
    });
    expect(result.slotRefunded).toBe(true);
    expect(activity.refund).toHaveBeenCalledWith({
      actor: [{ keyPath: "system.spells.spell3.value", delta: -1 }],
      item: {}
    });
    expect(attacker.update).not.toHaveBeenCalled();
  });

  it("treats an undefined dnd5e use() result as a dismissed use", async () => {
    const { useActivity } = await import("../src/foundry/dnd5e-adapter.mjs");
    useActivity.mockResolvedValueOnce(undefined);
    const { token, item, activity, defender } = setup({ attackRolls: [d20(20)] });
    const result = await resolveActivity({
      token, item, activity, useOptions: { targetUuids: ["Token.orc"] }, resolutionId: "r11"
    });
    expect(result.cancelled).toBe(true);
    expect(activity.rollAttack).not.toHaveBeenCalled();
    expect(defender.applyDamage).not.toHaveBeenCalled();
  });
});
