import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const journal = vi.hoisted(() => ({
  journalChanges: vi.fn(async () => null),
  entriesForEffects: vi.fn(() => [])
}));
vi.mock("../src/application/combat-game-log.mjs", () => journal);
vi.mock("../src/foundry/scene-adapter.mjs", () => ({
  getGridFacts: () => ({ size: 100, distance: 5 }),
  getTokenFacts: (t) => t?.facts ?? null
}));
vi.mock("../src/application/perception.mjs", () => ({
  evaluateVisibilityBetween: () => ({ result: "visible" })
}));

import { installFoundry, resetFoundry } from "./helpers.mjs";
import { CONTENT } from "../src/content/declarations.mjs";
import { declarationSpecsForWindow } from "../src/application/triggers/engine.mjs";
import { _resetTriggerIndex } from "../src/application/triggers/index.mjs";
import { createMomentScope, candidateContext } from "../src/application/reactions/candidates.mjs";
import { mergePatches, runReactionUseHooks, listMatchingActivities } from "../src/application/reactions/registry.mjs";
import { resolveCounterspell } from "../src/application/reactions/counterspell.mjs";
import { listPendingHitRiders, hasNextD20Advantage } from "../src/application/reactions/reaction-state.mjs";

function collection(list = []) {
  return Object.assign([...list], { get: (id) => list.find((x) => x.id === id) ?? null });
}

function actor({ uuid, items = [], system = {}, classes = undefined } = {}) {
  const flags = {};
  const a = {
    uuid,
    id: uuid.split(".").pop(),
    type: "character",
    items: collection(items),
    effects: collection([]),
    appliedEffects: [],
    statuses: new Set(),
    flags,
    classes,
    system: { ...system, attributes: { prof: 3, hp: { value: 20, max: 20, temp: 0 }, ...(system.attributes ?? {}) } },
    getFlag: (scope, key) => flags?.[scope]?.[key],
    setFlag: vi.fn(async (scope, key, value) => {
      flags[scope] = { ...(flags[scope] ?? {}), [key]: value };
    }),
    unsetFlag: vi.fn(async (scope, key) => {
      delete flags[scope]?.[key];
    }),
    createEmbeddedDocuments: vi.fn(async (_type, data) => data.map((d, i) => ({ ...d, uuid: `${uuid}.ActiveEffect.e${i}` })))
  };
  return a;
}

function activities(list) {
  return Object.assign(list, { get: (id) => list.find((a) => a.id === id) });
}

function item(name, { id = name.toLowerCase().replace(/\W+/g, "-"), type = "feat", system = {} } = {}) {
  return { id, name, type, system: { activities: activities([{ id: `${id}-use`, type: "utility" }]), ...system } };
}

function spell(name, level = 1) {
  return item(name, { type: "spell", system: { level } });
}

let placed = [];
function token(id, a, { col = 0, disposition = 1 } = {}) {
  const t = { id, actor: a, document: { uuid: `Scene.s.Token.${id}`, disposition }, facts: { x: col * 100, y: 0, width: 1, height: 1 } };
  placed.push(t);
  globalThis.canvas.tokens.placeables = placed;
  return t;
}

/** Specs a creature is offered at a window, and a way to use one. */
function windowFor(windowId, reactor, baseCtx) {
  const scope = createMomentScope(baseCtx);
  const ctx = candidateContext(scope, reactor, { windowId });
  const specs = declarationSpecsForWindow(windowId, reactor.actor);
  const eligible = specs.filter((s) => (!ctx.isTrigger || s.selfTrigger) && s.eligible(ctx, scope));
  return {
    ids: eligible.map((s) => s.id),
    use: async (id, extra = {}) => {
      const spec = eligible.find((s) => s.id === id);
      if (!spec) throw new Error(`${id} not offered`);
      return spec.buildPatches({ ...ctx, reactor: reactor.actor, ...extra }, scope);
    }
  };
}

function declaration(id) {
  return CONTENT.flatMap((c) => c.declarations).find((d) => d.id === id);
}

beforeEach(() => {
  installFoundry();
  _resetTriggerIndex();
  journal.journalChanges.mockClear();
  placed = [];
});

afterEach(() => {
  resetFoundry();
});

