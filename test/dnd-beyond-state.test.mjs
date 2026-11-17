import { describe, expect, it, vi } from "vitest";
import { installFoundry } from "./helpers.mjs";
import {
  beyondState,
  foundryState,
  hpMaxGap,
  linkItems,
  readChanges,
  structureGaps,
  writeCalls
} from "../src/dnd-beyond-sync/state.mjs";
import { applyBeyondSheet } from "../src/dnd-beyond-sync/read.mjs";
import { beyondView } from "../src/dnd-beyond-sync/writeback.mjs";

const INVENTORY = 1439493548;

function sheet(overrides = {}) {
  return {
    id: 149697907,
    dateModified: "2026-11-15T03:30:28.021Z",
    baseHitPoints: 102,
    bonusHitPoints: -6,
    overrideHitPoints: null,
    removedHitPoints: 10,
    temporaryHitPoints: 0,
    currentXp: 500,
    inspiration: true,
    deathSaves: { failCount: 1, successCount: 2, isStabilized: false },
    currencies: { cp: 0, sp: 5, ep: 0, gp: 2000, pp: 1 },
    spellSlots: [{ level: 1, used: 2, available: 0 }, { level: 2, used: 0, available: 0 }],
    pactMagic: [],
    conditions: [{ id: 12, level: null }, { id: 4, level: 2 }],
    classes: [{ id: 240333990, level: 9, hitDiceUsed: 3, definition: { name: "Druid" } }],
    actions: {
      class: [{
        id: "77",
        entityTypeId: 222,
        componentId: 10292217,
        componentTypeId: 12168134,
        name: "Wild Shape",
        limitedUse: { numberUsed: 1, maxUses: 2 }
      }],
      race: [{ id: "80", entityTypeId: 222, componentId: 1, componentTypeId: 2, name: "Breath", limitedUse: null }]
    },
    spells: {
      race: [{ id: 555, entityTypeId: 435869154, limitedUse: { numberUsed: 1 }, definition: { name: "Thunderclap" } }]
    },
    classSpells: [{ characterClassId: 240333990, spells: [{ id: 21173049, definition: { name: "Absorb Elements" } }] }],
    inventory: [
      {
        id: 1106523680,
        entityTypeId: INVENTORY,
        equipped: false,
        isAttuned: true,
        limitedUse: { numberUsed: 2, maxUses: 6 },
        definition: { name: "Staff of the Woodlands" }
      },
      { id: 1104339130, entityTypeId: INVENTORY, equipped: true, isAttuned: false, limitedUse: null, definition: { name: "Traveler's Clothes" } },
      { id: 999, entityTypeId: INVENTORY, equipped: false, isAttuned: false, definition: { name: "Bag of Holding" } }
    ],
    customItems: [],
    ...overrides
  };
}

function setPath(target, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  let node = target;
  for (const key of keys) node = node[key] ??= {};
  node[last] = value;
}

function item(id, type, flags, system = {}) {
  return { id, type, name: id, flags: { ddbimporter: flags }, system };
}

function balrus({ statuses = ["poisoned"] } = {}) {
  const items = [
    item("druid", "class", { id: 240333990, entityTypeId: 1446578651 }, { levels: 9, hd: { spent: 0 } }),
    item("wildshape", "feat", { id: 10292217, entityTypeId: 12168134 }, { uses: { spent: 0, max: "2" } }),
    item("thunderclap", "spell", { id: 555, entityTypeId: 435869154 }, { uses: { spent: 0, max: "1" } }),
    item("absorb", "spell", { id: 21173049, entityTypeId: 435869154 }, {}),
    item("staff", "weapon", { id: 1106523680, entityTypeId: INVENTORY }, { equipped: true, attuned: true, uses: { spent: 0, max: 6 } }),
    item("clothes", "equipment", { id: 1104339130, entityTypeId: INVENTORY }, { equipped: false, attuned: false }),
    item("shovel", "equipment", { id: 1104339129, entityTypeId: INVENTORY }, { equipped: false, attuned: false }),
    item("homebrew", "loot", {}, {})
  ];
  const system = {
    attributes: {
      hp: { value: 96, max: null, temp: 0, tempmax: -6 },
      death: { success: 0, failure: 0 },
      inspiration: false,
      exhaustion: 0
    },
    currency: { cp: 0, sp: 0, ep: 0, gp: 2000, pp: 0 },
    details: { xp: { value: 0 } },
    spells: { spell1: { value: 4, max: 4 }, spell2: { value: 3, max: 3 }, pact: { value: 0, max: 0, level: 0 } }
  };
  const prepared = structuredClone(system);
  prepared.attributes.hp.max = 102;
  return {
    id: "balrus",
    name: "Balrus",
    type: "character",
    items,
    flags: {},
    statuses: new Set(statuses),
    effects: [],
    _source: { system },
    system: prepared
  };
}

