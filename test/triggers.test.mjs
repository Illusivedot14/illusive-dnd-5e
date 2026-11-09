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
import { evaluateArithmetic, substituteRefs } from "../src/domain/triggers/formula.mjs";
import { CONTENT } from "../src/content/declarations.mjs";
import { getRule } from "../src/rules/catalog.mjs";
import { declarationsFor, _resetTriggerIndex, invalidateActor } from "../src/application/triggers/index.mjs";
import { runPassiveTriggers, declarationSpecsForWindow } from "../src/application/triggers/engine.mjs";
import { mergePatches } from "../src/application/reactions/registry.mjs";

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
});
