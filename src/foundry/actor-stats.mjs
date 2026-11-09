import { illusiveDndCore } from "../i18n/index.mjs";
import { movementSpeed, senseRange } from "../domain/combat/actor-paths.mjs";

export const ABILITY_ORDER = ["str", "dex", "con", "int", "wis", "cha"];
export const SKILL_ORDER = [
  "acr", "ani", "arc", "ath", "dec", "his", "ins", "itm", "inv",
  "med", "nat", "prc", "prf", "per", "rel", "slt", "ste", "sur"
];

export function abilityLabel(id) {
  return CONFIG.DND5E?.abilities?.[id]?.label ?? String(id ?? "").toUpperCase();
}

export function skillLabel(id) {
  return CONFIG.DND5E?.skills?.[id]?.label ?? String(id ?? "").toUpperCase();
}

export function formatMod(value, empty = "—") {
  if (!Number.isFinite(Number(value))) return empty;
  const n = Math.floor(Number(value));
  return n >= 0 ? `+${n}` : `${n}`;
}

export function statPercent(stat) {
  if (!stat?.max || stat.max <= 0) return 0;
  return Math.max(0, Math.min(100, (stat.value / stat.max) * 100));
}

/**
 * Damage-wash stop for portrait CSS (`--illusive-dnd-hp-pct`).
 * Uses remaining HP percent so the red fill tracks the missing health (party-style).
 * @param {number} hpPercent
 * @returns {number} CSS percent
 */
export function getDamageWashCssPct(hpPercent) {
  return Math.max(0, Math.min(100, Number(hpPercent) || 0));
}

export function getHpBarData(actor) {
  const hp = actor?.system?.attributes?.hp ?? {};
  const value = hp.value ?? 0;
  const max = hp.max ?? 0;
  const temp = hp.temp ?? 0;
  const basePercent = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const tempPercent = max > 0 ? Math.min(100 - basePercent, (temp / max) * 100) : 0;
  const totalPercent = max > 0 ? Math.min(100, ((value + temp) / max) * 100) : 0;

  let tier = "healthy";
  if (value <= 0 && max > 0) tier = "down";
  else if (totalPercent <= 25) tier = "critical";
  else if (totalPercent <= 50) tier = "warn";

  return {
    value,
    max,
    temp,
    basePercent,
    tempPercent,
    totalPercent,
    tier,
    percent: statPercent({ value, max })
  };
}

export function getTokenCombatStats(actor) {
  if (!actor) return { ac: null, speed: null };
  return {
    ac: actor.system?.attributes?.ac?.value ?? null,
    speed: actor.system?.attributes?.movement ? movementSpeed(actor.system.attributes.movement, "walk") : null
  };
}

const PASSIVE_SKILL_KEYS = [
  { id: "prc", skill: "prc", short: "PP" },
  { id: "ins", skill: "ins", short: "INS" },
  { id: "inv", skill: "inv", short: "INV" }
];

function skillLabelKey(skill) {
  const config = globalThis.CONFIG?.DND5E?.skills?.[skill]?.label;
  return config ?? `DND5E.Skill${skill.charAt(0).toUpperCase()}${skill.slice(1)}`;
}

/** Short badge label for a passive skill (localized when possible). */
export function passiveSkillShort(skill, fallback) {
  const key = skillLabelKey(skill);
  const full = illusiveDndCore(key);
  if (!full || full === key) return fallback;
  return full.slice(0, 3);
}

/** Passive Perception / Insight / Investigation for the vitals column. */
export function buildPassiveScores(actor) {
  if (!actor) return [];

  const skills = actor.system?.skills ?? {};
  return PASSIVE_SKILL_KEYS.map(({ id, skill, short }) => {
    const value = skills[skill]?.passive;
    if (!Number.isFinite(value)) return null;
    const key = skillLabelKey(skill);
    return {
      id,
      short: passiveSkillShort(skill, short),
      label: illusiveDndCore(key),
      value: Math.round(value)
    };
  }).filter(Boolean);
}

function senseDistance(senses, key) {
  return senseRange(senses, key) || null;
}

function formatSenseRange(key, distance, units) {
  const titled = key ? `${key.charAt(0).toUpperCase()}${key.slice(1)}` : key;
  const config = globalThis.CONFIG?.DND5E?.senses?.[key];
  const candidates = [
    typeof config === "string" ? config : config?.label,
    `DND5E.Sense${titled}`,
    `DND5E.Sense.${titled}`,
    `DND5E.SENSES.${key}`
  ].filter(Boolean);

  let label = titled;
  for (const candidate of candidates) {
    const text = illusiveDndCore(candidate);
    if (text && text !== candidate) {
      label = text;
      break;
    }
  }
  return `${label} ${distance} ${units}`;
}

