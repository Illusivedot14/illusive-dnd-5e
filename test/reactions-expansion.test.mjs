import { describe, it, expect, beforeEach } from "vitest";
import {
  getReactionSpec,
  listReactionsForWindow,
  listMatchingActivities,
  buildReactionPatches,
  resolveCounterspell,
  mergePatches,
  runReactionUseHooks
} from "../src/application/reactions/registry.mjs";
import { damageTargetsFromPatches } from "../src/application/reactions/window.mjs";
import {
  hasNextD20Advantage,
  consumeNextD20Advantage,
  addPendingHitRider,
  takePendingHitRiders,
  tickPendingHitRiders,
  listPendingHitRiders,
  setReadiedAction,
  getReadiedAction
} from "../src/application/reactions/reaction-state.mjs";
import { collectSaveModifiers } from "../src/application/roll-modifiers.mjs";
import { noteFall, takeFallFor, _resetFalls } from "../src/application/falling.mjs";
import { appliesCharmOrFear } from "../src/application/save-resolve.mjs";
import { getRule } from "../src/rules/catalog.mjs";
import { REACTION_REGISTRY } from "../src/application/reactions/registry.mjs";

function makeActor({ items = [], system = {}, uuid = "Actor.a" } = {}) {
  const flags = {};
  return {
    uuid,
    id: uuid.split(".").pop(),
    system,
    items: Object.assign(items, { get: (id) => items.find((i) => i.id === id) }),
    getFlag: (_scope, key) => flags[key],
    setFlag: async (_scope, key, value) => { flags[key] = value; },
    unsetFlag: async (_scope, key) => { delete flags[key]; },
    _flags: flags
  };
}

function activities(list) {
  return Object.assign(list, { get: (id) => list.find((a) => a.id === id) });
}

