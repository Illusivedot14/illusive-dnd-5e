import { hitPointsFromSheet, hpFromRemoved } from "./message.mjs";

/**
 * Play state shared with D&D Beyond.
 * `beyondState` reads a character GET. `foundryState` reads an actor into the same shape.
 * Reads turn the difference into Foundry updates. Writes turn it into D&D Beyond calls.
 * Both directions match items through the ids ddb-importer stored in `flags.ddbimporter`.
 */

export const CHARACTER_ENTITY_TYPE_ID = 1581111423;
export const EXHAUSTION_ID = 4;
export const CONDITION_STATUS = {
  1: "blinded",
  2: "charmed",
  3: "deafened",
  5: "frightened",
  6: "grappled",
  7: "incapacitated",
  8: "invisible",
  9: "paralyzed",
  10: "petrified",
  11: "poisoned",
  12: "prone",
  13: "restrained",
  14: "stunned",
  15: "unconscious"
};
const STATUS_CONDITION = Object.fromEntries(Object.entries(CONDITION_STATUS).map(([id, status]) => [status, Number(id)]));
const CURRENCY = ["cp", "sp", "ep", "gp", "pp"];
const SLOT_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function whole(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function stored(doc) {
  return doc?._source ?? doc ?? {};
}

function importerFlags(item) {
  return item?.flags?.ddbimporter ?? stored(item)?.flags?.ddbimporter ?? {};
}

function itemsOf(actor) {
  const items = actor?.items;
  if (!items) return [];
  return Array.isArray(items) ? items : [...(items.contents ?? items.values?.() ?? items)];
}

function useKey(entityTypeId, id) {
  return `${entityTypeId}:${id}`;
}

function rows(groups) {
  return Object.values(groups ?? {}).flatMap((list) => (Array.isArray(list) ? list : []));
}

function spellRows(character) {
  return [
    ...rows(character?.spells),
    ...(character?.classSpells ?? []).flatMap((entry) => entry?.spells ?? [])
  ];
}

function inventoryRows(character) {
  return [...(character?.inventory ?? [])];
}

/** Each Foundry item that mirrors a D&D Beyond row, by item id. */
export function linkItems(actor, character) {
  const actionsByComponent = new Map();
  const actionsById = new Map();
  for (const action of rows(character?.actions)) {
    if (!action?.limitedUse) continue;
    const target = { id: action.id, entityTypeId: action.entityTypeId };
    const component = useKey(action.componentTypeId, action.componentId);
    if (!actionsByComponent.has(component)) actionsByComponent.set(component, target);
    actionsById.set(useKey(action.entityTypeId, action.id), target);
  }
  const spells = new Map();
  for (const spell of spellRows(character)) {
    if (spell?.limitedUse) spells.set(String(spell.id), { id: spell.id, entityTypeId: spell.entityTypeId });
  }
  const inventory = new Map(inventoryRows(character).map((row) => [String(row.id), row]));
  const classes = new Map((character?.classes ?? []).map((row) => [String(row.id), row]));

  const links = {};
  for (const item of itemsOf(actor)) {
    const flags = importerFlags(item);
    if (flags.id == null) continue;
    const id = String(flags.id);
    if (item.type === "class" && classes.has(id)) {
      links[item.id] = { kind: "class", id: classes.get(id).id };
    } else if (item.type === "spell") {
      if (spells.has(id)) links[item.id] = { kind: "use", ...spells.get(id) };
    } else if (inventory.has(id) && String(inventory.get(id).entityTypeId) === String(flags.entityTypeId)) {
      const row = inventory.get(id);
      links[item.id] = { kind: "inventory", id: row.id, charges: Boolean(row.limitedUse) };
    } else {
      const target = actionsByComponent.get(useKey(flags.entityTypeId, id)) ?? actionsById.get(useKey(flags.entityTypeId, id));
      if (target) links[item.id] = { kind: "use", ...target };
    }
  }
  return links;
}

/** The shared play state of a character GET. */
export function beyondState(character) {
  const hp = hitPointsFromSheet(character);
  const ceiling = hp ? hp.max + hp.tempmax : 0;
  const slots = {};
  for (const row of character?.spellSlots ?? []) slots[whole(row.level)] = whole(row.used);
  const pact = {};
  for (const row of character?.pactMagic ?? []) pact[whole(row.level)] = whole(row.used);
  const conditions = [];
  let exhaustion = 0;
  for (const row of character?.conditions ?? []) {
    const id = whole(row?.id);
    if (id === EXHAUSTION_ID) exhaustion = whole(row.level);
    else if (CONDITION_STATUS[id]) conditions.push(id);
  }
  const uses = {};
  for (const action of rows(character?.actions)) {
    if (action?.limitedUse) uses[useKey(action.entityTypeId, action.id)] = whole(action.limitedUse.numberUsed);
  }
  for (const spell of spellRows(character)) {
    if (spell?.limitedUse) uses[useKey(spell.entityTypeId, spell.id)] = whole(spell.limitedUse.numberUsed);
  }
  const inventory = {};
  for (const row of inventoryRows(character)) {
    inventory[row.id] = {
      equipped: Boolean(row.equipped),
      attuned: Boolean(row.isAttuned),
      charges: row.limitedUse ? whole(row.limitedUse.numberUsed) : null
    };
  }
  const hitDice = {};
  for (const row of character?.classes ?? []) hitDice[row.id] = whole(row.hitDiceUsed);
  return {
    hp: hp
      ? {
        max: hp.max,
        tempmax: hp.tempmax,
        temp: hp.temp,
        removed: Math.min(Math.max(0, whole(character?.removedHitPoints)), Math.max(0, ceiling)),
        overridden: hp.overridden
      }
      : null,
    xp: whole(character?.currentXp),
    inspiration: Boolean(character?.inspiration),
    death: { fails: whole(character?.deathSaves?.failCount), successes: whole(character?.deathSaves?.successCount) },
    currency: Object.fromEntries(CURRENCY.map((key) => [key, whole(character?.currencies?.[key])])),
    slots,
    pact,
    exhaustion,
    conditions: conditions.sort((a, b) => a - b),
    hitDice,
    uses,
    inventory
  };
}

function actorStatuses(actor) {
  const statuses = actor?.statuses;
  if (statuses instanceof Set) return statuses;
  return new Set(statuses ?? []);
}

/** The actor's play state, in `beyondState` terms. `view` supplies Beyond's maximum hit points. */
export function foundryState(actor, links, view) {
  const system = stored(actor).system ?? actor?.system ?? {};
  const prepared = actor?.system ?? system;
  const hp = system.attributes?.hp ?? {};
  const tempmax = whole(hp.tempmax);
  const max = view?.hp?.max ?? whole(prepared.attributes?.hp?.max);
  const slots = {};
  for (const level of SLOT_LEVELS) {
    const slotMax = whole(prepared.spells?.[`spell${level}`]?.max);
    if (slotMax > 0) slots[level] = Math.max(0, slotMax - whole(system.spells?.[`spell${level}`]?.value));
  }
  const pact = {};
  const pactMax = whole(prepared.spells?.pact?.max);
  const pactLevel = whole(prepared.spells?.pact?.level);
  if (pactMax > 0 && pactLevel > 0) pact[pactLevel] = Math.max(0, pactMax - whole(system.spells?.pact?.value));
  const conditions = [...actorStatuses(actor)]
    .map((status) => STATUS_CONDITION[status])
    .filter(Boolean)
    .sort((a, b) => a - b);

  const hitDice = {};
  const uses = {};
  const inventory = {};
  for (const item of itemsOf(actor)) {
    const link = links?.[item.id];
    if (!link) continue;
    const itemSystem = stored(item).system ?? item.system ?? {};
    if (link.kind === "class") hitDice[link.id] = whole(itemSystem.hd?.spent);
    if (link.kind === "use") {
      const key = useKey(link.entityTypeId, link.id);
      if (!(key in uses)) uses[key] = whole(itemSystem.uses?.spent);
    }
    if (link.kind === "inventory") {
      inventory[link.id] = {
        equipped: Boolean(itemSystem.equipped),
        attuned: Boolean(itemSystem.attuned),
        charges: link.charges ? whole(itemSystem.uses?.spent) : null
      };
    }
  }
  return {
    hp: { max, tempmax, temp: Math.max(0, whole(hp.temp)), removed: Math.max(0, max + tempmax - whole(hp.value)) },
    xp: whole(system.details?.xp?.value),
    inspiration: Boolean(system.attributes?.inspiration),
    death: { fails: whole(system.attributes?.death?.failure), successes: whole(system.attributes?.death?.success) },
    currency: Object.fromEntries(CURRENCY.map((key) => [key, whole(system.currency?.[key])])),
    slots,
    pact,
    exhaustion: whole(system.attributes?.exhaustion),
    conditions,
    hitDice,
    uses,
    inventory
  };
}

/** dnd5e works out the maximum from class items unless Beyond overrides it. */
export function maxFromClasses(actor, hp) {
  if (hp?.overridden) return false;
  return itemsOf(actor).some((item) => item?.type === "class");
}

/**
 * Beyond state → Foundry changes.
 * @returns {{ actor: object, items: object[], statuses: { status: string, active: boolean }[] }}
 */
export function readChanges(actor, beyond, links) {
  const system = stored(actor).system ?? actor?.system ?? {};
  const prepared = actor?.system ?? system;
  const changes = {};
  const set = (path, current, next) => {
    if (current !== next) changes[path] = next;
  };

  if (beyond.hp) {
    const hp = system.attributes?.hp ?? {};
    const value = hpFromRemoved(beyond.hp.max + beyond.hp.tempmax, beyond.hp.removed);
    set("system.attributes.hp.value", whole(hp.value, null), value);
    set("system.attributes.hp.temp", whole(hp.temp), beyond.hp.temp);
    set("system.attributes.hp.tempmax", whole(hp.tempmax), beyond.hp.tempmax);
    if (maxFromClasses(actor, beyond.hp)) {
      if (hp.max != null) changes["system.attributes.hp.max"] = null;
    } else {
      set("system.attributes.hp.max", whole(hp.max, null), beyond.hp.max);
    }
  }
  set("system.details.xp.value", whole(system.details?.xp?.value), beyond.xp);
  set("system.attributes.inspiration", Boolean(system.attributes?.inspiration), beyond.inspiration);
  set("system.attributes.death.failure", whole(system.attributes?.death?.failure), beyond.death.fails);
  set("system.attributes.death.success", whole(system.attributes?.death?.success), beyond.death.successes);
  for (const key of CURRENCY) set(`system.currency.${key}`, whole(system.currency?.[key]), beyond.currency[key]);
  for (const level of SLOT_LEVELS) {
    const slotMax = whole(prepared.spells?.[`spell${level}`]?.max);
    if (slotMax <= 0 || !(level in beyond.slots)) continue;
    set(`system.spells.spell${level}.value`, whole(system.spells?.[`spell${level}`]?.value), Math.max(0, slotMax - beyond.slots[level]));
  }
  const pactMax = whole(prepared.spells?.pact?.max);
  const pactLevel = whole(prepared.spells?.pact?.level);
  if (pactMax > 0 && pactLevel in beyond.pact) {
    set("system.spells.pact.value", whole(system.spells?.pact?.value), Math.max(0, pactMax - beyond.pact[pactLevel]));
  }
  set("system.attributes.exhaustion", whole(system.attributes?.exhaustion), beyond.exhaustion);

  const items = [];
  for (const item of itemsOf(actor)) {
    const link = links?.[item.id];
    if (!link) continue;
    const itemSystem = stored(item).system ?? item.system ?? {};
    const update = {};
    if (link.kind === "class" && link.id in beyond.hitDice && whole(itemSystem.hd?.spent) !== beyond.hitDice[link.id]) {
      update["system.hd.spent"] = beyond.hitDice[link.id];
    }
    if (link.kind === "use") {
      const used = beyond.uses[useKey(link.entityTypeId, link.id)];
      if (used != null && itemSystem.uses && whole(itemSystem.uses.spent) !== used) update["system.uses.spent"] = used;
    }
    if (link.kind === "inventory") {
      const row = beyond.inventory[link.id];
      if (row) {
        if (Boolean(itemSystem.equipped) !== row.equipped) update["system.equipped"] = row.equipped;
        if ("attuned" in itemSystem && Boolean(itemSystem.attuned) !== row.attuned) update["system.attuned"] = row.attuned;
        if (row.charges != null && itemSystem.uses && whole(itemSystem.uses.spent) !== row.charges) {
          update["system.uses.spent"] = row.charges;
        }
      }
    }
    if (Object.keys(update).length) items.push({ _id: item.id, ...update });
  }

  const statuses = [];
  const have = actorStatuses(actor);
  for (const [id, status] of Object.entries(CONDITION_STATUS)) {
    const want = beyond.conditions.includes(Number(id));
    if (want !== have.has(status)) statuses.push({ status, active: want });
  }
  return { actor: changes, items, statuses };
}

function changedKeys(before, after) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...keys].filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]));
}

