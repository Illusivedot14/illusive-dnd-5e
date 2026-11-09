import { getClassResources, getPactMagic, buildSpellSlotDiamondsForLevel } from "../../../foundry/actor-resources.mjs";
import { resolvePortraitSrc } from "../../../foundry/actor-data.mjs";
import { canPullActorFromDdb, readDdbCharacterId } from "../../../foundry/ddb-pull.mjs";
import { illusiveDnd } from "../../../i18n/index.mjs";
import { listActivities } from "../../../application/ability.mjs";
import { ABILITY_ORDER, SKILL_ORDER, abilityLabel, formatMod, skillLabel } from "../../../foundry/actor-stats.mjs";
import { primarySpeed, senseRange } from "../../../domain/combat/actor-paths.mjs";

const TABS = ["abilities", "combat", "inventory", "features", "spells", "effects", "other"];

function itemImg(item) {
  return item?.img || "icons/svg/item-bag.svg";
}

function usesLabel(item) {
  const uses = item?.system?.uses;
  if (!uses || uses.max == null || Number(uses.max) <= 0) return null;
  return `${uses.value ?? 0}/${uses.max ?? 0}`;
}

function activityCount(item) {
  const acts = item?.system?.activities;
  if (typeof acts?.size === "number") return acts.size;
  return listActivities(item).length;
}