describe("reaction declarations: windows", () => {
  it("each reaction keeps its window and mode", () => {
    expect(declaration("shield")).toMatchObject({ on: "isHit", mode: "hard" });
    expect(declaration("counterspell")).toMatchObject({ on: "castsSpell", mode: "hard", range: 60, sight: true });
    expect(declaration("uncanny-dodge")).toMatchObject({ on: "damageKnown", mode: "hard" });
    expect(declaration("hellish-rebuke")).toMatchObject({ on: "isDamaged", mode: "soft" });
    expect(declaration("silvery-barbs").on).toEqual(["isHit", "savedSave", "checkSucceeded"]);
    expect(declaration("riposte")).toMatchObject({ on: "isMissed", mode: "soft", offer: "meleeWeapons" });
  });
});

describe("reaction declarations: attacks", () => {
  it("Shield: only the spell, +5 AC for the target", async () => {
    const fighter = token("f", actor({ uuid: "Actor.f", items: [item("Shield", { type: "equipment", system: { identifier: "shield" } })] }));
    const wizard = token("w", actor({ uuid: "Actor.w", items: [spell("Shield")] }));
    const orc = token("o", actor({ uuid: "Actor.o" }), { disposition: -1 });
    const hit = { triggerTokenUuid: orc.document.uuid, targetUuids: [wizard.document.uuid, fighter.document.uuid], attackRoll: true };

    expect(declarationSpecsForWindow("on-attack-hit", fighter.actor)).toEqual([]);
    const w = windowFor("on-attack-hit", wizard, hit);
    expect(w.ids).toEqual(["shield"]);
    expect(mergePatches(await w.use("shield")).acBonusByTarget.get(wizard.document.uuid)).toBe(5);
    expect(windowFor("on-attack-hit", wizard, { ...hit, targetUuids: [fighter.document.uuid] }).ids).toEqual([]);
  });

  it("Parry reads its AC bonus from the stat block", async () => {
    const parry = item("Parry", { system: { description: { value: "The knight adds 3 to its AC against one melee attack" } } });
    const knight = token("k", actor({ uuid: "Actor.k", items: [parry] }));
    const foe = token("o", actor({ uuid: "Actor.o" }), { disposition: -1 });
    const hit = { triggerTokenUuid: foe.document.uuid, targetUuids: [knight.document.uuid], attackRoll: true, melee: true };
    const [patch] = await windowFor("on-attack-hit", knight, hit).use("parry");
    expect(patch).toMatchObject({ type: "acBonus", value: 3, targetUuid: knight.document.uuid });
    expect(windowFor("on-attack-hit", knight, { ...hit, melee: false }).ids).toEqual([]);
  });

  it("Cutting Words subtracts the rolled bardic die", async () => {
    const bard = token("b", actor({
      uuid: "Actor.b",
      items: [item("Cutting Words")],
      system: { scale: { bard: { "bardic-inspiration": { die: "d8" } } } }
    }), { col: 2 });
    const foe = token("o", actor({ uuid: "Actor.o" }), { disposition: -1 });
    const [patch] = await windowFor("on-attack-hit", bard, { triggerTokenUuid: foe.document.uuid, targetUuids: [], attackRoll: true })
      .use("cutting-words");
    expect(patch).toMatchObject({ type: "attackPenalty", formula: "1d8", value: 4, source: "cutting-words" });
  });

  it("Silvery Barbs: an attack rerolls the attack; a save rerolls the d20 and grants the ally advantage", async () => {
    const sorc = token("s", actor({ uuid: "Actor.s", items: [spell("Silvery Barbs")] }), { col: 3 });
    const ally = token("a", actor({ uuid: "Actor.a" }), { col: 4 });
    const foe = token("o", actor({ uuid: "Actor.o" }), { disposition: -1 });

    const onHit = await windowFor("on-attack-hit", sorc, { triggerTokenUuid: foe.document.uuid, targetUuids: [ally.document.uuid], attackRoll: true })
      .use("silvery-barbs", { allyUuid: ally.actor.uuid });
    expect(onHit[0]).toMatchObject({ type: "rerollAttack", keep: "lower" });
    expect(mergePatches(onHit).rerollAttack).toBe(true);

    const onSave = await windowFor("on-save-success", sorc, { triggerTokenUuid: foe.document.uuid })
      .use("silvery-barbs", { allyUuid: ally.actor.uuid });
    expect(mergePatches(onSave).rerollD20).toEqual({ keep: "lower", advantage: false });
    expect(hasNextD20Advantage(ally.actor)).toBe(true);
    const flagged = journal.journalChanges.mock.calls.flatMap(([c]) => c.changes);
    expect(flagged.some((c) => c.type === "flag" && c.uuid === ally.actor.uuid)).toBe(true);

    await windowFor("on-check-success", sorc, { triggerTokenUuid: foe.document.uuid }).use("silvery-barbs");
    expect(hasNextD20Advantage(sorc.actor)).toBe(true);
  });

  it("Protection: a shield-bearer within 5 ft of the attacked ally imposes disadvantage", async () => {
    const shield = { id: "sh", type: "equipment", name: "Shield", system: { type: { value: "shield" }, equipped: true } };
    const guard = token("g", actor({ uuid: "Actor.g", items: [item("Protection"), shield] }), { col: 1 });
    const ally = token("a", actor({ uuid: "Actor.a" }), { col: 0 });
    const foe = token("o", actor({ uuid: "Actor.o" }), { col: 2, disposition: -1 });
    const declared = { triggerTokenUuid: foe.document.uuid, targetUuids: [ally.document.uuid], attackRoll: true };

    const w = windowFor("on-attack-declared", guard, declared);
    expect(w.ids).toEqual(["protection"]);
    expect(mergePatches(await w.use("protection")).attackDisadvantage).toBe(true);

    shield.system.equipped = false;
    expect(windowFor("on-attack-declared", guard, declared).ids).toEqual([]);
  });
});

