import { describe, it, expect, beforeEach, vi } from "vitest";
import { evaluateAttackVsAc, evaluateAttackTargets } from "../src/domain/combat/attack-outcome.mjs";
import {
  resolveActivity,
  readAttackCritical,
  readAttackFumble
} from "../src/application/resolve-activity.mjs";
import { installFoundry, makeToken, makeCombat, makeCombatant } from "./helpers.mjs";
import { _resetCombatMemory, startHudAction, getLastResolutionView } from "../src/application/combat.mjs";

describe("attack outcome domain", () => {
  it("hits when total meets AC", () => {
    expect(evaluateAttackVsAc({ attackTotal: 15, ac: 14 }).hit).toBe(true);
    expect(evaluateAttackVsAc({ attackTotal: 13, ac: 14 }).hit).toBe(false);
  });

  it("crits always hit and fumbles always miss", () => {
    expect(evaluateAttackVsAc({ attackTotal: 1, ac: 30, isCritical: true })).toMatchObject({
      hit: true,
      critical: true
    });
    expect(evaluateAttackVsAc({ attackTotal: 30, ac: 10, isFumble: true })).toMatchObject({
      hit: false,
      fumble: true
    });
  });

  it("evaluates a target list", () => {
    const outcomes = evaluateAttackTargets(
      [{ uuid: "T1", ac: 12 }, { uuid: "T2", ac: 20 }],
      { attackTotal: 15 }
    );
    expect(outcomes.map((o) => o.hit)).toEqual([true, false]);
  });
});

describe("critical detection", () => {
  it("reads crit/fumble from roll flags and natural faces", () => {
    expect(readAttackCritical({ isCritical: true })).toBe(true);
    expect(readAttackFumble({ isFumble: true })).toBe(true);
    expect(readAttackCritical({
      dice: [{ faces: 20, results: [{ result: 20 }] }]
    })).toBe(true);
    expect(readAttackCritical({
      dice: [{ faces: 20, results: [{ result: 19 }] }]
    }, { criticalThreshold: 19 })).toBe(true);
    expect(readAttackCritical({
      dice: [{ faces: 20, results: [{ result: 18 }] }]
    })).toBe(false);
    expect(readAttackFumble({
      dice: [{ faces: 20, results: [{ result: 1 }] }]
    })).toBe(true);
  });
});

