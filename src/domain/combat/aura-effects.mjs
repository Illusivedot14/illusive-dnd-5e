/**
 * Mechanical aura catalog — which features buff allies in range.
 */

/** dnd5e 6 path for the all-saves bonus (was `system.bonuses.abilities.save`). */
export const SAVE_BONUS_KEY = "system.rolls.ability.save.bonus";

export const AURA_CATALOG = Object.freeze([
  {
    id: "aura-of-protection",
    test: (item) => item?.system?.identifier === "aura-of-protection"
      || /^aura of protection$/i.test(item?.name ?? ""),
    affects: "ally",
    /** Feet; overridden by scale value when present. */
    defaultFeet: 10,
    scalePath: "paladin.aura",
    bonus: {
      key: SAVE_BONUS_KEY,
      type: "add",
      /** Source actor Cha mod (min 1). */
      from: "chaModMin1"
    },
    effectName: "Aura of Protection",
    incapacitatedBlocks: true
  },
  {
    id: "aura-of-courage",
    test: (item) => item?.system?.identifier === "aura-of-courage"
      || /^aura of courage$/i.test(item?.name ?? ""),
    affects: "ally",
    defaultFeet: 10,
    scalePath: "paladin.aura",
    immunities: ["frightened"],
    effectName: "Aura of Courage",
    incapacitatedBlocks: true
  },
  {
    id: "aura-of-devotion",
    test: (item) => item?.system?.identifier === "aura-of-devotion"
      || /^aura of devotion$/i.test(item?.name ?? ""),
    affects: "ally",
    defaultFeet: 10,
    scalePath: "paladin.aura",
    immunities: ["charmed"],
    effectName: "Aura of Devotion",
    incapacitatedBlocks: true
  },
  {
    id: "spirit-guardians",
    test: (item) => item?.system?.identifier === "spirit-guardians"
      || /^spirit\s*guardians$/i.test(item?.name ?? ""),
    affects: "enemy",
    defaultFeet: 15,
    damaging: {
      /** Formula; @abilities.wis.mod style resolved via roll data when possible. */
      formula: "3d8",
      type: "radiant",
      saveAbility: "wis",
      onSave: "half",
      /** Also tick when an enemy starts turn inside. */
      turn: "start"
    },
    effectName: "Spirit Guardians",
    incapacitatedBlocks: false,
    requiresConcentration: true
  },
  {
    id: "aura-of-life",
    test: (item) => item?.system?.identifier === "aura-of-life"
      || /^aura\s*of\s*life$/i.test(item?.name ?? ""),
    affects: "ally",
    defaultFeet: 30,
    immunities: [],
    effectName: "Aura of Life",
    incapacitatedBlocks: false,
    requiresConcentration: true,
    /** Resistance to necrotic — applied as CI-like trait change if supported. */
    resistances: ["necrotic"]
  },
  {
    id: "aura-of-purity",
    test: (item) => item?.system?.identifier === "aura-of-purity"
      || /^aura\s*of\s*purity$/i.test(item?.name ?? ""),
    affects: "ally",
    defaultFeet: 30,
    immunities: ["blinded", "charmed", "deafened", "frightened", "paralyzed", "poisoned", "stunned"],
    effectName: "Aura of Purity",
    incapacitatedBlocks: false,
    requiresConcentration: true
  }
]);

export function findAuraFeatures(actor) {
  const out = [];
  if (!actor?.items) return out;
  for (const item of actor.items) {
    const spec = AURA_CATALOG.find((a) => a.test(item));
    if (spec) out.push({ spec, item });
  }
  return out;
}

export { isIncapacitated } from "./conditions.mjs";