function itemTypeLabel(type) {
  const key = String(type ?? "").trim();
  if (!key) return "";
  const cfg = CONFIG.Item?.typeLabels?.[key] ?? CONFIG.DND5E?.itemTypes?.[key];
  if (cfg) {
    const localized = game.i18n?.localize?.(cfg);
    if (localized && localized !== cfg) return localized;
    if (typeof cfg === "string" && !cfg.includes(".")) return cfg;
  }
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function featureSubtitle(item) {
  if (item?.type === "feat") {
    const featType = item.system?.type;
    const value = typeof featType === "object" ? featType?.value : featType;
    if (value) {
      const label = CONFIG.DND5E?.featureTypes?.[value]?.label;
      if (label) {
        const localized = game.i18n?.localize?.(label);
        if (localized) return localized;
      }
      return itemTypeLabel(value);
    }
  }
  return itemTypeLabel(item?.type);
}

/** Usable: weapons/spells/consumables, or items that actually have a useable activity/charges. */
export function canUseItem(item) {
  if (!item) return false;
  if (item.type === "weapon" || item.type === "spell" || item.type === "consumable") return true;
  if (activityCount(item) > 0) return true;
  const uses = item.system?.uses;
  if (uses && Number(uses.max) > 0) return true;
  return false;
}

function allItems(actor) {
  return actor.items?.contents ?? [...(actor.items ?? [])];
}

function mapItem(item, extras = {}) {
  const activities = listActivities(item);
  const attack = activities.find((a) => a.type === "attack");
  const damage = activities.find((a) => a.type === "damage" || a.type === "heal" || a.damage);
  // itemName avoids Handlebars {{name}} colliding with the sheet root actor name.
  const itemName = String(item?.name ?? item?.label ?? "").trim() || "Unnamed";
  const typeLabel = extras.typeLabel ?? featureSubtitle(item);
  return {
    id: item.id,
    name: itemName,
    itemName,
    img: itemImg(item),
    type: item.type,
    typeLabel,
    equipped: Boolean(item.system?.equipped),
    quantity: item.system?.quantity ?? 1,
    uses: usesLabel(item),
    canUse: canUseItem(item),
    canEquip: "equipped" in (item.system ?? {}),
    subtitle: extras.subtitle ?? typeLabel,
    attackMod: attack?.labels?.modifier ?? attack?.attack?.bonus ?? null,
    ...extras,
    // Keep capitalized labels authoritative even if extras spread overwrote them.
    typeLabel: extras.typeLabel ?? typeLabel,
    subtitle: extras.subtitle ?? typeLabel
  };
}

function spellLevelLabel(level) {
  if (level === 0) return "Cantrips";
  return `Level ${level}`;
}

function classRaceText(actor) {
  const classes = allItems(actor)
    .filter((item) => item.type === "class")
    .map((item) => {
      const levels = item.system?.levels ?? item.system?.level;
      return levels != null ? `${item.name} ${levels}` : item.name;
    });
  const race = allItems(actor).find((item) => item.type === "race")?.name
    ?? actor.system?.details?.race
    ?? "";
  const bits = [];
  if (classes.length) bits.push(classes.join(" / "));
  if (race) bits.push(typeof race === "string" ? race : race.name ?? "");
  return bits.filter(Boolean).join(" · ");
}

function buildHitDice(actor) {
  const classes = allItems(actor).filter((item) => item.type === "class");
  if (!classes.length) {
    const hd = actor.system?.attributes?.hd;
    if (!hd) return null;
    const max = Number(hd.max) || 0;
    const value = Number(hd.value ?? max) || 0;
    if (!max) return null;
    return { value, max, label: `Hit Dice ${value}/${max}` };
  }

  let max = 0;
  let available = 0;
  for (const cls of classes) {
    const levels = Number(cls.system?.levels ?? 0) || 0;
    const spent = Number(cls.system?.hitDiceUsed ?? cls.system?.hd?.spent ?? 0) || 0;
    max += levels;
    available += Math.max(0, levels - spent);
  }
  if (!max) return null;
  return { value: available, max, label: `Hit Dice ${available}/${max}` };
}

function buildSenses(actor) {
  const senses = actor.system?.attributes?.senses;
  if (!senses) return [];
  const units = senses.units || "ft";
  const out = [];
  for (const key of ["darkvision", "blindsight", "tremorsense", "truesight"]) {
    const range = senseRange(senses, key);
    if (range > 0) out.push(`${CONFIG.DND5E?.senses?.[key]?.label ?? key} ${range} ${units}`);
  }
  if (senses.special) out.push(String(senses.special));
  return out;
}

function buildSpellSlots(actor) {
  const spells = actor.system?.spells ?? {};
  const slots = [];
  for (let level = 1; level <= 9; level += 1) {
    const entry = spells[`spell${level}`];
    const max = Number(entry?.max) || 0;
    if (max <= 0) continue;
    const value = Math.max(0, Math.min(max, Number(entry?.value) || 0));
    const diamonds = buildSpellSlotDiamondsForLevel(actor, level);
    slots.push({
      level,
      label: `L${level}`,
      value,
      max,
      diamonds: Array.isArray(diamonds) ? diamonds : null
    });
  }
  const pact = getPactMagic(actor);
  return { slots, pact };
}

/**
 * Death-save pips. Index 0 = innermost (next to skull), fills first.
 * @param {number} filled  How many are lit (0–3)
 * @param {"inward-left"|"inward-right"} side
 *   success (left of skull): render outer→inner so fills grow toward the skull from the left
 *   failure (right of skull): render inner→outer so fills grow away from the skull
 */
function deathPips(filled, side = "inward-right") {
  const n = Math.max(0, Math.min(3, Number(filled) || 0));
  const order = side === "inward-left" ? [2, 1, 0] : [0, 1, 2];
  return order.map((index) => ({ index, filled: index < n }));
}

/**
 * Amethyst-style context for Illusive mobile sheet.
 * @param {Actor} actor
 * @param {{ tab?: string }} [options]
 */
export function buildMobileSheetContext(actor, options = {}) {
  if (!actor) return null;

  const tab = TABS.includes(options.tab) ? options.tab : "abilities";
  const hp = actor.system?.attributes?.hp ?? {};
  const movement = actor.system?.attributes?.movement ?? {};
  const death = actor.system?.attributes?.death ?? {};
  const items = allItems(actor);

  const hpValue = Number(hp.value) || 0;
  const hpMax = Number(hp.max) || 0;
  const hpTemp = Number(hp.temp) || 0;
  const hpTempmax = Number(hp.tempmax) || 0;
  const effectiveMax = Math.max(0, hpMax + hpTempmax);
  const hpPercent = effectiveMax > 0 ? Math.max(0, Math.min(100, Math.round((hpValue / effectiveMax) * 100))) : 0;
  const tempPercent = effectiveMax > 0 && hpTemp > 0
    ? Math.max(0, Math.min(100 - hpPercent, Math.round((hpTemp / effectiveMax) * 100)))
    : 0;

  const abilities = ABILITY_ORDER
    .filter((id) => actor.system?.abilities?.[id])
    .map((id) => {
      const ab = actor.system.abilities[id];
      const save = ab.save?.value ?? ab.save ?? ab.mod;
      return {
        id,
        label: abilityLabel(id),
        abbr: (CONFIG.DND5E?.abilities?.[id]?.abbreviation ?? id).toUpperCase(),
        value: ab.value ?? 10,
        checkMod: formatMod(ab.mod),
        saveMod: formatMod(typeof save === "object" ? save.value ?? ab.mod : save),
        proficientSave: Boolean(ab.proficient || ab.save?.proficient)
      };
    });

  const skills = SKILL_ORDER
    .filter((id) => actor.system?.skills?.[id])
    .map((id) => {
      const sk = actor.system.skills[id];
      const proficient = (sk.proficient ?? sk.value ?? 0) > 0;
      return {
        id,
        label: skillLabel(id),
        ability: (sk.ability ?? CONFIG.DND5E?.skills?.[id]?.ability ?? "").toUpperCase(),
        mod: formatMod(sk.total ?? sk.mod),
        proficient,
        expertise: (sk.proficient ?? sk.value ?? 0) >= 2
      };
    });

  const combat = items
    .filter((item) => {
      if (item.type === "weapon") return true;
      if (item.type === "feat" && canUseItem(item)) {
        const actTypes = listActivities(item).map((a) => a.type);
        return actTypes.some((t) => ["attack", "damage", "heal", "save", "utility"].includes(t));
      }
      return false;
    })
    .sort((a, b) => Number(b.system?.equipped) - Number(a.system?.equipped) || (a.sort ?? 0) - (b.sort ?? 0))
    .map((item) => mapItem(item));

  const inventory = items
    .filter((item) => ["weapon", "equipment", "consumable", "tool", "container", "loot"].includes(item.type))
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name))
    .map((item) => mapItem(item));

  const features = items
    .filter((item) => ["feat", "race", "background", "class", "subclass"].includes(item.type))
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name))
    .map((item) => mapItem(item));

  const spellsByLevel = {};
  for (const item of items) {
    if (item.type !== "spell") continue;
    const level = Number(item.system?.level ?? 0);
    const mode = item.system?.preparation?.mode;
    const always = ["always", "innate", "atwill", "pact"].includes(mode);
    const prepared = always || Boolean(item.system?.preparation?.prepared);
    const canPrepare = mode === "prepared" || (mode == null && level > 0);
    const key = String(level);
    if (!spellsByLevel[key]) {
      spellsByLevel[key] = { level, label: spellLevelLabel(level), spells: [] };
    }
    spellsByLevel[key].spells.push({
      ...mapItem(item),
      level,
      prepared: always ? true : prepared,
      always,
      canPrepare: canPrepare && !always,
      mode: mode || "prepared"
    });
    // mapItem already sets itemName; keep explicit for template clarity.
  }
  const spellLevels = Object.values(spellsByLevel).sort((a, b) => a.level - b.level);
  const { slots: spellSlots, pact } = buildSpellSlots(actor);

  const effects = [...(actor.effects?.contents ?? actor.effects ?? [])]
    .filter((effect) => !effect.getFlag?.("dnd5e", "type") || true)
      .map((effect) => ({
        id: effect.id,
        name: effect.name,
        itemName: String(effect.name ?? "").trim() || "Effect",
        img: effect.img || effect.icon || "icons/svg/aura.svg",
        disabled: Boolean(effect.disabled),
        duration: effect.duration?.label || null,
        isTemporary: Boolean(effect.isTemporary ?? (effect.duration?.rounds || effect.duration?.seconds))
      }));

  const currency = Object.entries(actor.system?.currency ?? {})
    .filter(([, amount]) => Number(amount) !== 0)
    .map(([key, amount]) => ({
      key,
      amount: Number(amount) || 0,
      label: CONFIG.DND5E?.currencies?.[key]?.abbreviation
        ?? CONFIG.DND5E?.currencies?.[key]?.label
        ?? key.toUpperCase()
    }));

  const resources = getClassResources(actor);
  const hitDice = buildHitDice(actor);
  const senses = buildSenses(actor);
  const passive = actor.system?.skills?.prc?.passive
    ?? actor.system?.attributes?.senses?.passivePerception
    ?? null;

  const deathSuccess = Number(death.success) || 0;
  const deathFailure = Number(death.failure) || 0;
  const showDeathSaves = hpValue <= 0;
  const tabs = Object.fromEntries(TABS.map((id) => [id, id === tab]));

  return {
    actorId: actor.id,
    name: actor.name,
    img: resolvePortraitSrc(actor),
    subtitle: classRaceText(actor),
    isOwner: actor.isOwner,
    tab,
    tabs,
    hp: {
      value: hpValue,
      max: hpMax,
      temp: hpTemp,
      tempmax: hpTempmax,
      effectiveMax,
      percent: hpPercent,
      tempPercent,
      hasTempMax: hpTempmax !== 0
    },
    ac: actor.system?.attributes?.ac?.value ?? "—",
    speed: primarySpeed(movement),
    initiative: formatMod(
      actor.system?.attributes?.init?.total
      ?? actor.system?.attributes?.init?.mod
      ?? actor.system?.attributes?.initiative?.mod
    ),
    proficiency: formatMod(actor.system?.attributes?.prof),
    inspiration: Boolean(actor.system?.attributes?.inspiration),
    death: {
      success: deathSuccess,
      failure: deathFailure,
      successPips: deathPips(deathSuccess, "inward-left"),
      failurePips: deathPips(deathFailure, "inward-right"),
      dead: deathFailure >= 3,
      stabilized: deathSuccess >= 3
    },
    showDeathSaves,
    abilities,
    skills,
    combat,
    inventory,
    features,
    spellLevels,
    spellSlots,
    pact,
    effects,
    currency,
    resources,
    hitDice,
    senses,
    passive,
    canPullDdb: canPullActorFromDdb(actor),
    ddbUrl: Boolean(readDdbCharacterId(actor)),
    labels: {
      pullDdb: illusiveDnd.mobileSheet("pullDdb"),
      openDdb: illusiveDnd.mobileSheet("openDdb")
    },
    biography: actor.system?.details?.biography?.value || "",
    appearance: actor.system?.details?.appearance || "",
    trait: actor.system?.details?.trait || "",
    ideal: actor.system?.details?.ideal || "",
    bond: actor.system?.details?.bond || "",
    flaw: actor.system?.details?.flaw || ""
  };
}