/** Vision and special senses for Passive Perception tooltips only. */
export function buildVisionSummary(token) {
  const actor = token?.actor;
  if (!actor) return "";

  const senses = actor.system?.attributes?.senses;
  const units = senses?.units ?? "ft";
  const parts = [];
  const senseKeys = Object.keys(globalThis.CONFIG?.DND5E?.senses ?? {
    darkvision: true,
    blindsight: true,
    tremorsense: true,
    truesight: true
  });

  for (const key of senseKeys) {
    const distance = senseDistance(senses, key);
    if (distance != null) parts.push(formatSenseRange(key, distance, units));
  }

  // Catch custom range keys not listed in CONFIG.DND5E.senses.
  for (const [key, distance] of Object.entries(senses?.ranges ?? {})) {
    if (senseKeys.includes(key)) continue;
    if (Number.isFinite(distance) && distance > 0) {
      parts.push(formatSenseRange(key, distance, units));
    }
  }

  if (senses?.special) parts.push(senses.special);

  return parts.filter(Boolean).join("\n");
}

function asList(value) {
  if (!value) return [];
  if (value instanceof Set) return [...value];
  if (Array.isArray(value)) return value;
  return [value];
}

function splitCustom(value) {
  return String(value ?? "")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function configLabel(entry, labelKey = "label") {
  if (!entry) return "";
  if (typeof entry === "string") return illusiveDndCore(entry) !== entry ? illusiveDndCore(entry) : (entry.includes(".") ? "" : entry);
  const raw = entry[labelKey] ?? entry.label ?? entry.name;
  if (typeof raw !== "string" || !raw) return "";
  const text = illusiveDndCore(raw);
  return text && text !== raw ? text : (raw.includes(".") ? "" : raw);
}

function damageTypeLabel(key) {
  if (key === "ALL") {
    const all = illusiveDndCore("DND5E.DAMAGE.All");
    return all !== "DND5E.DAMAGE.All" ? all : "All";
  }
  return configLabel(globalThis.CONFIG?.DND5E?.damageTypes?.[key]) || key;
}

function conditionLabel(key) {
  return configLabel(globalThis.CONFIG?.DND5E?.conditionTypes?.[key], "name")
    || configLabel(globalThis.CONFIG?.DND5E?.conditionTypes?.[key])
    || key;
}

function collectTraitLabels(trait, labelFn) {
  const labels = asList(trait?.value).map((key) => labelFn(key)).filter(Boolean);
  labels.push(...splitCustom(trait?.custom));
  return labels;
}

/** Resistances and immunities for the AC tooltip. */
export function buildDefenseTraits(actor) {
  const traits = actor?.system?.traits;
  if (!traits) return { immunities: [], resistances: [] };
  return {
    immunities: [
      ...collectTraitLabels(traits.di, damageTypeLabel),
      ...collectTraitLabels(traits.ci, conditionLabel)
    ],
    resistances: collectTraitLabels(traits.dr, damageTypeLabel)
  };
}

function flattenLanguageConfig(config, out = {}) {
  for (const [key, data] of Object.entries(config ?? {})) {
    if (data?.children && typeof data.children === "object") {
      flattenLanguageConfig(data.children, out);
    }
    const label = configLabel(data);
    if (label) out[key] = label;
  }
  return out;
}

function languageLabel(key, lookup) {
  if (key === "ALL") {
    const all = illusiveDndCore("DND5E.Language.All");
    return all !== "DND5E.Language.All" ? all : "All";
  }
  return lookup[key] || key;
}

/** Spoken languages for the speak-icon tooltip. */
export function buildLanguageSummary(actor) {
  const langs = actor?.system?.traits?.languages;
  const prepared = langs?.labels?.languages;
  const ranged = langs?.labels?.ranged;
  const names = [];

  if (Array.isArray(prepared) && prepared.length) {
    names.push(...prepared.filter(Boolean));
  } else {
    const lookup = flattenLanguageConfig(globalThis.CONFIG?.DND5E?.languages);
    names.push(...asList(langs?.value).map((key) => languageLabel(key, lookup)));
    names.push(...splitCustom(langs?.custom));
  }

  if (Array.isArray(ranged)) names.push(...ranged.filter(Boolean));

  return names.filter(Boolean).join(", ");
}
