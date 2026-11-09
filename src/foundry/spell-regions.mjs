/**
 * Spell area cleanup (runs on the active GM only).
 *
 * Instantaneous areas: delete the region once the animation and targeting have had time to run.
 * Concentration areas: make sure the region depends on the concentration effect, and delete
 * (not just disable) concentration / template-holder effects when they expire, so dependents go too.
 */

import { MODULE_ID } from "../constants.mjs";
import { getConcentrationEffect } from "./dnd5e-adapter.mjs";
import { listActivities } from "../domain/combat/activity-kind.mjs";

const INSTANT_REGION_DELAY_MS = 6000;
const LINK_RETRY_DELAYS_MS = [250, 1000, 2500];

let bound = false;

function isActiveGM() {
  return game.user === game.users.activeGM;
}

/** dnd5e 6: `flags.dnd5e.activity` is the activity, `origin` the caster token (5.x put the activity in `origin`). */
function resolveRegionSource(region) {
  const flags = region?.flags?.dnd5e ?? {};
  let activity = null;
  for (const uuid of [flags.activity, flags.origin]) {
    if (!uuid) continue;
    const doc = foundry.utils.fromUuidSync(uuid, { strict: false });
    if (doc && doc.documentName !== "Token" && doc.item) {
      activity = doc;
      break;
    }
  }
  let item = activity?.item ?? null;
  if (!item && flags.item) item = foundry.utils.fromUuidSync(flags.item, { strict: false });
  if (!activity && item) {
    const activities = listActivities(item);
    activity = activities.find((entry) => entry.target?.template?.type) ?? activities[0] ?? null;
  }
  if (!item || !activity) return null;
  return { activity, item, actor: item.actor ?? null };
}

function isConcentrationSource({ activity, item }) {
  return Boolean(activity?.duration?.concentration ?? item?.requiresConcentration ?? item?.system?.properties?.has?.("concentration"));
}

function isInstantSource({ activity }) {
  return activity?.duration?.units === "inst";
}

function isConcentrationEffect(effect) {
  const status = CONFIG.specialStatusEffects?.CONCENTRATING ?? "concentrating";
  return Boolean(effect?.statuses?.has?.(status));
}

function findConcentrationEffect(actor, item) {
  if (!actor || !item) return null;
  const viaConcentration = getConcentrationEffect(actor, item);
  if (viaConcentration) return viaConcentration;
  return actor.effects.find((effect) => isConcentrationEffect(effect)
    && (effect.origin === item.uuid || effect.flags?.dnd5e?.item?.id === item.id)) ?? null;
}

function scheduleInstantDelete(region) {
  const uuid = region.uuid;
  setTimeout(() => {
    const doc = foundry.utils.fromUuidSync(uuid, { strict: false });
    if (doc) void doc.delete().catch((err) => console.warn(`${MODULE_ID} | instant region delete failed`, err));
  }, INSTANT_REGION_DELAY_MS);
}

function scheduleConcentrationLink(region, source) {
  const uuid = region.uuid;
  for (const delay of LINK_RETRY_DELAYS_MS) {
    setTimeout(async () => {
      const doc = foundry.utils.fromUuidSync(uuid, { strict: false });
      if (!doc || doc.flags?.dnd5e?.dependentOn) return;
      const effect = findConcentrationEffect(source.actor, source.item);
      if (!effect) return;
      try {
        await doc.setFlag("dnd5e", "dependentOn", effect.uuid);
      } catch (err) {
        console.warn(`${MODULE_ID} | concentration region link failed`, err);
      }
    }, delay);
  }
}

function onCreateRegion(region) {
  if (!isActiveGM()) return;
  const source = resolveRegionSource(region);
  if (!source) return;

  if (isConcentrationSource(source)) {
    scheduleConcentrationLink(region, source);
    return;
  }
  if (isInstantSource(source)) scheduleInstantDelete(region);
}

function hasRegionDependents(effect) {
  try {
    return (effect.getDependents?.() ?? []).some((doc) => doc instanceof foundry.documents.RegionDocument);
  } catch {
    return false;
  }
}

function onUpdateActiveEffect(effect, changes) {
  if (!isActiveGM()) return;
  if (changes?.disabled !== true) return;
  if (!(effect.parent instanceof Actor)) return;
  if (!isConcentrationEffect(effect) && !hasRegionDependents(effect)) return;
  void effect.delete().catch((err) => console.warn(`${MODULE_ID} | expired effect delete failed`, err));
}

export function bindSpellRegionCleanup() {
  if (bound) return;
  bound = true;
  Hooks.on("createRegion", onCreateRegion);
  Hooks.on("updateActiveEffect", onUpdateActiveEffect);
}