/**
 * Foundry state → D&D Beyond calls, diffed against the last known Beyond state.
 * Each call carries `commit`, which records its effect in the view once Beyond accepts it.
 * Hit dice only travel with a short rest, so they are sent when `rest` is set.
 * A long rest (`rest: "long"`) runs Beyond's own long rest first. The calls after it set Foundry's exact values,
 * so the rest leaves the bonus maximum and exhaustion alone.
 */
export function writeCalls(view, local, { characterId, rest = false } = {}) {
  const calls = [];
  const add = (method, path, body, commit) => calls.push({ method, path, body, commit });
  const totalHp = (view.hp?.max ?? 0) + (view.hp?.tempmax ?? 0);

  if (rest === "long") {
    add("POST", "character/rest/long", { resetMaxHpModifier: false, adjustConditionLevel: false }, () => {});
  }
  if (rest && changedKeys(view.hitDice, local.hitDice).length) {
    add("POST", "character/rest/short", { classHitDiceUsed: { ...local.hitDice }, resetMaxHpModifier: false }, (v) => {
      v.hitDice = { ...local.hitDice };
    });
  }
  if (view.hp) {
    if (local.hp.removed !== view.hp.removed || local.hp.temp !== view.hp.temp) {
      add("PUT", "life/hp/damage-taken", { removedHitPoints: local.hp.removed, temporaryHitPoints: local.hp.temp }, (v) => {
        v.hp = { ...v.hp, removed: local.hp.removed, temp: local.hp.temp };
      });
    }
    if (local.hp.tempmax !== view.hp.tempmax) {
      add("PUT", "life/hp/bonus", { bonusHitPoints: local.hp.tempmax }, (v) => {
        v.hp = { ...v.hp, tempmax: local.hp.tempmax };
      });
    }
  }
  if (local.xp !== view.xp) add("PUT", "character/progression", { currentXp: local.xp }, (v) => { v.xp = local.xp; });
  if (local.inspiration !== view.inspiration) {
    add("PUT", "character/inspiration", { inspiration: local.inspiration }, (v) => { v.inspiration = local.inspiration; });
  }
  if (changedKeys(view.death, local.death).length) {
    add("PUT", "life/death-saves", { failCount: local.death.fails, successCount: local.death.successes }, (v) => {
      v.death = { ...local.death };
    });
  }
  if (changedKeys(view.currency, local.currency).length) {
    add("PUT", "inventory/currency", {
      ...local.currency,
      destinationEntityTypeId: CHARACTER_ENTITY_TYPE_ID,
      destinationEntityId: Number(characterId)
    }, (v) => { v.currency = { ...local.currency }; });
  }
  const slotLevels = Object.keys(local.slots).filter((level) => local.slots[level] !== (view.slots[level] ?? 0));
  if (slotLevels.length) {
    const body = Object.fromEntries(slotLevels.map((level) => [`level${level}`, local.slots[level]]));
    add("PUT", "spell/slots", body, (v) => {
      v.slots = { ...v.slots };
      for (const level of slotLevels) v.slots[level] = local.slots[level];
    });
  }
  const pactLevels = Object.keys(local.pact).filter((level) => local.pact[level] !== (view.pact[level] ?? 0));
  if (pactLevels.length) {
    const body = Object.fromEntries(pactLevels.map((level) => [`level${level}`, local.pact[level]]));
    add("PUT", "spell/pact-magic", body, (v) => {
      v.pact = { ...v.pact };
      for (const level of pactLevels) v.pact[level] = local.pact[level];
    });
  }
  if (local.exhaustion !== view.exhaustion) {
    const commit = (v) => { v.exhaustion = local.exhaustion; };
    if (local.exhaustion > 0) add("PUT", "condition", { id: EXHAUSTION_ID, level: local.exhaustion, totalHp }, commit);
    else add("DELETE", "condition", { id: EXHAUSTION_ID }, commit);
  }
  for (const id of local.conditions) {
    if (view.conditions.includes(id)) continue;
    add("PUT", "condition", { id, level: null, totalHp }, (v) => {
      v.conditions = [...new Set([...v.conditions, id])].sort((a, b) => a - b);
    });
  }
  for (const id of view.conditions) {
    if (local.conditions.includes(id)) continue;
    add("DELETE", "condition", { id }, (v) => { v.conditions = v.conditions.filter((entry) => entry !== id); });
  }
  for (const key of Object.keys(local.uses)) {
    if (!(key in view.uses) || local.uses[key] === view.uses[key]) continue;
    const [entityTypeId, id] = key.split(":");
    add("PUT", "action/limited-use", { id: Number(id), entityTypeId: Number(entityTypeId), uses: local.uses[key] }, (v) => {
      v.uses = { ...v.uses, [key]: local.uses[key] };
    });
  }
  for (const [id, row] of Object.entries(local.inventory)) {
    const before = view.inventory[id];
    if (!before) continue;
    const commitRow = (field) => (v) => { v.inventory = { ...v.inventory, [id]: { ...v.inventory[id], [field]: row[field] } }; };
    if (row.equipped !== before.equipped) add("PUT", "inventory/item/equipped", { id: Number(id), value: row.equipped }, commitRow("equipped"));
    if (row.attuned !== before.attuned) add("PUT", "inventory/item/attuned", { id: Number(id), value: row.attuned }, commitRow("attuned"));
    if (row.charges != null && before.charges != null && row.charges !== before.charges) {
      add("PUT", "inventory/item/charge", { id: Number(id), uses: row.charges, charges: row.charges }, commitRow("charges"));
    }
  }
  return calls;
}

