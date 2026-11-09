// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { installFoundry, makeActor, makeToken, makeCombat, makeCombatant } from "./helpers.mjs";
import {
  applyHealAmount,
  applyDamageAmount,
  clearDefeatedAfterHeal
} from "../src/hud/components/action-bar/action-bar-hp-adjust.mjs";
import { applyDamageDeathRules } from "../src/application/party-combat.mjs";

function makeDyingActor({ hp = 0, max = 20, temp = 0, failure = 0, success = 0 } = {}) {
  const actor = makeActor({
    isOwner: true,
    hp: { value: hp, max, temp },
    system: {
      attributes: {
        hp: { value: hp, max, temp },
        death: { success, failure },
        ac: { value: 15 },
        movement: { walk: 30 }
      }
    }
  });
  actor.update = vi.fn(async (data) => {
    for (const [key, value] of Object.entries(data)) {
      if (key === "system.attributes.death.failure") actor.system.attributes.death.failure = value;
      if (key === "system.attributes.death.success") actor.system.attributes.death.success = value;
      if (key === "system.attributes.hp.value") actor.system.attributes.hp.value = value;
    }
  });
  actor.toggleStatusEffect = vi.fn(async () => {});
  return actor;
}

describe("action-bar HP heal", () => {
  beforeEach(() => {
    installFoundry({ isGM: true });
  });

  it("heals the token actor via applyDamage(-amount)", async () => {
    const actor = makeActor({
      isOwner: true,
      hp: { value: 0, max: 40, temp: 0 }
    });
    actor.applyDamage = vi.fn(async (amount) => {
      const entry = Array.isArray(amount) ? amount[0] : null;
      const heal = entry?.type === "healing" ? Number(entry.value) : -Number(amount);
      actor.system.attributes.hp.value = Math.min(
        actor.system.attributes.hp.max,
        (Number(actor.system.attributes.hp.value) || 0) + heal
      );
    });

    await applyHealAmount(actor, 12);
    expect(actor.applyDamage).toHaveBeenCalledWith([{ value: 12, type: "healing" }]);
    expect(actor.system.attributes.hp.value).toBe(12);
  });

  it("coerces string amounts before calling applyDamage", async () => {
    const actor = makeActor({
      isOwner: true,
      hp: { value: 20, max: 40, temp: 0 }
    });
    actor.applyDamage = vi.fn(async () => {});

    await applyDamageAmount(actor, "7");
    expect(actor.applyDamage).toHaveBeenCalledWith([{ value: 7 }]);
  });

  it("falls back to a direct HP update when applyDamage is missing", async () => {
    const actor = makeActor({
      isOwner: true,
      hp: { value: 0, max: 25, temp: 0 }
    });
    actor.update = vi.fn(async (data) => {
      actor.system.attributes.hp.value = data["system.attributes.hp.value"];
    });

    await applyHealAmount(actor, 8);
    expect(actor.update).toHaveBeenCalledWith({ "system.attributes.hp.value": 8 });
  });

  it("clears defeated when HP is restored", async () => {
    const actor = makeDyingActor({ hp: 5, max: 20 });
    const token = makeToken({ id: "tok1", actor });
    const combatant = makeCombatant({
      id: "c1",
      token,
      actor,
      defeated: true
    });
    combatant.update = vi.fn(async (data) => {
      Object.assign(combatant, data);
    });
    const combat = makeCombat({ combatants: [combatant] });
    installFoundry({ isGM: true, combat, tokens: [token] });

    await clearDefeatedAfterHeal(actor, token);
    expect(actor.toggleStatusEffect).toHaveBeenCalledWith("dead", { active: false, overlay: true });
    expect(combatant.update).toHaveBeenCalledWith({ defeated: false });
  });
});

describe("HUD damage death rules", () => {
  beforeEach(() => {
    installFoundry({ isGM: true });
  });

  it("adds one death failure when damaging at 0 HP", async () => {
    const actor = makeDyingActor({ hp: 0, max: 20, failure: 0 });
    const token = makeToken({ id: "tok1", actor });

    const result = await applyDamageDeathRules(actor, token, 1, {
      value: 0,
      max: 20,
      temp: 0
    });

    expect(result).toBe("failure");
    expect(actor.update).toHaveBeenCalledWith({ "system.attributes.death.failure": 1 });
    expect(actor.toggleStatusEffect).not.toHaveBeenCalled();
  });

  it("does not add a failure when temp HP absorbs the hit at 0", async () => {
    const actor = makeDyingActor({ hp: 0, max: 20, temp: 5, failure: 1 });
    const token = makeToken({ id: "tok1", actor });

    const result = await applyDamageDeathRules(actor, token, 3, {
      value: 0,
      max: 20,
      temp: 5
    });

    expect(result).toBeNull();
    expect(actor.update).not.toHaveBeenCalled();
  });

  it("marks defeated on the third failure", async () => {
    const actor = makeDyingActor({ hp: 0, max: 20, failure: 2 });
    const token = makeToken({ id: "tok1", actor });
    const combatant = makeCombatant({ id: "c1", token, actor, defeated: false });
    combatant.update = vi.fn(async (data) => Object.assign(combatant, data));
    installFoundry({
      isGM: true,
      combat: makeCombat({ combatants: [combatant] }),
      tokens: [token]
    });

    const result = await applyDamageDeathRules(actor, token, 1, {
      value: 0,
      max: 20,
      temp: 0
    });

    expect(result).toBe("defeated");
    expect(actor.update).toHaveBeenCalledWith({ "system.attributes.death.failure": 3 });
    expect(actor.toggleStatusEffect).toHaveBeenCalledWith("dead", { active: true, overlay: true });
    expect(combatant.update).toHaveBeenCalledWith({ defeated: true });
  });

  it("instantly kills when leftover past 0 exceeds twice max HP", async () => {
    // Max 20, at 10 HP, take 55 → 45 past 0 → > 40 → instant death
    const actor = makeDyingActor({ hp: 10, max: 20, failure: 0 });
    const token = makeToken({ id: "tok1", actor });
    const combatant = makeCombatant({ id: "c1", token, actor, defeated: false });
    combatant.update = vi.fn(async (data) => Object.assign(combatant, data));
    installFoundry({
      isGM: true,
      combat: makeCombat({ combatants: [combatant] }),
      tokens: [token]
    });

    const result = await applyDamageDeathRules(actor, token, 55, {
      value: 10,
      max: 20,
      temp: 0
    });

    expect(result).toBe("instant");
    expect(actor.system.attributes.hp.value).toBe(0);
    expect(actor.system.attributes.death.failure).toBe(3);
    expect(actor.toggleStatusEffect).toHaveBeenCalledWith("dead", { active: true, overlay: true });
  });

  it("instantly kills at 0 HP when damage past 0 exceeds twice max", async () => {
    const actor = makeDyingActor({ hp: 0, max: 20, failure: 0 });
    const token = makeToken({ id: "tok1", actor });
    installFoundry({ isGM: true, tokens: [token] });

    const result = await applyDamageDeathRules(actor, token, 41, {
      value: 0,
      max: 20,
      temp: 0
    });

    expect(result).toBe("instant");
  });

  it("does not instantly kill when leftover past 0 is only twice max HP", async () => {
    // Max 20, at 5 HP, take 45 → 40 past 0 → not over 40
    const actor = makeDyingActor({ hp: 5, max: 20, failure: 0 });
    const token = makeToken({ id: "tok1", actor });

    const result = await applyDamageDeathRules(actor, token, 45, {
      value: 5,
      max: 20,
      temp: 0
    });

    expect(result).toBeNull();
  });
});