describe("reaction declarations: damage", () => {
  const monkActor = (items) => actor({
    uuid: "Actor.m",
    items,
    system: { abilities: { dex: { mod: 3 }, con: { mod: 3 } } },
    classes: { monk: { system: { levels: 5 } } }
  });

  it("Deflect: Missiles vs ranged weapons, Attacks vs B/P/S, Energy vs any attack", async () => {
    const foe = token("o", actor({ uuid: "Actor.o" }), { disposition: -1 });
    const monk = token("m", monkActor([]));
    const at = (extra) => ({ triggerTokenUuid: foe.document.uuid, targetUuids: [monk.document.uuid], attackRoll: true, ...extra });
    const meleeSlash = at({ melee: true, damageTypes: ["slashing"] });
    const rangedFire = at({ ranged: true, damageTypes: ["fire"] });
    const offered = (name, ctx) => {
      monk.actor.items = collection([item(name)]);
      _resetTriggerIndex();
      return windowFor("on-damage-known", monk, ctx).ids;
    };

    expect(offered("Deflect Missiles", meleeSlash)).toEqual([]);
    expect(offered("Deflect Missiles", rangedFire)).toEqual(["deflect"]);
    expect(offered("Deflect Attacks", meleeSlash)).toEqual(["deflect"]);
    expect(offered("Deflect Attacks", rangedFire)).toEqual([]);
    expect(offered("Deflect Energy", rangedFire)).toEqual(["deflect"]);
    expect(offered("Deflect Energy", { ...rangedFire, attackRoll: false })).toEqual([]);

    // 1d10 + Dex + monk level; the average without Foundry's Roll is 5 + 3 + 5.
    const [patch] = await windowFor("on-damage-known", monk, rangedFire).use("deflect");
    expect(patch).toMatchObject({ type: "damageReduce", targetUuid: monk.document.uuid, value: 13, source: "deflect" });
  });

  it("Uncanny Dodge halves; Stone's Endurance reduces 1d12 + Con", async () => {
    const foe = token("o", actor({ uuid: "Actor.o" }), { disposition: -1 });
    const rogue = token("m", monkActor([item("Uncanny Dodge"), item("Stone's Endurance")]));
    const w = windowFor("on-damage-known", rogue, { triggerTokenUuid: foe.document.uuid, targetUuids: [rogue.document.uuid], attackRoll: true });
    expect(w.ids).toEqual(["uncanny-dodge", "stones-endurance"]);
    expect(mergePatches(await w.use("uncanny-dodge")).damageMultiplierByTarget.get(rogue.document.uuid)).toBe(0.5);
    expect((await w.use("stones-endurance"))[0]).toMatchObject({ type: "damageReduce", value: 9 });
  });

  it("Absorb Elements resists the elemental types and arms a next-turn melee rider", async () => {
    const foe = token("o", actor({ uuid: "Actor.o" }), { disposition: -1 });
    const wizard = token("w", actor({ uuid: "Actor.w", items: [spell("Absorb Elements")] }));
    const ctx = { triggerTokenUuid: foe.document.uuid, targetUuids: [wizard.document.uuid], damageTypes: ["slashing", "fire"], elemental: true };
    const patches = await windowFor("on-damage-known", wizard, ctx).use("absorb-elements", { slotLevel: 2 });
    expect(patches[0]).toMatchObject({ type: "resistTypes", value: ["fire"], targetUuid: wizard.document.uuid });
    expect(listPendingHitRiders(wizard.actor)).toEqual([
      expect.objectContaining({ source: "absorb-elements", formula: "2d6", damageType: "fire", meleeOnly: true, ownTurnOnly: true, armed: false })
    ]);
    expect(windowFor("on-damage-known", wizard, { ...ctx, elemental: false, damageTypes: ["slashing"] }).ids).toEqual([]);
  });

  it("Superior Hunter's Defense (2024 reaction) resists the hit and leaves resistance until the turn ends", async () => {
    const reactionFeature = item("Superior Hunter's Defense", {
      system: { activities: activities([{ id: "r", activation: { type: "reaction" } }]) }
    });
    const ranger = token("r", actor({ uuid: "Actor.r", items: [reactionFeature] }));
    const foe = token("o", actor({ uuid: "Actor.o" }), { disposition: -1 });
    const ctx = { triggerTokenUuid: foe.document.uuid, targetUuids: [ranger.document.uuid], damageTypes: ["fire", "cold"] };
    const [patch] = await windowFor("on-damage-known", ranger, ctx).use("superior-hunters-defense");
    expect(patch).toMatchObject({ type: "resistTypes", value: ["fire", "cold"] });
    const [, [effect]] = ranger.actor.createEmbeddedDocuments.mock.calls[0];
    expect(effect.changes.map((c) => c.value)).toEqual(["fire", "cold"]);
    expect(effect.flags["illusive-dnd-5e"].specialDuration).toEqual(["currentTurnEnd"]);

    ranger.actor.items = collection([item("Superior Hunter's Defense")]);
    _resetTriggerIndex();
    expect(declarationSpecsForWindow("on-damage-known", ranger.actor)).toEqual([]);
  });

  it("Interception reduces the damage to the ally within 5 ft", async () => {
    const guard = token("g", actor({ uuid: "Actor.g", items: [item("Interception")] }), { col: 1 });
    const ally = token("a", actor({ uuid: "Actor.a" }), { col: 0 });
    const foe = token("o", actor({ uuid: "Actor.o" }), { col: 2, disposition: -1 });
    const [patch] = await windowFor("on-damage-known", guard, { triggerTokenUuid: foe.document.uuid, targetUuids: [ally.document.uuid], attackRoll: true })
      .use("interception");
    expect(patch).toMatchObject({ type: "damageReduce", targetUuid: ally.document.uuid, value: 8 });
  });
});