describe("reaction expansion", () => {
  beforeEach(() => {
    _resetFalls();
  });

  it("every spec cites a catalog rule", () => {
    for (const spec of Object.values(REACTION_REGISTRY)) {
      expect(getRule(spec.rule), spec.id).toBeTruthy();
    }
  });

  it("Silvery Barbs covers attacks, saves, and checks", () => {
    for (const w of ["on-attack-hit", "on-save-success", "on-check-success"]) {
      expect(listReactionsForWindow(w).map((s) => s.id)).toContain("silvery-barbs");
    }
  });

  it("Silvery Barbs on a save rerolls the d20 and grants the reactor advantage", async () => {
    const reactor = makeActor();
    const patches = await buildReactionPatches("silvery-barbs", { windowId: "on-save-success", reactor });
    expect(patches[0]).toMatchObject({ type: "rerollD20", keep: "lower" });
    expect(mergePatches(patches).rerollD20).toEqual({ keep: "lower", advantage: false });
    expect(hasNextD20Advantage(reactor)).toBe(true);
    expect(collectSaveModifiers({ actor: reactor, ability: "dex" })).toMatchObject({ advantage: true });
    await consumeNextD20Advantage(reactor);
    expect(hasNextD20Advantage(reactor)).toBe(false);
  });

  it("Countercharm needs the 2024 reaction version and rerolls with advantage", async () => {
    const spec = getReactionSpec("countercharm");
    const v2014 = { name: "Countercharm", system: { activities: activities([{ id: "a", activation: { type: "action" } }]) } };
    const v2024 = { name: "Countercharm", system: { activities: activities([{ id: "a", activation: { type: "reaction" } }]) } };
    expect(spec.match(v2014)).toBe(false);
    expect(spec.match(v2024)).toBe(true);
    expect(spec.selfTrigger).toBe(true);
    const merged = mergePatches(await buildReactionPatches("countercharm", {}));
    expect(merged.rerollD20).toEqual({ keep: "new", advantage: true });
  });

  it("2014 Counterspell auto-counters up to the slot it was cast with", async () => {
    const ctx = { rulesContext: { edition: "2014" }, counterSlotLevel: 5 };
    expect(await resolveCounterspell({ spellLevel: 5, ctx })).toMatchObject({ countered: true, auto: true });
    const low = await resolveCounterspell({ spellLevel: 5, ctx: { rulesContext: { edition: "2014" } } });
    expect(low.auto).toBeUndefined();
  });

  it("Absorb Elements leaves a next-turn melee rider of the absorbed type", async () => {
    const reactor = makeActor();
    await buildReactionPatches("absorb-elements", { reactor, damageTypes: ["fire"], slotLevel: 2, targetUuid: "T" });
    expect(listPendingHitRiders(reactor)).toEqual([
      expect.objectContaining({ formula: "2d6", damageType: "fire", meleeOnly: true, ownTurnOnly: true, armed: false })
    ]);
    expect(await takePendingHitRiders(reactor, { melee: true, ownTurn: true })).toEqual([]);
    await tickPendingHitRiders(reactor);
    expect(await takePendingHitRiders(reactor, { melee: false, ownTurn: true })).toEqual([]);
    const taken = await takePendingHitRiders(reactor, { melee: true, ownTurn: true });
    expect(taken).toHaveLength(1);
    expect(listPendingHitRiders(reactor)).toEqual([]);
  });

  it("an armed next-turn rider lapses at the following turn start", async () => {
    const reactor = makeActor();
    await addPendingHitRider(reactor, { source: "absorb-elements", formula: "1d6", ownTurnOnly: true });
    await tickPendingHitRiders(reactor);
    await tickPendingHitRiders(reactor);
    expect(listPendingHitRiders(reactor)).toEqual([]);
  });

  it("Riposte spends a superiority die and adds it to the next melee hit", async () => {
    const dice = {
      name: "Superiority Dice",
      system: { uses: { max: 4, spent: 0, value: 4 } },
      update: async (data) => { dice.system.uses.spent = data["system.uses.spent"]; }
    };
    const actor = makeActor({ items: [dice, { name: "Riposte" }] });
    await runReactionUseHooks("before", ["riposte"], actor, null);
    expect(dice.system.uses.spent).toBe(1);
    const [rider] = await takePendingHitRiders(actor, { melee: true });
    expect(rider).toMatchObject({ source: "riposte", formula: "1d8" });
  });

  it("Riposte offers equipped melee weapon attacks", () => {
    const axe = {
      id: "axe",
      type: "weapon",
      system: { equipped: true, type: { value: "martialM" }, activities: activities([{ id: "atk", type: "attack" }]) }
    };
    const actor = makeActor({ items: [axe, { name: "Riposte" }] });
    const acts = listMatchingActivities(actor, getReactionSpec("riposte"), {});
    expect(acts.map((a) => a.id)).toEqual(["atk"]);
  });

  it("Ready offers the readied activity only on its trigger window and range", async () => {
    const bow = { id: "bow", system: { activities: activities([{ id: "shoot", type: "attack" }]) } };
    const actor = makeActor({ items: [bow] });
    await setReadiedAction(actor, { text: "", trigger: "move", itemId: "bow", activityId: "shoot", rangeFeet: 30 });
    const spec = getReactionSpec("ready");
    expect(listMatchingActivities(actor, spec, { windowId: "after-move", distanceToTrigger: 20 })).toHaveLength(1);
    expect(listMatchingActivities(actor, spec, { windowId: "after-move", distanceToTrigger: 40 })).toHaveLength(0);
    expect(listMatchingActivities(actor, spec, { windowId: "on-cast", distanceToTrigger: 20 })).toHaveLength(0);
    expect(listMatchingActivities(actor, spec, { windowId: "after-move", hostile: false })).toHaveLength(0);
    await runReactionUseHooks("after", ["ready"], actor, bow);
    expect(getReadiedAction(actor)).toBeNull();
  });

  it("Stone's Endurance, Slow Fall, and Parry patch values", async () => {
    const goliath = makeActor({ system: { abilities: { con: { mod: 3 } } } });
    const [stone] = await buildReactionPatches("stones-endurance", { reactor: goliath, targetUuid: "T" });
    expect(stone).toMatchObject({ type: "damageReduce", targetUuid: "T", value: 9 });

    const monk = makeActor();
    monk.classes = { monk: { system: { levels: 4 } } };
    const [slow] = await buildReactionPatches("slow-fall", { reactor: monk, targetUuid: "T" });
    expect(slow).toMatchObject({ type: "damageReduce", value: 20 });

    const knight = makeActor({
      items: [{ name: "Parry", system: { description: { value: "The knight adds 3 to its AC against one melee attack" } } }],
      system: { attributes: { prof: 2 } }
    });
    const [parry] = await buildReactionPatches("parry", { reactor: knight, targetUuid: "T" });
    expect(parry).toMatchObject({ type: "acBonus", value: 3 });
  });

  it("Feather Fall zeroes the fall damage for the faller", async () => {
    const patches = await buildReactionPatches("feather-fall", { targetUuids: ["Fall.T"] });
    const merged = mergePatches(patches);
    expect(merged.damageMultiplierByTarget.get("Fall.T")).toBe(0);
    expect(damageTargetsFromPatches(["Fall.T"], merged)[0].multiplier).toBe(0);
  });

  it("Protection imposes disadvantage", async () => {
    expect(mergePatches(await buildReactionPatches("protection", {})).attackDisadvantage).toBe(true);
    const spec = getReactionSpec("protection");
    const shield = { type: "equipment", system: { type: { value: "shield" }, equipped: true } };
    const ctx = { isTarget: false, nearTargetUuid: "Ally", hostile: true, actor: makeActor({ items: [shield] }) };
    expect(spec.eligible(ctx)).toBe(true);
    expect(spec.eligible({ ...ctx, actor: makeActor() })).toBe(false);
  });

  it("matches a dnd5e fall to its damage roll", () => {
    globalThis.game = { user: { id: "me" } };
    noteFall({ uuid: "Scene.s.Token.t" }, { dnd5e: { fall: { distance: 30 } } }, "me");
    expect(takeFallFor([{ options: { type: "fire" } }])).toBeNull();
    expect(takeFallFor([{ options: { type: "bludgeoning" } }])).toMatchObject({ tokenUuid: "Scene.s.Token.t", distance: 30 });
    expect(takeFallFor([{ options: { type: "bludgeoning" } }])).toBeNull();
    noteFall({ uuid: "Scene.s.Token.t" }, { dnd5e: { fall: { distance: 30 } } }, "someone-else");
    expect(takeFallFor([{ options: { type: "bludgeoning" } }])).toBeNull();
    delete globalThis.game;
  });

  it("detects charm and fear save effects", () => {
    const fear = { statuses: new Set(["frightened"]) };
    expect(appliesCharmOrFear({ effects: [{ effect: fear }], item: { name: "Cause Fear" } })).toBe(true);
    expect(appliesCharmOrFear({ effects: [], item: { name: "Fireball" } })).toBe(false);
  });
});