describe("resolveActivity", () => {
  beforeEach(() => {
    installFoundry();
    CONFIG.DND5E = { damageTypes: { slashing: {} }, healingTypes: {} };
    _resetCombatMemory();
  });

  it("auto-rolls critical damage without the Normal/Critical dialog", async () => {
    const applyDamage = vi.fn(async function apply() {
      this.system.attributes.hp.value -= 14;
      return this;
    });
    const targetActor = {
      uuid: "Actor.gob",
      system: { attributes: { ac: { value: 10 }, hp: { value: 20, temp: 0, tempmax: 0 } } },
      applyDamage
    };
    const target = makeToken({ id: "g1" });
    target.document.uuid = "Scene.1.Token.g1";
    target.actor = targetActor;
    target.document.object = target;
    canvas.tokens.placeables = [target];
    globalThis.fromUuidSync = (uuid) => (uuid === target.document.uuid ? target.document : null);

    const rollDamage = vi.fn(async (config, dialog) => {
      expect(config.isCritical).toBe(true);
      expect(dialog.configure).toBe(false);
      expect(dialog.options.defaultButton).toBe("critical");
      return [{ total: 14, options: { type: "slashing", isCritical: true } }];
    });

    const activity = {
      id: "atk",
      type: "attack",
      use: async () => ({}),
      rollAttack: async () => [{
        total: 25,
        isCritical: true,
        isFumble: false,
        dice: [{ faces: 20, results: [{ result: 20 }] }]
      }],
      rollDamage
    };

    const resolved = await resolveActivity({
      token: { actor: { uuid: "Actor.1", setFlag: vi.fn(async () => ({})) } },
      item: { name: "Greataxe", type: "weapon" },
      activity,
      section: "action",
      useOptions: { targetUuids: [target.document.uuid] }
    });

    expect(resolved.critical).toBe(true);
    expect(rollDamage).toHaveBeenCalledOnce();
    expect(applyDamage).toHaveBeenCalledOnce();
  });

  it("rolls attack, applies damage only to hits, marks economy in combat", async () => {
    const applyDamage = vi.fn(async function apply() {
      this.system.attributes.hp.value -= 7;
      return this;
    });

    const goblinActor = {
      uuid: "Actor.gob",
      name: "Goblin",
      system: { attributes: { ac: { value: 12 }, hp: { value: 10, temp: 0, tempmax: 0 } } },
      applyDamage
    };
    const tankActor = {
      uuid: "Actor.tank",
      name: "Tank",
      system: { attributes: { ac: { value: 20 }, hp: { value: 40, temp: 0, tempmax: 0 } } },
      applyDamage: vi.fn(async () => ({}))
    };

    const goblin = makeToken({ id: "g1", name: "Goblin" });
    goblin.document.uuid = "Scene.1.Token.g1";
    goblin.actor = goblinActor;
    const tank = makeToken({ id: "t1", name: "Tank" });
    tank.document.uuid = "Scene.1.Token.t1";
    tank.actor = tankActor;

    canvas.tokens.placeables = [goblin, tank];
    globalThis.fromUuidSync = (uuid) => {
      if (uuid === goblin.document.uuid) return goblin.document;
      if (uuid === tank.document.uuid) return tank.document;
      return null;
    };
    goblin.document.object = goblin;
    tank.document.object = tank;

    const attacker = makeToken({ id: "a1" });
    const hero = { id: "hero", uuid: "Actor.hero", isOwner: true };
    attacker.actor = hero;

    const cmb = makeCombatant({ id: "c1", tokenId: "a1", actor: hero });
    installFoundry({ combat: makeCombat({ started: true, combatants: [cmb] }) });
    canvas.tokens.placeables = [goblin, tank];
    globalThis.fromUuidSync = (uuid) => {
      if (uuid === goblin.document.uuid) return goblin.document;
      if (uuid === tank.document.uuid) return tank.document;
      return null;
    };

    const activity = {
      id: "atk",
      type: "attack",
      use: vi.fn(async () => ({})),
      rollAttack: vi.fn(async () => [{ total: 15, isCritical: false, isFumble: false, formula: "1d20+5" }]),
      rollDamage: vi.fn(async () => [{ total: 7, options: { type: "slashing" }, formula: "1d8+3" }])
    };

    const resolved = await resolveActivity({
      token: attacker,
      item: { uuid: "Actor.hero.Item.sword", name: "Sword", type: "weapon" },
      activity,
      section: "action",
      useOptions: {
        targetUuids: [goblin.document.uuid, tank.document.uuid]
      }
    });

    expect(resolved.economySpend?.after?.action).toBe(0);
    expect(cmb.setFlag).toHaveBeenCalled();
    expect(activity.use).toHaveBeenCalled();
    expect(activity.rollAttack).toHaveBeenCalled();
    expect(activity.rollDamage).toHaveBeenCalled();
    expect(resolved.hitUuids).toEqual([goblin.document.uuid]);
    expect(applyDamage).toHaveBeenCalledOnce();
    expect(tankActor.applyDamage).not.toHaveBeenCalled();
  });

  it("does not mark economy diamonds out of combat", async () => {
    const attacker = makeToken({ id: "a1" });
    attacker.actor = { id: "hero", uuid: "Actor.hero", isOwner: true };
    installFoundry();

    const resolved = await resolveActivity({
      token: attacker,
      item: { name: "Sword", type: "weapon" },
      activity: {
        id: "atk",
        type: "attack",
        use: vi.fn(async () => ({})),
        rollAttack: vi.fn(async () => [{ total: 1, isFumble: true }]),
        rollDamage: vi.fn(async () => [])
      },
      section: "action",
      useOptions: { targetUuids: [] }
    });

    expect(resolved.economySpend).toBe(null);
  });

  it("startHudAction records a completed resolution after apply", async () => {
    const applyDamage = vi.fn(async function apply() {
      this.system.attributes.hp.value -= 4;
      return this;
    });
    const targetActor = {
      uuid: "Actor.gob",
      system: { attributes: { ac: { value: 10 }, hp: { value: 8, temp: 0, tempmax: 0 } } },
      applyDamage
    };
    const target = makeToken({ id: "g1" });
    target.document.uuid = "Scene.1.Token.g1";
    target.actor = targetActor;
    target.document.object = target;
    canvas.tokens.placeables = [target];
    globalThis.fromUuidSync = (uuid) => (uuid === target.document.uuid ? target.document : null);

    const activity = {
      id: "atk",
      type: "attack",
      use: async () => ({}),
      rollAttack: async () => [{ total: 18, isCritical: false, isFumble: false }],
      rollDamage: async () => [{ total: 4, options: { type: "slashing" } }]
    };

    await startHudAction({
      token: {
        actor: {
          uuid: "Actor.1",
          setFlag: vi.fn(async () => ({})),
          isOwner: true
        }
      },
      item: { id: "i1", uuid: "Actor.1.Item.i1", name: "Mace" },
      activity,
      section: "action",
      useOptions: { targetUuids: [target.document.uuid] }
    });

    const view = getLastResolutionView();
    expect(view.phase).toBe("completed");
    expect(applyDamage).toHaveBeenCalled();
  });
});
