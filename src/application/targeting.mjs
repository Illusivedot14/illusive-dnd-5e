/**
 * Canvas-target helpers + range gates shared by desktop and mobile pick lists.
 * Distance / range adjudication lives in application/range.mjs (DAS-style).
 */

import {
  activityNormalRangeFeet,
  activityRangeFeet,
  checkAbilityRange,
  measureTokenDistance,
  resolveRangeSpec
} from "./range.mjs";

export {
  activityNormalRangeFeet,
  activityRangeFeet,
  checkAbilityRange,
  measureTokenDistance,
  resolveRangeSpec
};

export function sceneTokens(scene) {
  const tokens = scene?.tokens;
  if (!tokens) return [];
  if (Array.isArray(tokens)) return tokens;
  if (Array.isArray(tokens.contents)) return tokens.contents;
  try {
    return [...tokens];
  } catch {
    return [];
  }
}

export function tokenId(doc) {
  return doc?.id ?? doc?._id ?? null;
}

export function tokenUuid(doc, scene) {
  if (doc?.uuid) return doc.uuid;
  const id = tokenId(doc);
  return scene?.id && id ? `Scene.${scene.id}.Token.${id}` : null;
}

/** @deprecated Prefer measureTokenDistance — kept for callers expecting a bare number. */
export function tokenDistanceFeet(fromDoc, toDoc, scene) {
  return measureTokenDistance(fromDoc, toDoc, scene).value;
}

/**
 * How far this use can reach for pick-lists (includes long range when present).
 * Unknown / unlimited → Infinity.
 */
export function abilityRangeFeet(item, activity) {
  const feet = activityRangeFeet(activity, item);
  if (feet == null) return Infinity;
  return feet;
}

export function listTargetsInRange(casterDoc, item, activity, scene) {
  if (!casterDoc || !scene) return [];
  const casterId = tokenId(casterDoc);
  const spec = resolveRangeSpec(activity, item);
  const maxFeet = spec.long ?? spec.value;
  const gm = Boolean(game.user?.isGM);
  const rows = [];

  for (const doc of sceneTokens(scene)) {
    const id = tokenId(doc);
    if (!id || id === casterId) continue;
    if (!gm && doc.hidden) continue;
    const actor = doc.actor ?? game.actors?.get?.(doc.actorId);
    const name = doc.name || actor?.name;
    if (!name) continue;
    const measured = measureTokenDistance(casterDoc, doc, scene);
    const feet = measured.value;
    if (maxFeet != null && feet > maxFeet + 0.05) continue;
    const band = maxFeet == null
      ? "unlimited"
      : (spec.value != null && feet <= spec.value + 0.05
        ? "normal"
        : (spec.long != null ? "longRange" : "normal"));
    rows.push({
      id,
      uuid: tokenUuid(doc, scene),
      name,
      img: doc.texture?.src || actor?.img || "icons/svg/mystery-man.svg",
      feet: Math.round(feet),
      band
    });
  }

  rows.sort((a, b) => a.feet - b.feet || a.name.localeCompare(b.name));
  return rows;
}
