import { describe, it, expect, beforeEach, vi } from "vitest";

const journal = vi.hoisted(() => ({
  journalChanges: vi.fn(async () => null),
  entriesForEffects: vi.fn(() => ["log:t:1"])
}));
vi.mock("../src/application/combat-game-log.mjs", () => journal);

import { installFoundry } from "./helpers.mjs";
import { evaluateCondition, conditionErrors } from "../src/domain/triggers/conditions.mjs";
import { declarationErrors } from "../src/domain/triggers/declarations.mjs";
import { momentForWindow, MOMENTS } from "../src/domain/triggers/moments.mjs";
import { evaluateArithmetic, substituteRefs, expandRefs, averageDice } from "../src/domain/triggers/formula.mjs";
import { CONTENT } from "../src/content/declarations.mjs";
import { getRule } from "../src/rules/catalog.mjs";
import { declarationsFor, _resetTriggerIndex, invalidateActor } from "../src/application/triggers/index.mjs";
import { runPassiveTriggers, declarationSpecsForWindow } from "../src/application/triggers/engine.mjs";
import { mergePatches } from "../src/application/reactions/registry.mjs";
import { squaresCrossed, tickZoneMove } from "../src/application/zones.mjs";
import { doubleRange } from "../src/application/range.mjs";
import { zoneBonusActions, igniteTerrain, movementCostMultiplier } from "../src/application/zones.mjs";
import {
  componentsForCast,
  castIsPerceptible,
  componentBlock
} from "../src/domain/combat/spell-components.mjs";
import { empowerRolls, holdReadiedSpell } from "../src/application/triggers/lifecycle.mjs";
import { dragGrappled } from "../src/application/triggers/feature-steps.mjs";
import { isEconomyAvailable } from "../src/application/economy.mjs";
import { enforceCombatMovementBudget } from "../src/application/token-movement.mjs";
import { MODULE_ID } from "../src/constants.mjs";

function collection(list = []) {
  return Object.assign([...list], { get: (id) => list.find((x) => x.id === id) ?? null });
}

function actor({ uuid, items = [], effects = [], system = {}, type = "npc", flags = {} } = {}) {
  const hp = { value: 20, max: 20, temp: 0, ...(system.hp ?? {}) };
  const a = {
    uuid,
    id: uuid.split(".").pop(),
    type,
    items: collection(items),
    effects: collection(effects),
    appliedEffects: effects,
    flags,
    statuses: new Set(),
    system: { ...system, attributes: { prof: 3, hp, ...(system.attributes ?? {}) } },
    getFlag: (scope, key) => flags?.[scope]?.[key],
    setFlag: vi.fn(async (scope, key, value) => {
      flags[scope] = { ...(flags[scope] ?? {}), [key]: value };
    }),
    applyDamage: vi.fn(async (damages) => {
      for (const d of damages) {
        if (d.type === "temphp") hp.temp = Math.max(hp.temp, d.value);
        else hp.value -= d.value;
      }
    })
  };
  return a;
}

function token(id, a, disposition) {
  return { id, actor: a, document: { uuid: `Scene.s.Token.${id}`, disposition } };
}

function placeTokens(list) {
  globalThis.canvas.tokens.placeables = list;
}

describe("trigger conditions", () => {
  const facts = {
    "self.hp.temp": 5,
    "trigger.creatureType": "fiend",
    "self.effects": new Set(["blur"]),
    "activity.isMelee": true
  };
  const get = (p) => facts[p];

  it("equality, operators, membership, composition", () => {
    expect(evaluateCondition({ "activity.isMelee": true }, get)).toBe(true);
    expect(evaluateCondition({ "self.hp.temp": { gt: 0, lte: 5 } }, get)).toBe(true);
    expect(evaluateCondition({ "trigger.creatureType": { in: ["Fiend", "undead"] } }, get)).toBe(true);
    expect(evaluateCondition({ "self.effects": { has: "Blur" } }, get)).toBe(true);
    expect(evaluateCondition({ any: [{ "activity.isMelee": false }, { not: { "self.hp.temp": 0 } }] }, get)).toBe(true);
    expect(evaluateCondition({ all: [{ "activity.isMelee": true }, { "self.hp.temp": { lt: 5 } }] }, get)).toBe(false);
  });

  it("unknown facts fail closed, except exists: false", () => {
    expect(evaluateCondition({ "self.typo": true }, get)).toBe(false);
    expect(evaluateCondition({ "self.typo": { ne: 1 } }, get)).toBe(false);
    expect(evaluateCondition({ "self.typo": { exists: false } }, get)).toBe(true);
    expect(evaluateCondition(null, get)).toBe(true);
  });

  it("flags unknown operators", () => {
    expect(conditionErrors({ "self.hp.temp": { greater: 1 } })[0]).toMatch(/unknown operator/);
  });
});

describe("declarations", () => {
  it("validation catches bad moments, steps and modes", () => {
    expect(declarationErrors({ id: "x", on: "nope", do: [{ step: "advantage" }] })[0]).toMatch(/unknown moment/);
    expect(declarationErrors({ id: "x", on: "isHit", do: [{ step: "fly" }] })[0]).toMatch(/unknown step/);
    expect(declarationErrors({ id: "x", on: "isHit", mode: "loud", do: [{ step: "acBonus", value: 2 }] })[0])
      .toMatch(/unknown mode/);
    expect(declarationErrors({ id: "x", on: "isHit", do: [{ step: "damage" }] }).join()).toMatch(/needs "value"/);
    expect(declarationErrors({ id: "x", on: "isHit", do: [{ step: "acBonus", value: "@prof" }] })).toEqual([]);
  });

  it("prompted declarations may offer weapons and have no steps; passive ones may not", () => {
    expect(declarationErrors({ id: "x", on: "isDamaged", mode: "soft", offer: "meleeWeapons", do: [] })).toEqual([]);
    expect(declarationErrors({ id: "x", on: "isDamaged", do: [] }).join()).toMatch(/at least one step/);
    expect(declarationErrors({ id: "x", on: "isHit", selfTrigger: true, do: [{ step: "advantage" }] }).join())
      .toMatch(/prompted modes only/);
    expect(declarationErrors({ id: "x", on: "isHit", mode: "hard", offer: "spells", do: [] }).join()).toMatch(/unknown offer/);
    expect(declarationErrors({ id: "x", on: "failedSave", mode: "hard", do: [{ step: "reroll", keep: "best" }] }).join())
      .toMatch(/"keep"/);
  });

  it("every shipped declaration is valid and cites a catalog rule", () => {
    for (const content of CONTENT) {
      for (const decl of content.declarations) {
        expect(declarationErrors(decl), decl.id).toEqual([]);
        expect(getRule(decl.rule), decl.id).toBeTruthy();
      }
    }
  });

  it("every wired moment maps to its reaction window", () => {
    for (const [id, m] of Object.entries(MOMENTS)) {
      if (m.window) expect(momentForWindow(m.window)).toBe(id);
    }
  });

  it("formulas: refs and arithmetic", () => {
    expect(substituteRefs("5 * @sourceLevel", { sourceLevel: 3 })).toBe("5 * 3");
    expect(evaluateArithmetic("max(1, 3 + 5) - 2 * (1 + 1)")).toBe(4);
    expect(evaluateArithmetic("1d6")).toBe(null);
    expect(expandRefs("@bardicDie + @prof", { bardicDie: "1d8", prof: 3 })).toBe("1d8 + 3");
    expect(expandRefs("(@slotLevel)d6", { slotLevel: 2 })).toBe("2d6");
    expect(evaluateArithmetic(averageDice("1d10 + 2d6 + 3"))).toBe(5 + 6 + 3);
  });
});

