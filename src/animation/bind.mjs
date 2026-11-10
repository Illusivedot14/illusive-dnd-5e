/**
 * Connects combat events to the animation modules that are actually installed:
 * Automated Animations, Sequencer, JB2A, and Token Magic FX. FXMaster is left
 * alone; JB2A already covers the spell areas it would tint.
 */

import { MODULE_ID } from "../constants.mjs";
import { englishKeys, resolveLabel, aaNative } from "./aa.mjs";
import { planFx } from "./plan.mjs";
import { playFx } from "./play.mjs";

const MENUS = ["melee", "range", "ontoken", "templatefx", "aura", "preset"];

function moduleOn(id) {
  return globalThis.game?.modules?.get?.(id)?.active === true;
}

export function installedSources() {
  const jb2a = (moduleOn("JB2A_DnD5e") || moduleOn("jb2a_patreon")) && moduleOn("sequencer");
  return {
    aa: moduleOn("autoanimations"),
    jb2a,
    tokenmagic: moduleOn("tokenmagic")
  };
}

function aaSettings() {
  const settings = globalThis.game?.settings;
  if (typeof settings?.get !== "function") return {};
  const out = {};
  for (const menu of MENUS) {
    try { out[menu] = settings.get("autoanimations", `aaAutorec-${menu}`) ?? []; }
    catch { out[menu] = []; }
  }
  return out;
}

function itemFacts(item, activityName) {
  return {
    name: item?.name ?? "",
    activityName: activityName ?? "",
    babeleName: item?.flags?.babele?.originalName ?? "",
    identifier: item?.system?.identifier ?? "",
    baseItem: item?.system?.type?.baseItem ?? ""
  };
}

/** Hand AA the English auto-recognition label when the displayed name misses. */
export function feedAutomatedAnimations(data) {
  const item = data?.item;
  if (!item || !installedSources().aa) return null;
  const settings = aaSettings();
  const facts = itemFacts(item, data.activity?.name);
  const nativeNames = [facts.name, facts.activityName].filter(Boolean);
  const isTemplate = Boolean(data.isTemplate);
  if (aaNative(settings, { names: nativeNames, itemName: facts.name, isTemplate })) return null;
  const found = resolveLabel(settings, {
    keys: englishKeys(facts),
    nativeNames,
    itemName: facts.name,
    isTemplate
  });
  if (!found) return null;
  data.overrideNames = [found.label, ...(data.overrideNames ?? [])];
  return found;
}

function aaCovers(item, { isTemplate = false, activityName = "" } = {}) {
  if (!item || !installedSources().aa) return false;
  const settings = aaSettings();
  const facts = itemFacts(item, activityName);
  const nativeNames = [facts.name, facts.activityName].filter(Boolean);
  if (aaNative(settings, { names: nativeNames, itemName: facts.name, isTemplate })) return true;
  return Boolean(resolveLabel(settings, { keys: englishKeys(facts), nativeNames, itemName: facts.name, isTemplate }));
}

function spellDamageType(item) {
  const activities = item?.system?.activities;
  const list = activities?.contents ?? (activities ? [...activities.values?.() ?? activities] : []);
  for (const activity of list) {
    const types = activity?.damage?.parts?.find((part) => part?.types)?.types;
    const first = types ? [...types][0] : null;
    if (first) return first;
  }
  return null;
}

/** Area spells never reach Automated Animations: it reads a field dnd5e 6 no longer uses. */
export function deferToAutomatedAnimations(kind, covers) {
  if (kind === "templatePlace" || kind === "templateSave") return false;
  return Boolean(covers);
}

async function onCombatFx(evt) {
  const item = evt?.origin?.itemUuid
    ? await globalThis.fromUuid?.(evt.origin.itemUuid)
    : null;
  const isArea = evt?.kind === "templatePlace" || evt?.kind === "templateSave";
  const point = Number.isFinite(evt?.outcome?.x) && Number.isFinite(evt?.outcome?.y)
    ? { x: evt.outcome.x, y: evt.outcome.y }
    : null;
  const plan = planFx({
    kind: evt?.kind,
    shape: evt?.subtype ?? null,
    identifier: item?.system?.identifier ?? (evt?.kind === "aura" ? evt.subtype : null),
    damageType: evt?.outcome?.damageType ?? spellDamageType(item)
  }, {
    aaMatch: deferToAutomatedAnimations(evt?.kind, aaCovers(item, { isTemplate: isArea })),
    available: installedSources()
  });
  if (!plan || plan.source === "aa") return;
  try {
    await playFx(plan, { ...evt, point });
  } catch (err) {
    console.warn(`${MODULE_ID} | animation failed`, err);
  }
}

let bound = false;

export function bindAnimations() {
  if (bound || typeof globalThis.Hooks?.on !== "function") return false;
  bound = true;
  Hooks.on("aa.getRequiredData", feedAutomatedAnimations);
  Hooks.on(`${MODULE_ID}.combatFx`, (evt) => { void onCombatFx(evt); });
  return true;
}

export function _resetAnimations() {
  bound = false;
}