describe("reaction declarations: spells, saves and falls", () => {
  it("Counterspell: 2024 save vs the reactor's DC; a failed save cancels and refunds the slot", async () => {
    const mage = token("m", actor({ uuid: "Actor.m", items: [spell("Counterspell", 3)], system: { attributes: { spell: { dc: 15 } } } }), { col: 4 });
    const caster = token("c", actor({ uuid: "Actor.c" }), { disposition: -1 });
    const w = windowFor("on-cast", mage, { triggerTokenUuid: caster.document.uuid });
    expect(w.ids).toEqual(["counterspell"]);

    const failed = await w.use("counterspell", { caster: { rollSavingThrow: async () => [{ total: 5 }] }, spellLevel: 5 });
    expect(mergePatches(failed)).toMatchObject({ cancelCast: true, refundSlot: true });
    const saved = await w.use("counterspell", { caster: { rollSavingThrow: async () => [{ total: 18 }] }, spellLevel: 5 });
    expect(mergePatches(saved).cancelCast).toBe(false);
  });

  it("Counterspell 2014: automatic up to the counter slot, else a check", async () => {
    expect(await resolveCounterspell({ spellLevel: 3, ctx: { rulesContext: { legacy: true } } }))
      .toMatchObject({ countered: true, auto: true, edition: "2014" });
    const ctx = { rulesContext: { edition: "2014" }, counterSlotLevel: 5 };
    expect(await resolveCounterspell({ spellLevel: 5, ctx })).toMatchObject({ countered: true, auto: true });
    const low = await resolveCounterspell({ spellLevel: 5, ctx: { rulesContext: { edition: "2014" } } });
    expect(low.auto).toBeUndefined();
  });

  it("Countercharm needs the 2024 reaction version; the saver may use it and rerolls with advantage", async () => {
    const v2014 = item("Countercharm", { system: { activities: activities([{ id: "a", activation: { type: "action" } }]) } });
    const v2024 = item("Countercharm", { system: { activities: activities([{ id: "a", activation: { type: "reaction" } }]) } });
    const bard = token("b", actor({ uuid: "Actor.b", items: [v2014] }));
    expect(declarationSpecsForWindow("on-save-fail", bard.actor)).toEqual([]);

    bard.actor.items = collection([v2024]);
    _resetTriggerIndex();
    const [spec] = declarationSpecsForWindow("on-save-fail", bard.actor);
    expect(spec.selfTrigger).toBe(true);
    const w = windowFor("on-save-fail", bard, { triggerTokenUuid: bard.document.uuid, charmOrFear: true });
    expect(mergePatches(await w.use("countercharm")).rerollD20).toEqual({ keep: "new", advantage: true });
    expect(windowFor("on-save-fail", bard, { triggerTokenUuid: bard.document.uuid, charmOrFear: false }).ids).toEqual([]);
  });

  it("Feather Fall zeroes the faller's damage; Slow Fall reduces by 5 × monk level", async () => {
    const faller = token("f", actor({ uuid: "Actor.f" }));
    const wizard = token("w", actor({ uuid: "Actor.w", items: [spell("Feather Fall")] }), { col: 3 });
    const fall = { triggerTokenUuid: faller.document.uuid, targetUuids: [faller.document.uuid] };
    const feather = await windowFor("on-fall", wizard, fall).use("feather-fall");
    expect(mergePatches(feather).damageMultiplierByTarget.get(faller.document.uuid)).toBe(0);

    faller.actor.items = collection([item("Slow Fall")]);
    faller.actor.classes = { monk: { system: { levels: 4 } } };
    _resetTriggerIndex();
    const [slow] = await windowFor("on-fall", faller, fall).use("slow-fall");
    expect(slow).toMatchObject({ type: "damageReduce", targetUuid: faller.document.uuid, value: 20 });
    expect(windowFor("on-fall", faller, { ...fall, triggerTokenUuid: wizard.document.uuid }).ids).toEqual([]);
  });
});

