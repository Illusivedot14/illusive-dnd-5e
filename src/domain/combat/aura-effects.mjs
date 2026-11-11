/**
 * Auras the creature carries. The catalog is the `aura` declarations.
 * A new aura is a declaration on the aura moment.
 */

import { CONTENT } from "../../content/declarations.mjs";
import { contentMatchesItem } from "../../content/match.mjs";
import { declarationsFor } from "../../application/triggers/index.mjs";

/** dnd5e 6 path for the all-saves bonus (was `system.bonuses.abilities.save`). */
export const SAVE_BONUS_KEY = "system.rolls.ability.save.bonus";

function momentIds(decl) {
  return Array.isArray(decl?.on) ? decl.on : (decl?.on ? [decl.on] : []);
}

function catalogFromContent() {
  const out = [];
  for (const content of CONTENT) {
    for (const raw of content.declarations ?? []) {
      if (!momentIds(raw).includes("aura") || !raw.aura) continue;
      out.push({
        id: raw.id,
        ...raw.aura,
        effectName: raw.aura.effectName ?? raw.label ?? raw.id,
        test: (item) => contentMatchesItem(content, item)
      });
    }
  }
  return out;
}

export const AURA_CATALOG = Object.freeze(catalogFromContent());

function specFromDecl(decl) {
  const aura = decl.aura ?? {};
  return {
    id: decl.id,
    ...aura,
    effectName: aura.effectName ?? decl.label ?? decl.id
  };
}

export function findAuraFeatures(actor) {
  const out = [];
  for (const entry of declarationsFor(actor, "aura")) {
    if (!entry.decl.aura || !entry.item) continue;
    out.push({ spec: specFromDecl(entry.decl), item: entry.item });
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
