import { illusiveDnd } from "../i18n/index.mjs";

function stripHtml(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent?.trim() ?? "";
}

function dash() {
  return "—";
}

/** @returns {string|null} */
export function formatAbilityRange(item, activity) {
  const actRange = activity?.range ?? {};
  const itemRange = item?.system?.range ?? {};
  const unitsRaw = actRange.units ?? itemRange.units;
  if (unitsRaw === "self") return "Self";
  if (unitsRaw === "touch") return illusiveDnd.actionBar("rangeTouch");

  const reach = Number(actRange.reach ?? itemRange.reach);
  const value = Number(actRange.value ?? itemRange.value);
  const units = (unitsRaw === "ft" || !unitsRaw) ? "ft." : unitsRaw;

  const attackType = activity?.attack?.type?.value ?? item?.system?.actionType;
  const melee = attackType === "melee" || attackType === "mwak" || attackType === "msak"
    || (item?.type === "weapon" && !itemRange.value && (itemRange.reach != null || unitsRaw === "ft"));

  if (Number.isFinite(reach) && reach > 0 && (melee || !Number.isFinite(value))) {
    return `Reach ${reach} ${units}`;
  }
  if (Number.isFinite(value) && value > 0) {
    return `${value} ${units}`;
  }
  if (melee) return `Reach 5 ${units}`;
  if (actRange.special) return String(actRange.special);
  if (itemRange.special) return String(itemRange.special);
  return null;
}

function getAbilityRollData(item, activity) {
  try {
    if (typeof activity?.getRollData === "function") {
      return activity.getRollData({ deterministic: true }) ?? {};
    }
    if (typeof item?.getRollData === "function") {
      return item.getRollData({ deterministic: true }) ?? {};
    }
    if (typeof item?.actor?.getRollData === "function") {
      return item.actor.getRollData({ deterministic: true }) ?? {};
    }
  } catch {
    /* ignore */
  }
  return {};
}

function getRollClass() {
  return CONFIG?.Dice?.DamageRoll
    ?? globalThis.CONFIG?.Dice?.DamageRoll
    ?? foundry?.dice?.Roll
    ?? globalThis.Roll
    ?? null;
}