describe("dnd beyond play state", () => {
  it("links importer items to Beyond rows", () => {
    expect(linkItems(balrus(), sheet())).toEqual({
      druid: { kind: "class", id: 240333990 },
      wildshape: { kind: "use", id: "77", entityTypeId: 222 },
      thunderclap: { kind: "use", id: 555, entityTypeId: 435869154 },
      staff: { kind: "inventory", id: 1106523680, charges: true },
      clothes: { kind: "inventory", id: 1104339130, charges: false }
    });
  });

  it("reads every shared field onto the actor", () => {
    const actor = balrus();
    const character = sheet();
    const changes = readChanges(actor, beyondState(character), linkItems(actor, character));
    expect(changes.actor).toEqual({
      "system.attributes.hp.value": 86,
      "system.details.xp.value": 500,
      "system.attributes.inspiration": true,
      "system.attributes.death.failure": 1,
      "system.attributes.death.success": 2,
      "system.currency.sp": 5,
      "system.currency.pp": 1,
      "system.spells.spell1.value": 2,
      "system.attributes.exhaustion": 2
    });
    expect(changes.items).toEqual([
      { _id: "druid", "system.hd.spent": 3 },
      { _id: "wildshape", "system.uses.spent": 1 },
      { _id: "thunderclap", "system.uses.spent": 1 },
      { _id: "staff", "system.equipped": false, "system.uses.spent": 2 },
      { _id: "clothes", "system.equipped": true }
    ]);
    expect(changes.statuses).toEqual([
      { status: "poisoned", active: false },
      { status: "prone", active: true }
    ]);
  });

  it("finds nothing to write right after a read", () => {
    const character = sheet();
    const actor = balrus({ statuses: ["prone"] });
    const links = linkItems(actor, character);
    const view = beyondState(character);
    const changes = readChanges(actor, view, links);
    const system = actor._source.system;
    for (const [path, value] of Object.entries(changes.actor)) setPath(actor._source, path, value);
    for (const update of changes.items) {
      const target = actor.items.find((entry) => entry.id === update._id);
      for (const [path, value] of Object.entries(update)) if (path !== "_id") setPath(target, path, value);
    }
    expect(system.attributes.hp.value).toBe(86);
    expect(writeCalls(view, foundryState(actor, links, view), { characterId: 149697907, rest: true })).toEqual([]);
  });

  it("turns Foundry changes into the sheet's calls", () => {
    const character = sheet();
    const actor = balrus({ statuses: ["prone", "blinded"] });
    const links = linkItems(actor, character);
    const view = beyondState(character);
    const local = foundryState(actor, links, view);
    local.hp.removed = 30;
    local.slots[1] = 3;
    local.currency.gp = 1990;
    local.exhaustion = 0;
    local.uses["222:77"] = 2;
    local.inventory[1106523680] = { equipped: true, attuned: false, charges: 4 };
    local.hitDice[240333990] = 4;
    local.death = { fails: 0, successes: 0 };
    local.inspiration = false;
    local.xp = 900;
    const calls = writeCalls(view, local, { characterId: 149697907, rest: true });
    expect(calls.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      { method: "POST", path: "character/rest/short", body: { classHitDiceUsed: { 240333990: 4 }, resetMaxHpModifier: false } },
      { method: "PUT", path: "life/hp/damage-taken", body: { removedHitPoints: 30, temporaryHitPoints: 0 } },
      { method: "PUT", path: "character/progression", body: { currentXp: 900 } },
      { method: "PUT", path: "character/inspiration", body: { inspiration: false } },
      { method: "PUT", path: "life/death-saves", body: { failCount: 0, successCount: 0 } },
      {
        method: "PUT",
        path: "inventory/currency",
        body: { cp: 0, sp: 0, ep: 0, gp: 1990, pp: 0, destinationEntityTypeId: 1581111423, destinationEntityId: 149697907 }
      },
      { method: "PUT", path: "spell/slots", body: { level1: 3 } },
      { method: "DELETE", path: "condition", body: { id: 4 } },
      { method: "PUT", path: "condition", body: { id: 1, level: null, totalHp: 96 } },
      { method: "PUT", path: "action/limited-use", body: { id: 77, entityTypeId: 222, uses: 2 } },
      { method: "PUT", path: "action/limited-use", body: { id: 555, entityTypeId: 435869154, uses: 0 } },
      { method: "PUT", path: "inventory/item/equipped", body: { id: 1104339130, value: false } },
      { method: "PUT", path: "inventory/item/equipped", body: { id: 1106523680, value: true } },
      { method: "PUT", path: "inventory/item/attuned", body: { id: 1106523680, value: false } },
      { method: "PUT", path: "inventory/item/charge", body: { id: 1106523680, uses: 4, charges: 4 } }
    ]);
    for (const call of calls) call.commit(view);
    expect(writeCalls(view, local, { characterId: 149697907, rest: true })).toEqual([]);
    expect(writeCalls(beyondState(character), local, { characterId: 149697907 }).some((call) => call.path === "character/rest/short"))
      .toBe(false);
  });

  it("sends a Foundry long rest as Beyond's long rest, then Foundry's exact values", () => {
    const character = sheet();
    const actor = balrus({ statuses: ["prone"] });
    const links = linkItems(actor, character);
    const view = beyondState(character);
    const local = foundryState(actor, links, view);
    local.hp.removed = 0;
    local.slots[1] = 0;
    local.hitDice[240333990] = 0;
    const calls = writeCalls(view, local, { characterId: 149697907, rest: "long" }).map(({ method, path, body }) => ({ method, path, body }));
    expect(calls.slice(0, 3)).toEqual([
      { method: "POST", path: "character/rest/long", body: { resetMaxHpModifier: false, adjustConditionLevel: false } },
      { method: "POST", path: "character/rest/short", body: { classHitDiceUsed: { 240333990: 0 }, resetMaxHpModifier: false } },
      { method: "PUT", path: "life/hp/damage-taken", body: { removedHitPoints: 0, temporaryHitPoints: 0 } }
    ]);
    expect(calls.some((call) => call.path === "spell/slots")).toBe(true);
    expect(writeCalls(view, local, { characterId: 149697907, rest: "short" })[0].path).toBe("character/rest/short");
    expect(writeCalls(view, local, { characterId: 149697907 }).some((call) => call.path.startsWith("character/rest/"))).toBe(false);
  });

  it("keeps a long rest queued when a short rest follows before the write", async () => {
    vi.useFakeTimers();
    const { queueBeyondWrite, rememberView } = await import("../src/dnd-beyond-sync/writeback.mjs");
    const character = sheet();
    const actor = balrus({ statuses: ["prone"] });
    rememberView("149697907", beyondState(character), linkItems(actor, character));
    const send = vi.fn(async (_id, calls) => ({ success: true, done: calls.length }));
    const options = { delay: 10, config: () => ({}), send, log: () => {} };
    void queueBeyondWrite(actor, "149697907", { ...options, rest: "long" });
    const pending = queueBeyondWrite(actor, "149697907", { ...options, rest: "short" });
    await vi.advanceTimersByTimeAsync(10);
    await pending;
    expect(send.mock.calls[0][1][0].path).toBe("character/rest/long");
    vi.useRealTimers();
  });

  it("lists what needs a re-import", () => {
    const character = sheet({
      classes: [{ id: 240333990, level: 10, hitDiceUsed: 0, definition: { name: "Druid" } }],
      classSpells: [{ characterClassId: 240333990, spells: [{ id: 21173049, definition: { name: "Absorb Elements" } }, { id: 31, definition: { name: "Moonbeam" } }] }]
    });
    expect(structureGaps(balrus(), character)).toEqual([
      "Druid is level 10 on D&D Beyond and 9 in Foundry",
      "Item Bag of Holding is missing",
      "Item shovel is gone from D&D Beyond",
      "Spell Moonbeam is missing"
    ]);
  });

  it("applies a read and records the view and the re-import list", async () => {
    const actor = balrus();
    actor.update = vi.fn(async () => {});
    actor.updateEmbeddedDocuments = vi.fn(async () => {});
    actor.createEmbeddedDocuments = vi.fn(async () => {});
    actor.deleteEmbeddedDocuments = vi.fn(async () => {});
    actor.effects = [{ id: "poison-effect", statuses: new Set(["poisoned"]) }];
    installFoundry({ actors: [actor] });
    globalThis.ActiveEffect = {
      implementation: { fromStatusEffect: vi.fn(async (status) => ({ toObject: () => ({ name: status, statuses: [status] }) })) }
    };
    const result = await applyBeyondSheet({
      message: { eventType: "character-sheet/character-update/fulfilled", characterId: "149697907" },
      config: { updateDamage: true, campaignId: "6846437" },
      mapping: { "149697907": "balrus" },
      actors: game.actors,
      fetchCharacter: async () => ({ success: true, ddb: { character: sheet() } }),
      now: 7
    });
    expect(result).toMatchObject({ ok: true, items: 5, statuses: 2, reimport: 2 });
    expect(actor.update.mock.calls[0][0]["flags.illusive-dnd-5e.beyond"]).toEqual({
      characterId: "149697907",
      campaignId: "6846437",
      modified: "2026-11-15T03:30:28.021Z",
      pulledAt: 7,
      reimport: ["Item Bag of Holding is missing", "Item shovel is gone from D&D Beyond"]
    });
    expect(actor.update.mock.calls[0][1]).toEqual({ illusiveBeyond: "read" });
    expect(actor.updateEmbeddedDocuments).toHaveBeenCalledWith("Item", expect.any(Array), { illusiveBeyond: "read" });
    expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledWith("ActiveEffect", ["poison-effect"], { illusiveBeyond: "read" });
    expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith(
      "ActiveEffect",
      [{ name: "prone", statuses: ["prone"] }],
      { illusiveBeyond: "read", keepId: true }
    );
    expect(beyondView("149697907").state.conditions).toEqual([12]);
    delete globalThis.ActiveEffect;
  });

  it("does not create poisoned again when Brother Broccoli already has dnd5epoisoned000", async () => {
    const actor = balrus({ statuses: [] });
    actor.effects = [{ id: "dnd5epoisoned000", disabled: false, statuses: [] }];
    actor.update = vi.fn(async () => {});
    actor.updateEmbeddedDocuments = vi.fn(async () => {});
    actor.createEmbeddedDocuments = vi.fn(async () => {});
    actor.deleteEmbeddedDocuments = vi.fn(async () => {});
    const character = sheet({ conditions: [{ id: 11, level: null }] });
    const changes = readChanges(actor, beyondState(character), linkItems(actor, character));
    expect(changes.statuses).not.toContainEqual({ status: "poisoned", active: true });
    installFoundry({ actors: [actor] });
    globalThis.ActiveEffect = {
      implementation: { fromStatusEffect: vi.fn(async () => ({ toObject: () => ({ _id: "dnd5epoisoned000", name: "Poisoned", statuses: ["poisoned"] }) })) }
    };
    const result = await applyBeyondSheet({
      message: { eventType: "character-sheet/character-update/fulfilled", characterId: "149491494" },
      config: { updateDamage: true, campaignId: "6846437" },
      mapping: { "149491494": "balrus" },
      actors: game.actors,
      fetchCharacter: async () => ({ success: true, ddb: { character } }),
      now: 7
    });
    expect(result.ok).toBe(true);
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
    delete globalThis.ActiveEffect;
  });

  it("gives Foundry a fresh options object on every call, as Foundry writes parent into it", async () => {
    const actor = balrus();
    const seen = [];
    const foundryLike = (options) => {
      expect(options.parent).toBeUndefined();
      seen.push(options);
      options.parent = actor;
    };
    actor.update = vi.fn(async (data, options) => { data._id = actor.id; foundryLike(options); });
    actor.updateEmbeddedDocuments = vi.fn(async (_name, _data, options) => foundryLike(options));
    actor.createEmbeddedDocuments = vi.fn(async (_name, _data, options) => foundryLike(options));
    actor.deleteEmbeddedDocuments = vi.fn(async (_name, _ids, options) => foundryLike(options));
    actor.effects = [{ id: "poison-effect", statuses: new Set(["poisoned"]) }];
    installFoundry({ actors: [actor] });
    globalThis.ActiveEffect = {
      implementation: { fromStatusEffect: vi.fn(async (status) => ({ toObject: () => ({ name: status, statuses: [status] }) })) }
    };
    const read = () => applyBeyondSheet({
      message: { eventType: "character-sheet/character-update/fulfilled", characterId: "149697907" },
      config: { updateDamage: true, campaignId: "6846437" },
      mapping: { "149697907": "balrus" },
      actors: game.actors,
      fetchCharacter: async () => ({ success: true, ddb: { character: sheet() } }),
      now: 7
    });
    const result = await read();
    await read();
    expect(new Set(seen).size).toBe(seen.length);
    expect(result.changed).not.toContain("_id");
    delete globalThis.ActiveEffect;
  });

  it("writes Brother Broccoli at 72 of 75 and leaves the potion healing out of his maximum", async () => {
    const actor = balrus({ statuses: ["prone"] });
    actor.name = "Brother Broccoli";
    actor.system.attributes.hp.max = 75;
    actor.system.attributes.hp.value = 75;
    actor.system.attributes.hp.tempmax = 0;
    actor._source.system.attributes.hp.value = 75;
    actor._source.system.attributes.hp.tempmax = 0;
    actor._source.system.attributes.exhaustion = 2;
    actor.effects = [];
    const character = sheet({
      id: 149491494,
      baseHitPoints: 48,
      bonusHitPoints: null,
      removedHitPoints: 3,
      temporaryHitPoints: 0,
      stats: [{ id: 3, value: 16 }],
      classes: [{ id: 240333990, level: 9, hitDiceUsed: 3, definition: { name: "Warlock" } }],
      modifiers: {
        item: [
          { type: "bonus", subType: "hit-points", value: null, fixedValue: 4, isGranted: true, componentId: 5133, dice: { diceCount: 4, diceString: "4d4 + 4" } },
          { type: "bonus", subType: "hit-points", value: null, fixedValue: 2, isGranted: true, componentId: 8960641, dice: { diceCount: 2, diceString: "2d4 + 2" } }
        ]
      }
    });
    expect(hpMaxGap(actor, beyondState(character))).toBe(0);
    actor.update = vi.fn(async () => {});
    actor.updateEmbeddedDocuments = vi.fn(async () => {});
    actor.createEmbeddedDocuments = vi.fn(async () => {});
    actor.deleteEmbeddedDocuments = vi.fn(async () => {});
    installFoundry({ actors: [actor] });
    const result = await applyBeyondSheet({
      message: { eventType: "character-sheet/character-update/fulfilled", characterId: "149491494" },
      config: { updateDamage: true, campaignId: "6846437" },
      mapping: { "149491494": "balrus" },
      actors: game.actors,
      fetchCharacter: async () => ({ success: true, ddb: { character } }),
      now: 7
    });
    expect(result).toMatchObject({ ok: true, value: 72, max: 75 });
    expect(actor.update.mock.calls[0][0]["system.attributes.hp.value"]).toBe(72);
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });
});