describe("reaction declarations: soft reactions", () => {
  const axe = () => ({
    id: "axe",
    name: "Battleaxe",
    type: "weapon",
    system: { equipped: true, type: { value: "martialM" }, activities: activities([{ id: "atk", type: "attack" }]) }
  });

  it("Retaliation offers equipped melee weapon attacks", () => {
    const barb = token("b", actor({ uuid: "Actor.b", items: [item("Retaliation"), axe()] }));
    const foe = token("o", actor({ uuid: "Actor.o" }), { col: 1, disposition: -1 });
    const [spec] = declarationSpecsForWindow("after-damage-applied", barb.actor);
    expect(spec).toMatchObject({ id: "retaliation", mode: "soft" });
    expect(listMatchingActivities(barb.actor, spec, {}).map((a) => a.id)).toEqual(["atk"]);
    expect(windowFor("after-damage-applied", barb, { triggerTokenUuid: foe.document.uuid, damagedActorUuids: [barb.actor.uuid] }).ids)
      .toEqual(["retaliation"]);
  });

  it("Riposte needs a superiority die; using it spends one and adds the die to the next melee hit", async () => {
    const dice = {
      id: "dice",
      name: "Superiority Dice",
      system: { uses: { max: 4, spent: 0, value: 4 } },
      update: vi.fn(async (data) => { dice.system.uses.spent = data["system.uses.spent"]; })
    };
    const weapon = axe();
    const fighter = token("f", actor({ uuid: "Actor.f", items: [item("Riposte"), dice, weapon] }));
    const foe = token("o", actor({ uuid: "Actor.o" }), { col: 1, disposition: -1 });
    const miss = { triggerTokenUuid: foe.document.uuid, targetUuids: [fighter.document.uuid], attackRoll: true, melee: true };
    expect(windowFor("on-attack-miss", fighter, miss).ids).toEqual(["riposte"]);

    const options = { triggerIds: ["riposte"], triggerTokenUuid: foe.document.uuid, windowId: "on-attack-miss", parentId: "res-9" };
    await runReactionUseHooks("before", ["riposte"], fighter.actor, item("Fire Bolt"), options);
    expect(dice.system.uses.spent).toBe(0);

    await runReactionUseHooks("before", ["riposte"], fighter.actor, weapon, options);
    expect(dice.system.uses.spent).toBe(1);
    expect(listPendingHitRiders(fighter.actor)).toEqual([
      expect.objectContaining({ source: "riposte", formula: "1d8", meleeOnly: true, armed: true })
    ]);
    expect(journal.journalChanges.mock.calls.at(-1)[0]).toMatchObject({ resolutionId: "res-9", label: "Riposte" });

    dice.system.uses = { max: 4, spent: 4, value: 0 };
    _resetTriggerIndex();
    expect(windowFor("on-attack-miss", fighter, miss).ids).toEqual([]);
  });
});