/** Resolve `@mod` / `@abilities...` tokens into numbers for display. */
export function resolveAbilityFormula(formula, rollData = {}) {
  if (formula == null || formula === "") return "";
  let text = String(formula).trim();
  if (!text) return "";

  if (text.includes("@")) {
    try {
      const Roll = getRollClass();
      if (typeof Roll?.replaceFormulaData === "function") {
        text = Roll.replaceFormulaData(text, rollData ?? {}, { missing: "0" });
      } else {
        text = text.replace(/@[a-zA-Z0-9._]+/g, "0");
      }
    } catch {
      text = text.replace(/@[a-zA-Z0-9._]+/g, "0");
    }
  }

  return text
    .replace(/\s*\+\s*0(?!\d|\.)/g, "")
    .replace(/\s*-\s*0(?!\d|\.)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDamageLabels(labels) {
  const list = Array.isArray(labels) ? labels : (labels ? [labels] : []);
  const texts = list.map((entry) => {
    if (!entry) return null;
    if (typeof entry === "string") return entry;
    return entry.label || entry.formula || null;
  }).filter(Boolean);
  return texts.length ? texts.join(", ") : null;
}

function formatDamagePart(part, rollData) {
  if (Array.isArray(part)) {
    const [formula, type] = part;
    const resolved = resolveAbilityFormula(formula, rollData);
    return [resolved, type].filter(Boolean).join(" ") || null;
  }
  if (part && typeof part === "object") {
    let formula = part.custom?.formula || part.formula || "";
    if (!formula && part.number != null && part.denomination) {
      formula = `${part.number}d${part.denomination}`;
      if (part.bonus) formula = `${formula} + ${part.bonus}`;
    } else if (!formula && part.number != null) {
      formula = String(part.number);
      if (part.bonus) formula = `${formula} + ${part.bonus}`;
    }
    const resolved = resolveAbilityFormula(formula, rollData);
    const type = Array.isArray(part.types)
      ? part.types.filter(Boolean).join("/")
      : (part.type ?? "");
    return [resolved, type].filter(Boolean).join(" ") || null;
  }
  return part ? resolveAbilityFormula(part, rollData) : null;
}

/** @returns {string|null} */
export function formatAbilityDamage(item, activity) {
  const rollData = getAbilityRollData(item, activity);

  const fromLabels = formatDamageLabels(activity?.labels?.damages ?? activity?.labels?.damage)
    ?? formatDamageLabels(item?.labels?.damages);
  if (fromLabels) {
    const resolved = resolveAbilityFormula(fromLabels, rollData);
    return resolved || null;
  }

  if (activity?.type === "heal") {
    const heal = activity?.healing?.custom?.formula
      || activity?.healing?.formula
      || activity?.labels?.healing
      || null;
    const resolved = resolveAbilityFormula(heal, rollData);
    if (resolved) return resolved;
  }

  const parts = activity?.damage?.parts?.length
    ? activity.damage.parts
    : item?.system?.damage?.parts;
  if (!parts?.length) {
    const legacy = item?.labels?.damage;
    return legacy ? (resolveAbilityFormula(legacy, rollData) || null) : null;
  }

  try {
    return parts.map((part) => formatDamagePart(part, rollData)).filter(Boolean).join(", ") || null;
  } catch {
    return null;
  }
}

function firstAbilityKey(raw) {
  if (raw == null || raw === "") return "";
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return String(raw[0] ?? "");
  if (raw instanceof Set || (typeof raw[Symbol.iterator] === "function" && typeof raw !== "string")) {
    const first = raw[Symbol.iterator]().next().value;
    return first == null ? "" : String(first);
  }
  if (typeof raw === "object") return String(raw.value ?? raw.key ?? "");
  return String(raw);
}

function formatHitModifier(mod) {
  if (mod == null || mod === "") return null;
  if (typeof mod === "object") {
    const nested = mod.value ?? mod.formula ?? mod.bonus ?? null;
    if (nested == null || nested === "") return null;
    mod = nested;
  }
  const raw = String(mod).trim();
  if (!raw || /^\[object /i.test(raw)) return null;
  return /^[+-]/.test(raw) ? raw : `+${raw}`;
}

/**
 * HIT / DC cell model.
 * @returns {{ kind: "attack"|"save"|null, text: string, ability?: string, dc?: string }|null}
 */
export function formatAbilityHit(item, activity) {
  const save = activity?.save;
  if (save?.ability) {
    const ability = firstAbilityKey(save.ability).toUpperCase();
    let dc = save.dc?.value ?? save.dc;
    if (dc && typeof dc === "object") dc = dc.value ?? dc.formula ?? null;
    const dcText = dc != null && dc !== "" ? String(dc) : "?";
    return {
      kind: "save",
      ability,
      dc: dcText,
      text: `${ability} ${dcText}`.trim()
    };
  }

  const text = formatHitModifier(
    activity?.labels?.modifier
    ?? item?.labels?.modifier
    ?? item?.labels?.toHit
    ?? activity?.attack?.bonus
    ?? null
  );
  if (!text) return null;
  return { kind: "attack", text };
}

function abbreviateDurationUnits(units) {
  const map = {
    turn: "t",
    turns: "t",
    round: "rd",
    rounds: "rd",
    minute: "m",
    minutes: "m",
    hour: "h",
    hours: "h",
    day: "d",
    days: "d"
  };
  return map[String(units ?? "").toLowerCase()] ?? String(units ?? "");
}

/** @returns {string|null} */
export function formatAbilityNotes(item, activity) {
  const parts = [];

  const uses = activity?.uses ?? item?.system?.uses;
  if (uses?.max) {
    const value = uses.value ?? uses.max;
    parts.push(`${value}/${uses.max}`);
  }

  const duration = activity?.duration ?? item?.system?.duration;
  if (duration?.value && duration?.units && duration.units !== "inst") {
    parts.push(`${duration.value}${abbreviateDurationUnits(duration.units)}`);
  }

  const concentration = Boolean(
    duration?.concentration
    || item?.system?.properties?.concentration
    || item?.system?.components?.concentration
  );
  if (concentration) parts.push("C");

  const components = item?.system?.components;
  if (components) {
    const letters = ["vocal", "somatic", "material"]
      .filter((key) => components[key])
      .map((key) => key[0].toUpperCase());
    if (letters.length) parts.push(letters.join("/"));
  }

  return parts.length ? parts.join(", ") : null;
}

/** @returns {string|null} */
export function formatAbilitySubtitle(item, ability = null) {
  if (ability?.isStandard) return illusiveDnd.actionBar("groupStandard");
  if (!item) return null;
  if (item.type === "weapon") return illusiveDnd.actionBar("groupWeapons");
  if (item.type === "spell") {
    const level = item.system?.level ?? 0;
    return level === 0 ? illusiveDnd.actionBar("groupCantrips") : illusiveDnd.actionBar("groupSpellLevel", { level });
  }
  if (item.type === "feat") return illusiveDnd.actionBar("groupFeats");
  if (item.type === "consumable") return illusiveDnd.actionBar("groupConsumables");
  return illusiveDnd.actionBar("groupFeatures");
}

/**
 * Row fields for the DDB-style ability list.
 * @param {Item|null} item
 * @param {object|null} activity
 * @param {object} ability
 */
export function buildAbilityRowDisplay(item, activity, ability) {
  const hit = formatAbilityHit(item, activity);
  const range = formatAbilityRange(item, activity);
  const effect = formatAbilityDamage(item, activity);
  const notes = formatAbilityNotes(item, activity);

  return {
    subtitle: formatAbilitySubtitle(item, ability),
    rangeLabel: range || dash(),
    hitKind: hit?.kind ?? null,
    hitLabel: hit?.text || dash(),
    hitAbility: hit?.ability ?? null,
    hitDc: hit?.dc ?? null,
    effectLabel: effect || dash(),
    notesLabel: notes || dash(),
    descriptionPreview: stripHtml(activity?.description?.value ?? item?.system?.description?.value ?? "").slice(0, 600)
  };
}