describe("trigger engine", () => {
  beforeEach(() => {
    installFoundry();
    _resetTriggerIndex();
    journal.journalChanges.mockClear();
    journal.entriesForEffects.mockClear();
  });

  it("Blur gives disadvantage unless the attacker has truesight", async () => {
    const defender = actor({ uuid: "Actor.def", effects: [{ id: "e1", uuid: "Actor.def.ActiveEffect.e1", name: "Blur" }] });
    const attacker = actor({ uuid: "Actor.atk", system: { attributes: { senses: { truesight: 0 } } } });
    const tDef = token("def", defender, 1);
    const tAtk = token("atk", attacker, -1);
    placeTokens([tDef, tAtk]);
    const baseCtx = { triggerTokenUuid: tAtk.document.uuid, targetUuids: [tDef.document.uuid], attackRoll: true };

    expect(declarationsFor(attacker, "attackDeclared")).toEqual([]);
    const merged = mergePatches(await runPassiveTriggers("attackDeclared", { baseCtx }));
    expect(merged.attackDisadvantage).toBe(true);
    expect(merged.sources).toContain("blur");

    attacker.system.attributes.senses.truesight = 30;
    expect(mergePatches(await runPassiveTriggers("attackDeclared", { baseCtx })).attackDisadvantage).toBe(false);
  });

  it("Armor of Agathys damages a melee attacker and journals the write against the effect's cause", async () => {
    const aoa = {
      id: "aoa",
      uuid: "Actor.def.ActiveEffect.aoa",
      name: "Armor of Agathys",
      flags: { dnd5e: { spellLevel: 2 } }
    };
    const defender = actor({ uuid: "Actor.def", effects: [aoa], system: { hp: { temp: 10 } } });
    const attacker = actor({ uuid: "Actor.atk" });
    const tDef = token("def", defender, 1);
    const tAtk = token("atk", attacker, -1);
    placeTokens([tDef, tAtk]);
    const baseCtx = { triggerTokenUuid: tAtk.document.uuid, targetUuids: [tDef.document.uuid], melee: true };

    await runPassiveTriggers("isHit", { baseCtx, parentId: "res-1" });
    expect(attacker.applyDamage).toHaveBeenCalledWith(
      [expect.objectContaining({ value: 10, type: "cold" })],
      expect.anything()
    );
    expect(defender.applyDamage).not.toHaveBeenCalled();
    const call = journal.journalChanges.mock.calls[0][0];
    expect(call).toMatchObject({ resolutionId: "res-1", label: "Armor of Agathys", dependsOn: ["log:t:1"] });
    expect(call.changes[0]).toMatchObject({ type: "actor-hp", actorUuid: "Actor.atk" });

    attacker.applyDamage.mockClear();
    await runPassiveTriggers("isHit", { baseCtx: { ...baseCtx, melee: false, ranged: true } });
    expect(attacker.applyDamage).not.toHaveBeenCalled();
  });

  it("Heavy Armor Master picks the edition of its source item", async () => {
    const feat = (rules) => ({ id: `ham${rules}`, name: "Heavy Armor Master", system: { identifier: "heavy-armor-master", source: { rules } } });
    const plate = { id: "plate", type: "equipment", system: { equipped: true, type: { value: "heavy" } } };
    const knight = actor({ uuid: "Actor.k", items: [feat("2024"), plate] });
    const tK = token("k", knight, 1);
    const tA = token("a", actor({ uuid: "Actor.a" }), -1);
    placeTokens([tK, tA]);
    const baseCtx = {
      triggerTokenUuid: tA.document.uuid,
      targetUuids: [tK.document.uuid],
      attackRoll: true,
      weaponAttack: true,
      damageTypes: ["slashing"]
    };
    let merged = mergePatches(await runPassiveTriggers("damageKnown", { baseCtx }));
    expect(merged.damageReduceByTarget.get(tK.document.uuid)).toBe(3);

    knight.items[0].system.source.rules = "2014";
    knight.system.attributes.prof = 5;
    invalidateActor(knight);
    merged = mergePatches(await runPassiveTriggers("damageKnown", { baseCtx }));
    expect(merged.damageReduceByTarget.get(tK.document.uuid)).toBe(3);
    expect(declarationsFor(knight, "damageKnown").map((e) => e.decl.id)).toEqual(["heavy-armor-master-2014"]);

    merged = mergePatches(await runPassiveTriggers("damageKnown", { baseCtx: { ...baseCtx, damageTypes: ["fire"] } }));
    expect(merged.damageReduceByTarget.size).toBe(0);
  });

  it("Dark One's Blessing grants temp HP when the warlock drops a hostile creature", async () => {
    const blessing = { id: "dob", name: "Dark One's Blessing", system: { identifier: "dark-ones-blessing" } };
    const warlock = actor({
      uuid: "Actor.w",
      type: "character",
      items: [blessing],
      system: { abilities: { cha: { mod: 3 } }, classes: { warlock: { levels: 5 } } }
    });
    const tW = token("w", warlock, 1);
    const tE = token("e", actor({ uuid: "Actor.e" }), -1);
    const tF = token("f", actor({ uuid: "Actor.f" }), 1);
    placeTokens([tW, tE, tF]);

    await runPassiveTriggers("isDamaged", { baseCtx: { triggerTokenUuid: tW.document.uuid, droppedUuids: [tF.document.uuid] } });
    expect(warlock.applyDamage).not.toHaveBeenCalled();

    await runPassiveTriggers("isDamaged", { baseCtx: { triggerTokenUuid: tW.document.uuid, droppedUuids: [tE.document.uuid] } });
    expect(warlock.applyDamage).toHaveBeenCalledWith(
      [expect.objectContaining({ value: 8, type: "temphp" })],
      expect.anything()
    );
    expect(journal.journalChanges).toHaveBeenCalledTimes(1);
  });

  it("once per turn: a declaration fires once until the turn changes", async () => {
    const item = {
      id: "ring",
      name: "Ring of Spite",
      flags: {
        "illusive-dnd-5e": {
          triggers: [{
            id: "spite",
            on: "isHit",
            once: "turn",
            if: { "self.isTarget": true },
            do: [{ step: "damage", to: "trigger", value: 2, damageType: "necrotic" }]
          }]
        }
      }
    };
    const wearer = actor({ uuid: "Actor.r", items: [item] });
    const foe = actor({ uuid: "Actor.f" });
    const tR = token("r", wearer, 1);
    const tF = token("f", foe, -1);
    placeTokens([tR, tF]);
    globalThis.game.combat = { started: true, round: 1, turn: 0 };
    const baseCtx = { triggerTokenUuid: tF.document.uuid, targetUuids: [tR.document.uuid] };

    await runPassiveTriggers("isHit", { baseCtx });
    await runPassiveTriggers("isHit", { baseCtx });
    expect(foe.applyDamage).toHaveBeenCalledTimes(1);
    const changes = journal.journalChanges.mock.calls[0][0].changes;
    expect(changes.map((c) => c.type)).toEqual(["actor-hp", "flag"]);

    globalThis.game.combat.turn = 1;
    await runPassiveTriggers("isHit", { baseCtx });
    expect(foe.applyDamage).toHaveBeenCalledTimes(2);
  });

  it("prompted declarations become reaction specs on their source item", async () => {
    const duelist = {
      id: "dd",
      name: "Defensive Duelist",
      system: { identifier: "defensive-duelist" }
    };
    const rapier = { id: "rap", type: "weapon", system: { equipped: true, properties: new Set(["fin"]) } };
    const fencer = actor({ uuid: "Actor.fe", items: [duelist, rapier] });
    const tFe = token("fe", fencer, 1);
    const tO = token("o", actor({ uuid: "Actor.o" }), -1);
    placeTokens([tFe, tO]);

    const [spec] = declarationSpecsForWindow("on-attack-hit", fencer);
    expect(spec).toMatchObject({ mode: "hard", window: "on-attack-hit" });
    expect(spec.match(duelist)).toBe(true);
    expect(spec.match(rapier)).toBe(false);

    const { createMomentScope, candidateContext } = await import("../src/application/reactions/candidates.mjs");
    const scope = createMomentScope({ triggerTokenUuid: tO.document.uuid, targetUuids: [tFe.document.uuid], melee: true });
    const ctx = candidateContext(scope, tFe);
    expect(spec.eligible(ctx, scope)).toBe(true);
    const patches = await spec.buildPatches(ctx, scope);
    expect(mergePatches(patches).acBonusByTarget.get(tFe.document.uuid)).toBe(3);

    rapier.system.properties = new Set();
    expect(spec.eligible(candidateContext(createMomentScope(scope.baseCtx), tFe), scope)).toBe(false);
  });

  it("a save step applies the failure and halves the damage on a success", async () => {
    const rule = (onSave) => ({
      id: "bolt",
      name: "Bolt",
      flags: {
        "illusive-dnd-5e": {
          triggers: [{
            id: "bolt",
            on: "isHit",
            if: { "self.isTrigger": true },
            do: [{ step: "save", to: "target", ability: "dex", dc: 15, damage: 10, damageType: "lightning", onSave, onFail: "prone" }]
          }]
        }
      }
    });
    const caster = actor({ uuid: "Actor.caster", items: [rule("half")] });
    const foe = actor({ uuid: "Actor.foe" });
    foe.rollSavingThrow = vi.fn(async () => ({ total: 20 }));
    foe.toggleStatusEffect = vi.fn(async () => {});
    const tC = token("c", caster, 1);
    const tF = token("f", foe, -1);
    placeTokens([tC, tF]);
    const baseCtx = { triggerTokenUuid: tC.document.uuid, targetUuids: [tF.document.uuid] };

    await runPassiveTriggers("isHit", { baseCtx });
    expect(foe.applyDamage).toHaveBeenCalledWith(
      [expect.objectContaining({ value: 5, type: "lightning" })],
      expect.anything()
    );
    expect(foe.toggleStatusEffect).not.toHaveBeenCalled();

    foe.applyDamage.mockClear();
    foe.rollSavingThrow = vi.fn(async () => ({ total: 8 }));
    invalidateActor(caster);
    await runPassiveTriggers("isHit", { baseCtx });
    expect(foe.applyDamage).toHaveBeenCalledWith(
      [expect.objectContaining({ value: 10, type: "lightning" })],
      expect.anything()
    );
    expect(foe.toggleStatusEffect).toHaveBeenCalledWith("prone", expect.objectContaining({ active: true }));
  });

  it("a push step moves the target away from the source", async () => {
    const item = {
      id: "push",
      name: "Push",
      flags: {
        "illusive-dnd-5e": {
          triggers: [{
            id: "push",
            on: "isHit",
            if: { "self.isTrigger": true },
            do: [{ step: "push", to: "target", feet: 10 }]
          }]
        }
      }
    };
    const caster = actor({ uuid: "Actor.pusher", items: [item] });
    const foe = actor({ uuid: "Actor.pushed" });
    const tC = token("pc", caster, 1);
    const tF = token("pf", foe, -1);
    Object.assign(tC, { center: { x: 50, y: 50 } });
    Object.assign(tC.document, { x: 0, y: 0, update: vi.fn(async () => {}) });
    Object.assign(tF, { center: { x: 150, y: 50 } });
    Object.assign(tF.document, { x: 100, y: 0, update: vi.fn(async () => {}) });
    placeTokens([tC, tF]);
    globalThis.canvas.grid = { size: 100, distance: 5 };

    await runPassiveTriggers("isHit", {
      baseCtx: { triggerTokenUuid: tC.document.uuid, targetUuids: [tF.document.uuid] }
    });
    expect(tF.document.update).toHaveBeenCalledWith(
      { x: 300, y: 0 },
      expect.objectContaining({ illusiveSkipOA: true, illusiveDndForced: true })
    );
  });

  it("a zone step places a region, and a square of movement ticks it", async () => {
    const item = {
      id: "spikes",
      name: "Spikes",
      flags: {
        "illusive-dnd-5e": {
          triggers: [{
            id: "spikes",
            on: "isHit",
            if: { "self.isTrigger": true },
            do: [{ step: "zone", feet: 15, when: "square", damage: "4", damageType: "piercing" }]
          }]
        }
      }
    };
    const caster = actor({ uuid: "Actor.zone", items: [item] });
    const tC = token("zc", caster, 1);
    Object.assign(tC.document, { x: 0, y: 0, width: 1, height: 1 });
    placeTokens([tC]);
    const created = [];
    globalThis.canvas.scene = {
      uuid: "Scene.s",
      grid: { size: 100, distance: 5 },
      createEmbeddedDocuments: vi.fn(async (_name, data) => {
        created.push(...data);
        return [{ uuid: "Scene.s.Region.1" }];
      })
    };

    await runPassiveTriggers("isHit", { baseCtx: { triggerTokenUuid: tC.document.uuid, targetUuids: [] } });
    expect(created[0].flags[MODULE_ID].zone).toMatchObject({ when: "square", feet: 15, damage: "4", follow: true, sourceId: "zc" });
    expect(created[0].attachment).toEqual({ token: "zc" });

    const walker = actor({ uuid: "Actor.walk" });
    const doc = { id: "walk", uuid: "Scene.s.Token.walk", x: 200, y: 0, width: 1, height: 1, actor: walker };
    const placeable = { id: "walk", actor: walker, document: doc };
    placeTokens([placeable]);
    globalThis.canvas.scene.regions = [{
      id: "r1",
      documentName: "Region",
      flags: { [MODULE_ID]: { zone: { when: "square", damage: "4", damageType: "piercing" } } },
      testPoint: ({ x }) => x >= 150
    }];
    expect(squaresCrossed(10)).toBe(2);
    await tickZoneMove(doc, { x: 0, y: 0 });
    expect(walker.applyDamage).toHaveBeenCalledWith(
      [expect.objectContaining({ value: 8, type: "piercing" })],
      expect.anything()
    );
  });

  it("a following zone moves with its caster", async () => {
    const region = {
      id: "follow",
      flags: { [MODULE_ID]: { zone: { follow: true, sourceId: "hero", when: "turnStart" } } },
      shapes: [{ type: "emanation", base: { x: 0, y: 0 } }],
      update: vi.fn(async () => {})
    };
    globalThis.canvas.scene = { regions: [region], grid: { size: 100, distance: 5 } };
    await tickZoneMove({ id: "hero", x: 100, y: 40, actor: actor({ uuid: "Actor.hero" }) }, { x: 0, y: 0 });
    expect(region.update).toHaveBeenCalledWith({
      shapes: [{ type: "emanation", base: { x: 100, y: 40 } }]
    });
  });

  function listen(id, step, on = "isHit") {
    return {
      id,
      name: id,
      flags: { "illusive-dnd-5e": { triggers: [{ id, on, if: { "self.isTrigger": true }, do: [step] }] } }
    };
  }

  it("grapples on a failed Strength or Dexterity save and drags the target", async () => {
    const grappler = actor({ uuid: "Actor.grappler", items: [listen("grapple", { step: "grapple", to: "target" })] });
    const foe = actor({ uuid: "Actor.gfoe" });
    foe.rollSavingThrow = vi.fn(async () => ({ total: 1 }));
    foe.toggleStatusEffect = vi.fn(async () => {});
    const tG = token("gg", grappler, 1);
    const tF = token("gf", foe, -1);
    placeTokens([tG, tF]);
    await runPassiveTriggers("isHit", {
      baseCtx: { triggerTokenUuid: tG.document.uuid, targetUuids: [tF.document.uuid] }
    });
    expect(foe.toggleStatusEffect).toHaveBeenCalledWith("grappled", expect.objectContaining({ active: true }));
    expect(grappler.getFlag(MODULE_ID, "grappling")).toEqual([tF.document.uuid]);

    const held = { uuid: tF.document.uuid, x: 50, y: 0, update: vi.fn(async () => {}) };
    tF.document = held;
    await dragGrappled({ id: "gg", x: 80, y: 0, actor: grappler }, { x: 0, y: 0 });
    expect(held.update).toHaveBeenCalledWith(
      { x: 130, y: 0 },
      expect.objectContaining({ illusiveSkipOA: true, illusiveDndForced: true })
    );
  });

  it("a contest applies the status when the source wins", async () => {
    const item = listen("shove", { step: "contest", to: "target", ability: "ath", vs: "acr", onWin: "prone" });
    const hero = actor({ uuid: "Actor.hero2", items: [item] });
    const foe = actor({ uuid: "Actor.foe2" });
    hero.rollAbilityCheck = vi.fn(async () => ({ total: 16 }));
    foe.rollAbilityCheck = vi.fn(async () => ({ total: 9 }));
    foe.toggleStatusEffect = vi.fn(async () => {});
    const tH = token("ch", hero, 1);
    const tF = token("cf", foe, -1);
    placeTokens([tH, tF]);
    await runPassiveTriggers("isHit", {
      baseCtx: { triggerTokenUuid: tH.document.uuid, targetUuids: [tF.document.uuid] }
    });
    expect(foe.toggleStatusEffect).toHaveBeenCalledWith("prone", expect.objectContaining({ active: true }));
  });

  it("control denies the listed action and movement", async () => {
    const item = listen("fear", { step: "control", to: "target", deny: ["action", "move"], status: "frightened" });
    const caster = actor({ uuid: "Actor.fear", items: [item] });
    const foe = actor({ uuid: "Actor.feared" });
    foe.toggleStatusEffect = vi.fn(async () => {});
    const tC = token("fear", caster, 1);
    const tF = token("feared", foe, -1);
    placeTokens([tC, tF]);
    await runPassiveTriggers("isHit", {
      baseCtx: { triggerTokenUuid: tC.document.uuid, targetUuids: [tF.document.uuid] }
    });
    expect(foe.getFlag(MODULE_ID, "control")).toEqual(["action", "move"]);
    tF.document.actor = foe;
    expect(isEconomyAvailable(foe, "action")).toBe(false);
    expect(isEconomyAvailable(foe, "bonus")).toBe(true);
    expect(enforceCombatMovementBudget(tF.document, { x: 10 }, {})).toBe(false);
    expect(enforceCombatMovementBudget(tF.document, { x: 10 }, { illusiveDndForced: true })).toBe(true);
  });

  it("metamagic spends sorcery points and changes the save", async () => {
    const item = {
      id: "meta",
      name: "Meta",
      flags: {
        "illusive-dnd-5e": {
          triggers: [{
            id: "meta",
            on: "isHit",
            if: { "self.isTrigger": true },
            do: [
              { step: "metamagic", option: "heightened" },
              { step: "save", to: "target", ability: "dex", dc: 15, damage: 8, onSave: "none" }
            ]
          }]
        }
      }
    };
    const caster = actor({
      uuid: "Actor.sorc",
      items: [item],
      system: { resources: { sorcery: { value: 5, max: 5 } } }
    });
    caster.update = vi.fn(async () => {});
    const foe = actor({ uuid: "Actor.metafoe" });
    foe.rollSavingThrow = vi.fn(async () => ({ total: 20 }));
    const tC = token("sorc", caster, 1);
    const tF = token("metafoe", foe, -1);
    placeTokens([tC, tF]);
    await runPassiveTriggers("isHit", {
      baseCtx: { triggerTokenUuid: tC.document.uuid, targetUuids: [tF.document.uuid] }
    });
    expect(caster.update).toHaveBeenCalledWith(
      { "system.resources.sorcery.value": 2 },
      expect.anything()
    );
    expect(caster.getFlag(MODULE_ID, "metamagic")).toBe("heightened");
    expect(foe.rollSavingThrow).toHaveBeenCalledWith(
      expect.objectContaining({ disadvantage: true }),
      expect.anything(),
      expect.anything()
    );
  });

  it("careful metamagic lets an ally skip the save", async () => {
    const item = listen("careful", { step: "metamagic", option: "careful" });
    const caster = actor({
      uuid: "Actor.care",
      items: [{
        ...item,
        flags: {
          "illusive-dnd-5e": {
            triggers: [{
              id: "careful",
              on: "isHit",
              if: { "self.isTrigger": true },
              do: [
                { step: "metamagic", option: "careful" },
                { step: "save", to: "target", ability: "dex", dc: 18, damage: 10, onSave: "none" }
              ]
            }]
          }
        }
      }],
      system: { resources: { sorcery: { value: 2, max: 2 } } }
    });
    caster.update = vi.fn(async () => {});
    const ally = actor({ uuid: "Actor.ally" });
    ally.rollSavingThrow = vi.fn(async () => ({ total: 1 }));
    ally.applyDamage = vi.fn(async () => {});
    const tC = token("care", caster, 1);
    const tA = token("ally", ally, 1);
    placeTokens([tC, tA]);
    await runPassiveTriggers("isHit", {
      baseCtx: { triggerTokenUuid: tC.document.uuid, targetUuids: [tA.document.uuid] }
    });
    expect(ally.rollSavingThrow).not.toHaveBeenCalled();
    expect(ally.applyDamage).not.toHaveBeenCalled();
  });

  it("wild shape replaces hit points and inspiration is spent for advantage", async () => {
    const caster = actor({
      uuid: "Actor.druid",
      system: { attributes: { inspiration: false } },
      items: [{
        id: "form",
        name: "Form",
        flags: {
          "illusive-dnd-5e": {
            triggers: [{
              id: "form",
              on: "turnStart",
              do: [
                { step: "wildShape", hp: 11 },
                { step: "wildShape", end: true },
                { step: "inspiration" },
                { step: "inspiration", spend: true }
              ]
            }]
          }
        }
      }]
    });
    caster.update = vi.fn(async (data) => {
      if (data["system.attributes.hp.value"] != null) caster.system.attributes.hp.value = data["system.attributes.hp.value"];
      if (data["system.attributes.hp.max"] != null) caster.system.attributes.hp.max = data["system.attributes.hp.max"];
      if ("system.attributes.inspiration" in data) caster.system.attributes.inspiration = data["system.attributes.inspiration"];
    });
    placeTokens([token("druid", caster, 1)]);
    await runPassiveTriggers("turnStart", { baseCtx: { triggerTokenUuid: "Scene.s.Token.druid" } });
    expect(caster.update).toHaveBeenCalledWith(
      { "system.attributes.hp.value": 11, "system.attributes.hp.max": 11 },
      expect.anything()
    );
    expect(caster.update).toHaveBeenCalledWith(
      { "system.attributes.hp.value": 20, "system.attributes.hp.max": 20 },
      expect.anything()
    );
    expect(caster.system.attributes.inspiration).toBe(false);
    expect(caster.setFlag).toHaveBeenCalled();
  });

  it("portent stores dice and replaces the roll", async () => {
    globalThis.Roll = class {
      async evaluate() {
        this.total = 15;
        this.dice = [];
        return this;
      }
    };
    try {
      const wizard = actor({
        uuid: "Actor.wiz",
        items: [{
          id: "portent",
          name: "Portent",
          flags: {
            "illusive-dnd-5e": {
              triggers: [{
                id: "portent",
                on: "attackDeclared",
                do: [
                  { step: "portent", mode: "store", dice: 2 },
                  { step: "portent", mode: "replace" }
                ]
              }]
            }
          }
        }]
      });
      placeTokens([token("wiz", wizard, 1)]);
      const patches = await runPassiveTriggers("attackDeclared", {
        baseCtx: { triggerTokenUuid: "Scene.s.Token.wiz" }
      });
      expect(mergePatches(patches).replaceD20).toBe(15);
      expect(wizard.getFlag(MODULE_ID, "portent")).toEqual([15]);
    } finally {
      delete globalThis.Roll;
    }
  });

  it("lay on hands spends the pool and heals", async () => {
    const paladin = actor({
      uuid: "Actor.pal",
      items: [listen("lay", { step: "layOnHands", to: "target", value: 5, max: 15 }, "turnStart")]
    });
    const ally = actor({ uuid: "Actor.wounded" });
    const tP = token("pal", paladin, 1);
    const tA = token("wounded", ally, 1);
    placeTokens([tP, tA]);
    await runPassiveTriggers("turnStart", {
      baseCtx: { triggerTokenUuid: tP.document.uuid, targetUuids: [tA.document.uuid] }
    });
    expect(paladin.getFlag(MODULE_ID, "pools")).toEqual({ "lay-on-hands": 10 });
    expect(ally.applyDamage).toHaveBeenCalledWith(
      [expect.objectContaining({ value: 5, type: "healing" })],
      expect.anything()
    );
  });

  it("legendary resistance spends a use and succeeds the save", async () => {
    const foe = actor({
      uuid: "Actor.legend",
      system: { resources: { legres: { value: 1, max: 3, label: "Legendary Resistance" } } },
      items: [{
        id: "lr",
        name: "Legendary Resistance",
        flags: {
          "illusive-dnd-5e": {
            triggers: [{ id: "lr", on: "failedSave", do: [{ step: "legendaryResistance" }] }]
          }
        }
      }]
    });
    foe.update = vi.fn(async (data) => {
      foe.system.resources.legres.value = data["system.resources.legres.value"];
    });
    foe.rollSavingThrow = vi.fn(async () => ({ total: 2 }));
    foe.toggleStatusEffect = vi.fn(async () => {});
    const caster = actor({
      uuid: "Actor.bolt2",
      items: [listen("bolt2", {
        step: "save", to: "target", ability: "dex", dc: 15, damage: 10, damageType: "fire", onSave: "half", onFail: "prone"
      })]
    });
    const tC = token("bolt2", caster, 1);
    const tF = token("legend", foe, -1);
    placeTokens([tC, tF]);
    await runPassiveTriggers("isHit", {
      baseCtx: { triggerTokenUuid: tC.document.uuid, targetUuids: [tF.document.uuid] }
    });
    expect(foe.system.resources.legres.value).toBe(0);
    expect(foe.applyDamage).toHaveBeenCalledWith(
      [expect.objectContaining({ value: 5, type: "fire" })],
      expect.anything()
    );
    expect(foe.toggleStatusEffect).not.toHaveBeenCalled();

    foe.system.resources.legres.value = 1;
    foe.applyDamage.mockClear();
    const spent = await runPassiveTriggers("failedSave", { baseCtx: { triggerTokenUuid: tF.document.uuid } });
    expect(mergePatches(spent).saveSuccess).toBe(true);
    expect(foe.system.resources.legres.value).toBe(0);
  });

  it("a recharge restores the item on a 6", async () => {
    globalThis.Roll = class {
      async evaluate() {
        this.total = 6;
        this.dice = [];
        return this;
      }
    };
    try {
      const breath = { id: "breath", name: "Breath", system: { uses: { spent: 3, max: 1 } }, update: vi.fn(async () => {}) };
      const dragon = actor({
        uuid: "Actor.dragon",
        items: [breath, listen("recharge", { step: "recharge", item: "breath" }, "turnStart")]
      });
      placeTokens([token("dragon", dragon, -1)]);
      await runPassiveTriggers("turnStart", { baseCtx: { triggerTokenUuid: "Scene.s.Token.dragon" } });
      expect(breath.update).toHaveBeenCalledWith({ "system.uses.spent": 0 }, expect.anything());
    } finally {
      delete globalThis.Roll;
    }
  });

  it("redirect sends the hit to an ally", async () => {
    const guard = actor({
      uuid: "Actor.guard",
      items: [{
        id: "redirect",
        name: "Redirect",
        flags: {
          "illusive-dnd-5e": {
            triggers: [{
              id: "redirect",
              on: "isHit",
              if: { "self.isTarget": true },
              do: [{ step: "redirect" }]
            }]
          }
        }
      }]
    });
    const ally = actor({ uuid: "Actor.ward" });
    const attacker = actor({ uuid: "Actor.archer" });
    const tG = token("guard", guard, 1);
    const tA = token("ward", ally, 1);
    const tX = token("archer", attacker, -1);
    placeTokens([tG, tA, tX]);
    const patches = await runPassiveTriggers("isHit", {
      baseCtx: { triggerTokenUuid: tX.document.uuid, targetUuids: [tG.document.uuid] }
    });
    expect(mergePatches(patches).redirectUuid).toBe(tA.document.uuid);
  });

  it("split stands the creature back up and leaves a copy", async () => {
    const ooze = actor({
      uuid: "Actor.ooze",
      system: { hp: { value: 0, max: 22 } },
      items: [listen("split", { step: "split" }, "turnStart")]
    });
    ooze.update = vi.fn(async () => {});
    const tO = token("ooze", ooze, -1);
    Object.assign(tO.document, { x: 0, y: 0 });
    placeTokens([tO]);
    const created = [];
    globalThis.canvas.scene = {
      grid: { size: 100, distance: 5 },
      createEmbeddedDocuments: vi.fn(async (_name, data) => {
        created.push(...data);
        return [{ uuid: "Scene.s.Token.copy" }];
      })
    };
    await runPassiveTriggers("turnStart", { baseCtx: { triggerTokenUuid: tO.document.uuid } });
    expect(ooze.update).toHaveBeenCalledWith({ "system.attributes.hp.value": 11 }, expect.anything());
    expect(created[0]).toMatchObject({ x: 100, y: 0, actorId: "ooze" });
  });

  it("an aura step copies its effect onto an ally", async () => {
    const caster = actor({
      uuid: "Actor.aura",
      items: [listen("warding", {
        step: "aura",
        feet: 10,
        affects: "ally",
        changes: [{ key: "system.attributes.ac.bonus", mode: 2, value: "2" }]
      }, "turnStart")]
    });
    caster.createEmbeddedDocuments = vi.fn(async () => [{ uuid: "Effect.caster" }]);
    const ally = actor({ uuid: "Actor.auraally" });
    ally.createEmbeddedDocuments = vi.fn(async () => [{ uuid: "Effect.ally" }]);
    const enemy = actor({ uuid: "Actor.auraenemy" });
    enemy.createEmbeddedDocuments = vi.fn(async () => [{ uuid: "Effect.enemy" }]);
    placeTokens([
      token("aura", caster, 1),
      token("auraally", ally, 1),
      token("auraenemy", enemy, -1)
    ]);
    await runPassiveTriggers("turnStart", { baseCtx: { triggerTokenUuid: "Scene.s.Token.aura" } });
    expect(ally.createEmbeddedDocuments).toHaveBeenCalledWith(
      "ActiveEffect",
      [expect.objectContaining({
        changes: [expect.objectContaining({ key: "system.attributes.ac.bonus", value: "2" })]
      })],
      expect.anything()
    );
    expect(enemy.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it("pulls the target toward the source and marks it", async () => {
    const caster = actor({
      uuid: "Actor.pull",
      items: [listen("yank", { step: "pull", to: "target", feet: 10 }, "isHit")]
    });
    const foe = actor({ uuid: "Actor.pulled" });
    const tC = token("puller", caster, 1);
    const tF = token("pulled", foe, -1);
    Object.assign(tC.document, { x: 0, y: 0, update: vi.fn(async () => {}) });
    Object.assign(tF.document, { x: 400, y: 0, update: vi.fn(async () => {}) });
    placeTokens([tC, tF]);
    await runPassiveTriggers("isHit", {
      baseCtx: { triggerTokenUuid: tC.document.uuid, targetUuids: [tF.document.uuid] }
    });
    expect(tF.document.update).toHaveBeenCalledWith(
      expect.objectContaining({ x: expect.any(Number) }),
      expect.objectContaining({ illusiveDndForced: true })
    );
    const moved = tF.document.update.mock.calls[0][0].x;
    expect(moved).toBeLessThan(400);
    expect(moved).toBeGreaterThan(0);
  });

  it("a mark names the creature Hex from the source", async () => {
    const caster = actor({
      uuid: "Actor.hexer",
      items: [listen("brand", { step: "mark", to: "target" }, "isHit")]
    });
    const foe = actor({ uuid: "Actor.hexed" });
    foe.createEmbeddedDocuments = vi.fn(async () => [{ uuid: "Effect.hex" }]);
    const tC = token("hexer", caster, 1);
    const tF = token("hexed", foe, -1);
    placeTokens([tC, tF]);
    await runPassiveTriggers("isHit", {
      baseCtx: { triggerTokenUuid: tC.document.uuid, targetUuids: [tF.document.uuid] }
    });
    expect(foe.createEmbeddedDocuments).toHaveBeenCalledWith(
      "ActiveEffect",
      [expect.objectContaining({ name: "Hex", statuses: ["marked"], origin: caster.uuid })],
      expect.anything()
    );
  });

  it("command, slow, and a free reaction write the control they name", async () => {
    const caster = actor({
      uuid: "Actor.commander",
      items: [{
        id: "command",
        name: "Command",
        flags: {
          "illusive-dnd-5e": {
            triggers: [{
              id: "command",
              on: "isHit",
              if: { "self.isTrigger": true },
              do: [
                { step: "control", to: "target", order: "halt" },
                { step: "control", to: "target", slow: true },
                { step: "freeReaction", to: "self" }
              ]
            }]
          }
        }
      }]
    });
    const foe = actor({ uuid: "Actor.commanded" });
    foe.createEmbeddedDocuments = vi.fn(async () => [{ uuid: "Effect.slow" }]);
    const tC = token("commander", caster, 1);
    const tF = token("commanded", foe, -1);
    placeTokens([tC, tF]);
    await runPassiveTriggers("isHit", {
      baseCtx: { triggerTokenUuid: tC.document.uuid, targetUuids: [tF.document.uuid] }
    });
    expect(foe.getFlag(MODULE_ID, "control")).toEqual(["reaction"]);
    expect(foe.createEmbeddedDocuments).toHaveBeenCalled();
    expect(caster.getFlag(MODULE_ID, "freeReaction")).toBe(true);
  });

  it("an ally of the creature that was hit can hear it, and the target cannot", async () => {
    const ally = actor({
      uuid: "Actor.bond",
      items: [listen("bond", { step: "tempHp", to: "self", value: 1 }, "isHit")]
    });
    ally.items[0].flags["illusive-dnd-5e"].triggers[0].if = { "relation.targetAlly": true };
    const target = actor({ uuid: "Actor.bondtarget" });
    const foe = actor({ uuid: "Actor.bondfoe" });
    const tA = token("bond", ally, 1);
    const tT = token("bondtarget", target, 1);
    const tF = token("bondfoe", foe, -1);
    placeTokens([tA, tT, tF]);
    await runPassiveTriggers("isHit", {
      baseCtx: { triggerTokenUuid: tF.document.uuid, targetUuids: [tT.document.uuid] }
    });
    expect(ally.applyDamage).toHaveBeenCalled();
    expect(target.applyDamage).not.toHaveBeenCalled();
  });

  it("Protection from Evil and Good strips charm from a listed creature type", async () => {
    const ward = actor({
      uuid: "Actor.ward",
      effects: [{ name: "Protection from Evil and Good" }]
    });
    ward.appliedEffects = ward.effects;
    ward.toggleStatusEffect = vi.fn(async () => {});
    const fiend = actor({ uuid: "Actor.fiend", system: { details: { type: { value: "fiend" } } } });
    const human = actor({ uuid: "Actor.human", system: { details: { type: { value: "humanoid" } } } });
    const tW = token("ward", ward, 1);
    const tFi = token("fiend", fiend, -1);
    const tH = token("human", human, -1);
    placeTokens([tW, tFi, tH]);
    expect(declarationsFor(ward, "gainsCondition").map((e) => e.decl.id)).toContain("protection-from-evil-and-good-ward");
    await runPassiveTriggers("gainsCondition", {
      baseCtx: { triggerTokenUuid: tH.document.uuid, targetUuids: [tW.document.uuid], status: "charmed" }
    });
    expect(ward.toggleStatusEffect).not.toHaveBeenCalled();
    ward.statuses.add("charmed");
    await runPassiveTriggers("gainsCondition", {
      baseCtx: { triggerTokenUuid: tFi.document.uuid, targetUuids: [tW.document.uuid], status: "charmed" }
    });
    expect(ward.toggleStatusEffect).toHaveBeenCalledWith("charmed", expect.objectContaining({ active: false }));
  });

  it("Heavy Armor Master 2014 ignores a magical weapon", async () => {
    const armor = {
      id: "ham",
      name: "Heavy Armor Master",
      system: { identifier: "heavy-armor-master", source: { rules: "2014" } }
    };
    const plate = { id: "plate2", type: "equipment", system: { equipped: true, type: { value: "heavy" } } };
    const knight = actor({
      uuid: "Actor.knight2",
      type: "character",
      items: [armor, plate]
    });
    armor.actor = knight;
    const tK = token("k2", knight, 1);
    const tA = token("a2", actor({ uuid: "Actor.a2" }), -1);
    placeTokens([tK, tA]);
    const merged = mergePatches(await runPassiveTriggers("damageKnown", {
      baseCtx: {
        triggerTokenUuid: tA.document.uuid,
        targetUuids: [tK.document.uuid],
        attackRoll: true,
        weaponAttack: true,
        damageTypes: ["slashing"],
        magical: true,
        rulesContext: { edition: "2014" }
      }
    }));
    expect(merged.damageReduceByTarget?.size ?? 0).toBe(0);
  });

  it("Dark One's Blessing ignores a hostile dropped farther than 10 feet", async () => {
    const blessing = { id: "dob2", name: "Dark One's Blessing", system: { identifier: "dark-ones-blessing" } };
    const warlock = actor({
      uuid: "Actor.w2",
      type: "character",
      items: [blessing],
      system: { abilities: { cha: { mod: 3 } }, classes: { warlock: { levels: 5 } } }
    });
    const tW = token("w2", warlock, 1);
    const tE = token("e2", actor({ uuid: "Actor.e2" }), -1);
    Object.assign(tW.document, { x: 0, y: 0, width: 1, height: 1 });
    Object.assign(tE.document, { x: 600, y: 0, width: 1, height: 1 });
    placeTokens([tW, tE]);
    await runPassiveTriggers("isDamaged", {
      baseCtx: { triggerTokenUuid: tW.document.uuid, droppedUuids: [tE.document.uuid] }
    });
    expect(warlock.applyDamage).not.toHaveBeenCalled();
  });

  it("empowered rerolls the lowest die and distant doubles a copy of the range", async () => {
    const die = { faces: 6, results: [{ result: 1 }, { result: 4 }] };
    const roll = { dice: [die], total: 5 };
    globalThis.Roll = class {
      async evaluate() { this.total = 6; return this; }
    };
    await empowerRolls([roll], 1);
    expect(die.results[0].result).toBe(6);
    expect(roll.total).toBe(10);
    const doubled = doubleRange({ range: { value: 30, long: 60 } }, { system: { range: { value: 30 } } });
    expect(doubled.activity.range).toEqual({ value: 60, long: 120 });
    expect(doubled.item.system.range.value).toBe(60);
  });

  it("readying a spell spends the slot", async () => {
    const wizard = actor({
      uuid: "Actor.ready",
      system: { spells: { spell1: { value: 2 } } }
    });
    wizard.update = vi.fn(async (data) => {
      wizard.system.spells.spell1.value = data["system.spells.spell1.value"];
    });
    const spell = { type: "spell", name: "Shield", system: { level: 1, properties: [] } };
    const held = await holdReadiedSpell(wizard, spell);
    expect(held.slotHeld).toBe(true);
    expect(wizard.system.spells.spell1.value).toBe(1);
  });

  it("a movable zone slides and terrain catches fire", async () => {
    const caster = actor({ uuid: "Actor.mover" });
    const tC = token("mover", caster, 1);
    Object.assign(tC.document, { id: "mover", x: 0, y: 0, width: 1, height: 1 });
    const region = {
      id: "mz",
      documentName: "Region",
      shapes: [{ type: "circle", x: 0, y: 0 }],
      flags: { [MODULE_ID]: { zone: { movable: true, sourceId: "mover", terrain: false, when: "turnStart" } } },
      update: vi.fn(async (data) => { region.shapes = data.shapes; })
    };
    const oil = {
      id: "oil",
      documentName: "Region",
      flags: { [MODULE_ID]: { zone: { terrain: true, when: "enter", damage: "0", burning: false } } },
      testPoint: () => true,
      update: vi.fn(async (data) => { oil.flags = data.flags; })
    };
    globalThis.canvas.scene = { grid: { size: 100, distance: 5 }, regions: [region, oil] };
    const foe = token("oilfoe", actor({ uuid: "Actor.oil" }), -1);
    Object.assign(foe.document, { x: 200, y: 0, width: 1, height: 1 });
    placeTokens([tC, foe]);
    caster.items = collection([listen("shove-zone", { step: "moveZone", feet: 5, to: "target" }, "turnStart")]);
    invalidateActor(caster);
    await runPassiveTriggers("turnStart", { baseCtx: { triggerTokenUuid: tC.document.uuid, targetUuids: [foe.document.uuid] } });
    expect(region.update).toHaveBeenCalled();
    caster.items = collection([listen("light", { step: "ignite", to: "target" }, "isHit")]);
    invalidateActor(caster);
    await runPassiveTriggers("isHit", {
      baseCtx: { triggerTokenUuid: tC.document.uuid, targetUuids: [foe.document.uuid] }
    });
    expect(oil.flags[MODULE_ID].zone.burning).toBe(true);
    expect(oil.flags[MODULE_ID].zone.damageType).toBe("fire");
  });

  it("wild shape copies the beast's attacks and drops them when the form ends", async () => {
    const priorLookup = globalThis.fromUuidSync;
    const bite = { name: "Bite", type: "weapon", system: { damage: { base: "1d8" } } };
    globalThis.fromUuidSync = (uuid) => (uuid === "Actor.wolf" ? {
      items: [bite],
      system: { attributes: { hp: { max: 30 }, movement: { walk: 40 }, senses: { darkvision: 60 } } }
    } : priorLookup?.(uuid) ?? null);
    const deleted = vi.fn(async () => {});
    const druid = actor({
      uuid: "Actor.beast",
      items: [{
        id: "beast",
        name: "Wild Shape",
        flags: {
          "illusive-dnd-5e": {
            triggers: [{
              id: "beast",
              on: "turnStart",
              if: { "self.isTrigger": true },
              do: [
                { step: "wildShape", beast: "Actor.wolf" },
                { step: "wildShape", end: true }
              ]
            }]
          }
        }
      }]
    });
    druid.createEmbeddedDocuments = vi.fn(async (embedded, data) => {
      const docs = data.map((item, i) => ({
        ...item,
        id: `made${i}`,
        uuid: `Item.made${i}`,
        documentName: embedded,
        delete: deleted
      }));
      if (embedded === "Item") druid.items = collection([...druid.items, ...docs]);
      return docs;
    });
    druid.update = vi.fn(async () => {});
    const tokenDoc = token("beast", druid, 1);
    tokenDoc.document.update = vi.fn(async () => {});
    placeTokens([tokenDoc]);
    try {
      await runPassiveTriggers("turnStart", { baseCtx: { triggerTokenUuid: tokenDoc.document.uuid } });
      expect(druid.createEmbeddedDocuments).toHaveBeenCalledWith(
        "Item",
        [expect.objectContaining({ name: "Bite", type: "weapon" })],
        expect.anything()
      );
      expect(druid.update).toHaveBeenCalledWith(
        expect.objectContaining({ "system.attributes.movement": { walk: 40 } }),
        expect.anything()
      );
      expect(deleted).toHaveBeenCalled();
    } finally {
      globalThis.fromUuidSync = priorLookup;
    }
  });

  it("reads verbal, somatic, and material, and Subtle Spell removes the first two", () => {
    const spell = {
      system: { components: { vocal: true, somatic: true, material: true } }
    };
    expect(castIsPerceptible(componentsForCast(spell, null))).toBe(true);
    expect(componentsForCast(spell, "subtle")).toEqual({
      verbal: false, somatic: false, material: true, recorded: true
    });
    const gesture = { system: { components: { vocal: true, somatic: true } } };
    expect(castIsPerceptible(componentsForCast(gesture, "subtle"))).toBe(false);
    expect(castIsPerceptible(componentsForCast({ system: { components: {} } }, null))).toBe(false);
    const silenced = actor({ uuid: "Actor.quiet", effects: [{ name: "Silence" }] });
    expect(componentBlock(silenced, componentsForCast(gesture, null))).toBe("verbal");
    expect(componentBlock(silenced, componentsForCast(gesture, "subtle"))).toBe(null);
    const busy = actor({
      uuid: "Actor.busy",
      items: [
        { type: "weapon", system: { equipped: true } },
        { type: "equipment", system: { equipped: true, type: { value: "shield" } } }
      ]
    });
    expect(componentBlock(busy, componentsForCast(gesture, null))).toBe("somatic");
    expect(componentBlock(busy, componentsForCast(gesture, "subtle"))).toBe(null);
  });

  it("Moonbeam places a beam the caster can move as a bonus action", async () => {
    const spell = { id: "mb", name: "Moonbeam", type: "spell", system: { identifier: "moonbeam" } };
    const druid = actor({
      uuid: "Actor.moon",
      type: "character",
      items: [spell],
      system: { abilities: { wis: { mod: 3 } } }
    });
    const t = token("moon", druid, 1);
    Object.assign(t.document, { id: "moon", x: 0, y: 0, width: 1, height: 1 });
    placeTokens([t]);
    const created = [];
    globalThis.canvas.scene = {
      grid: { size: 100, distance: 5 },
      createEmbeddedDocuments: vi.fn(async (_name, data) => {
        created.push(...data);
        return data.map((region, i) => ({ ...region, id: `beam${i}`, uuid: `Scene.s.Region.beam${i}` }));
      })
    };
    await runPassiveTriggers("castsSpell", {
      baseCtx: { triggerTokenUuid: t.document.uuid, itemId: "mb", activation: "action", isSpell: true }
    });
    expect(created[0].flags[MODULE_ID].zone).toMatchObject({
      when: "enterOrTurn",
      movable: true,
      move: "bonus",
      moveFeet: 60,
      damage: "2d10",
      damageType: "radiant",
      onSave: "half",
      sourceId: "moon"
    });
    globalThis.canvas.scene.regions = [{
      id: "beam0",
      name: "Moonbeam",
      documentName: "Region",
      flags: { [MODULE_ID]: { zone: created[0].flags[MODULE_ID].zone } }
    }];
    expect(zoneBonusActions(druid).map((button) => button.itemId)).toEqual(["zone:beam0"]);
  });

  it("oil catches for 5 fire damage and web is difficult terrain", async () => {
    const walker = actor({ uuid: "Actor.oily" });
    const placeable = token("oily", walker, 1);
    Object.assign(placeable.document, { x: 0, y: 0, width: 1, height: 1, actor: walker });
    const oil = {
      id: "puddle",
      documentName: "Region",
      flags: {
        [MODULE_ID]: {
          zone: { terrain: true, flammable: true, igniteDamage: "5", igniteWhen: "enterOrTurn", damage: "0", burning: false }
        }
      },
      testPoint: () => true,
      update: vi.fn(async (data) => { oil.flags = data.flags; })
    };
    globalThis.canvas.scene = { grid: { size: 100, distance: 5 }, regions: [oil] };
    placeTokens([placeable]);
    await igniteTerrain(placeable, { onlyFlammable: true });
    expect(oil.flags[MODULE_ID].zone).toMatchObject({ burning: true, damage: "5", damageType: "fire", when: "enterOrTurn" });

    const web = {
      id: "webs",
      documentName: "Region",
      flags: { [MODULE_ID]: { zone: { difficult: true } } },
      testPoint: () => true
    };
    globalThis.canvas.scene.regions = [web];
    expect(movementCostMultiplier(placeable.document)).toBe(2);
  });
});