export function resolveAuraFeet(actor, spec) {
  const scale = actor?.system?.scale ?? actor?.scale;
  if (spec.scalePath && scale) {
    const parts = spec.scalePath.split(".");
    let cur = scale;
    for (const p of parts) cur = cur?.[p];
    const n = Number(cur?.value ?? cur);
    if (Number.isFinite(n) && n > 0) return n;
  }
  // Advancement ScaleValue sometimes lives on class item
  for (const item of actor?.items ?? []) {
    if (item.type !== "class") continue;
    const adv = item.system?.advancement;
    const list = Array.isArray(adv) ? adv : Object.values(adv ?? {});
    for (const a of list) {
      if (a?.type !== "ScaleValue") continue;
      if (a.configuration?.identifier === "aura" || a.title?.toLowerCase?.().includes("aura")) {
        const level = Number(actor.system?.details?.level) || 1;
        const scaleMap = a.configuration?.scale ?? {};
        let best = null;
        for (const [lvl, row] of Object.entries(scaleMap)) {
          if (Number(lvl) <= level) best = Number(row?.value ?? row);
        }
        if (Number.isFinite(best) && best > 0) return best;
      }
    }
  }
  return spec.defaultFeet ?? 10;
}

/** Effect flag key for auras declared on an ActiveEffect (spells, summons, items). */
export const DECLARED_AURA_FLAG = "aura";

const AURA_DISPOSITIONS = ["ally", "enemy", "any"];

/**
 * Normalize `flags.illusive-dnd-5e.aura` on an effect the source carries.
 * The listed changes and statuses go to tokens in range, not the source
 * (unless applyToSelf).
 * @param {object} effect
 * @param {string} [moduleId="illusive-dnd-5e"]
 * @returns {{radius: string, disposition: string, applyToSelf: boolean, combatOnly: boolean,
 *   disableOnHidden: boolean, changes: object[], statuses: string[], overTime: object|null}|null}
 */
export function readDeclaredAura(effect, moduleId = "illusive-dnd-5e") {
  const raw = effect?.flags?.[moduleId]?.[DECLARED_AURA_FLAG];
  if (!raw || typeof raw !== "object") return null;
  const radius = String(raw.radius ?? "").trim();
  if (!radius) return null;
  return {
    radius,
    disposition: AURA_DISPOSITIONS.includes(raw.disposition) ? raw.disposition : "any",
    applyToSelf: Boolean(raw.applyToSelf),
    combatOnly: Boolean(raw.combatOnly),
    disableOnHidden: raw.disableOnHidden !== false,
    changes: Array.isArray(raw.changes) ? raw.changes : [],
    statuses: Array.isArray(raw.statuses) ? raw.statuses : [],
    overTime: raw.overTime && typeof raw.overTime === "object" ? raw.overTime : null
  };
}

/**
 * Whether a declared aura reaches a token, by relationship to the source.
 * @param {{disposition: string, applyToSelf: boolean}} aura
 * @param {{isSelf: boolean, friendly: boolean}} relation
 */
export function declaredAuraReaches(aura, { isSelf, friendly }) {
  if (isSelf) return aura.applyToSelf;
  if (aura.disposition === "ally") return friendly;
  if (aura.disposition === "enemy") return !friendly;
  return true;
}

/**
 * Replace `@path` references with the source's roll data so formulas keep the
 * caster's numbers once copied onto other creatures.
 * @param {unknown} value
 * @param {object} rollData
 */
export function resolveSourceFormula(value, rollData) {
  if (typeof value !== "string" || !value.includes("@")) return value;
  return value.replace(/@([a-zA-Z0-9_.-]+)/g, (match, path) => {
    let cur = rollData;
    for (const part of path.split(".")) cur = cur?.[part];
    if (cur && typeof cur === "object" && "value" in cur) cur = cur.value;
    return (typeof cur === "number" || typeof cur === "string") && cur !== "" ? String(cur) : match;
  });
}

export function auraSaveBonus(sourceActor, spec) {
  if (spec.bonus?.from === "chaModMin1") {
    const mod = Number(sourceActor?.system?.abilities?.cha?.mod) || 0;
    return Math.max(1, mod);
  }
  return 0;
}