function nameOf(row) {
  return row?.definition?.name ?? row?.name ?? String(row?.id ?? "?");
}

/**
 * What D&D Beyond has that the actor lacks, or the reverse.
 * These need a ddb-importer re-import. The sync never creates or deletes items.
 */
export function structureGaps(actor, character) {
  const gaps = [];
  const items = itemsOf(actor);
  const flagIds = (type) => new Set(items.filter((item) => !type || item.type === type).map((item) => String(importerFlags(item).id ?? "")));

  const classItems = new Map(items.filter((item) => item.type === "class").map((item) => [String(importerFlags(item).id ?? ""), item]));
  for (const row of character?.classes ?? []) {
    const item = classItems.get(String(row.id));
    const name = nameOf(row);
    if (!item) gaps.push(`Class ${name} is missing`);
    else if (whole(stored(item).system?.levels ?? item.system?.levels) !== whole(row.level)) {
      gaps.push(`${name} is level ${whole(row.level)} on D&D Beyond and ${whole(stored(item).system?.levels ?? item.system?.levels)} in Foundry`);
    }
  }

  const beyondInventory = [...inventoryRows(character), ...(character?.customItems ?? [])];
  const anyIds = flagIds();
  for (const row of inventoryRows(character)) {
    if (!anyIds.has(String(row.id))) gaps.push(`Item ${nameOf(row)} is missing`);
  }
  const inventoryTypes = new Set(inventoryRows(character).map((row) => String(row.entityTypeId)));
  const beyondIds = new Set(beyondInventory.map((row) => String(row.id)));
  for (const item of items) {
    const flags = importerFlags(item);
    if (flags.id == null || !inventoryTypes.has(String(flags.entityTypeId))) continue;
    if (!beyondIds.has(String(flags.id))) gaps.push(`Item ${item.name} is gone from D&D Beyond`);
  }

  const spellIds = flagIds("spell");
  const seen = new Set();
  for (const row of spellRows(character)) {
    const id = String(row?.id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (!spellIds.has(id)) gaps.push(`Spell ${nameOf(row)} is missing`);
  }
  return gaps;
}
