/**
 * Template AoE: after an area Region is placed, find tokens and resolve saves.
 * Hit tests use RegionDocument#testPoint, falling back to the Illusive feet-based shape.
 */

import { pointInTemplateShape } from "../domain/combat/template-shape.mjs";
import { listActivities } from "../domain/combat/activity-kind.mjs";
import { resolveSaveActivity } from "./save-resolve.mjs";
import { applyActivityEffects } from "./effect-apply.mjs";
import { emitCombatFx } from "./combat-fx.mjs";
import { MODULE_ID } from "../constants.mjs";
import { clearUserTargets } from "../foundry/token-actions.mjs";
import { debugLog, DEBUG_CHANNELS } from "../foundry/debug.mjs";
import {
  beginOwnedResolve,
  endOwnedResolve,
  isOwnedResolve
} from "./owned-resolve.mjs";

export const beginOwnedTemplateResolve = beginOwnedResolve;
export const endOwnedTemplateResolve = endOwnedResolve;
export const isOwnedTemplateResolve = isOwnedResolve;

function dbgTemplate(tag, data = {}) {
  debugLog(DEBUG_CHANNELS.TEMPLATE, tag, data);
}

function tokenDebugName(token) {
  return token?.name ?? token?.document?.name ?? token?.actor?.name ?? "?";
}

function tokenDebugUuid(token) {
  return token?.document?.uuid ?? token?.uuid ?? null;
}

/** Compare Region/Illusive hit tests for one token (debug). */
export function probeTokenInTemplate(templateDoc, token, { object = null } = {}) {
  void object;
  const grid = canvas?.scene?.grid ?? canvas?.grid;
  const gridSize = Number(grid?.size ?? 100) || 100;
  const region = regionForTemplateDoc(templateDoc);
  const shape = shapeFromTemplateDoc(templateDoc);
  const width = Number(token?.document?.width ?? 1) || 1;
  const height = Number(token?.document?.height ?? 1) || 1;
  const tokenX = Number(token?.document?.x ?? token?.x) || 0;
  const tokenY = Number(token?.document?.y ?? token?.y) || 0;
  const elev = Number(token?.document?.elevation ?? token?.elevation ?? region?.elevation?.bottom ?? 0) || 0;
  const center = token?.center ?? {
    x: tokenX + (width * gridSize) / 2,
    y: tokenY + (height * gridSize) / 2
  };
  const illusive = pointInTemplateShape(shape, center, gridFacts());

  let regionHit = false;
  let regionSample = null;
  if (region && typeof region.testPoint === "function") {
    const startX = width >= 1 ? 0.5 : width / 2;
    const startY = height >= 1 ? 0.5 : height / 2;
    for (let x = startX; x < width; x += 1) {
      for (let y = startY; y < height; y += 1) {
        const worldX = tokenX + x * gridSize;
        const worldY = tokenY + y * gridSize;
        let contains = false;
        try {
          contains = region.testPoint({ x: worldX, y: worldY, elevation: elev });
        } catch {
          contains = false;
        }
        if (contains) {
          regionHit = true;
          regionSample = { x: worldX, y: worldY };
          break;
        }
      }
      if (regionHit) break;
    }
  }

  return {
    name: tokenDebugName(token),
    uuid: tokenDebugUuid(token),
    illusive,
    foundry: regionHit,
    mismatch: illusive !== regionHit,
    foundrySample: regionSample,
    center: { x: center.x, y: center.y },
    resolvedShape: shape,
    rawTemplateWidth: Number(templateDoc?.width) || null,
    hasRegion: Boolean(region)
  };
}

function gridFacts() {
  const grid = canvas?.grid;
  return {
    gridSize: Number(grid?.size ?? canvas?.scene?.grid?.size ?? 100) || 100,
    gridDistance: Number(grid?.distance ?? canvas?.scene?.grid?.distance ?? 5) || 5
  };
}

function pointBlockedByWall(from, to) {
  try {
    if (typeof CONFIG?.Canvas?.polygonBackends?.move?.testCollision === "function") {
      return Boolean(CONFIG.Canvas.polygonBackends.move.testCollision(from, to, {
        type: "move",
        mode: "any"
      }));
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Foundry V14 stores Region line width in pixels, but MeasuredTemplateDocument._fromRegion
 * copies it back as feet without dividing by distancePixels (5 ft → 100 px → "100 ft").
 * Always resolve shape in grid distance units (feet) for Illusive hit tests.
 */
function distancePixels() {
  const grid = canvas?.scene?.grid ?? canvas?.grid;
  const size = Number(grid?.size ?? 100) || 100;
  const distance = Number(grid?.distance ?? 5) || 5;
  return size / distance;
}

function regionForTemplateDoc(templateDoc) {
  if (!templateDoc) return null;
  if (templateDoc.documentName === "Region" || templateDoc.shapes) return templateDoc;
  const id = templateDoc.id ?? templateDoc._id;
  return (id && canvas?.scene?.regions?.get?.(id)) || null;
}

function shapeFromRegion(region) {
  const shape = region?.shapes?.[0] ?? region?.shapes?.at?.(0);
  if (!shape) return null;
  const dp = distancePixels();
  const type = shape.type;
  if (type === "line") {
    return {
      t: "ray",
      x: Number(shape.x) || 0,
      y: Number(shape.y) || 0,
      direction: Number(shape.rotation) || 0,
      distance: (Number(shape.length) || 0) / dp,
      angle: 0,
      width: (Number(shape.width) || 0) / dp
    };
  }
  if (type === "circle") {
    return {
      t: "circle",
      x: Number(shape.x) || 0,
      y: Number(shape.y) || 0,
      direction: 0,
      distance: (Number(shape.radius) || 0) / dp,
      angle: 0,
      width: 0
    };
  }
  if (type === "cone") {
    return {
      t: "cone",
      x: Number(shape.x) || 0,
      y: Number(shape.y) || 0,
      direction: Number(shape.rotation) || 0,
      distance: (Number(shape.radius) || 0) / dp,
      angle: Number(shape.angle) || 53.13,
      width: 0
    };
  }
  if (type === "rectangle") {
    return {
      t: "rect",
      x: Number(shape.x) || 0,
      y: Number(shape.y) || 0,
      direction: 0,
      distance: (Number(shape.width) || 0) / dp,
      angle: 0,
      width: 0
    };
  }
  if (type === "emanation" && shape.base) {
    const size = Number(canvas?.scene?.grid?.size ?? canvas?.grid?.size ?? 100) || 100;
    const baseWidth = (Number(shape.base.width) || 1) * size;
    const baseHeight = (Number(shape.base.height) || 1) * size;
    return {
      t: "emanation",
      x: (Number(shape.base.x) || 0) + baseWidth / 2,
      y: (Number(shape.base.y) || 0) + baseHeight / 2,
      direction: 0,
      distance: (Number(shape.radius) || 0) / dp,
      angle: 0,
      width: 0,
      baseWidth,
      baseHeight
    };
  }
  return null;
}

export function shapeFromTemplateDoc(templateDoc) {
  const flags = templateDoc?.flags?.[MODULE_ID];
  if (flags?.previewShape?.t) {
    return { ...flags.previewShape };
  }

  const fromRegion = shapeFromRegion(regionForTemplateDoc(templateDoc));
  if (fromRegion) return fromRegion;

  // Legacy MeasuredTemplate fields — fix V14 ray width if it still looks like pixels.
  const rawWidth = Number(templateDoc?.width) || 0;
  const distance = Number(templateDoc?.distance) || 0;
  const dp = distancePixels();
  const dimsWidth = Number(templateDoc?.flags?.dnd5e?.dimensions?.width);
  let width = Number.isFinite(dimsWidth) && dimsWidth > 0
    ? dimsWidth
    : rawWidth;
  // Heuristic: shim width equals pixel length of a normal feet width.
  if (!Number.isFinite(dimsWidth) && rawWidth > 0 && Math.abs(rawWidth - (rawWidth / dp) * dp) < 1e-6) {
    const asFeet = rawWidth / dp;
    // Prefer feet when raw looks like px for a 5-ft beam (e.g. 100 on a 100px grid).
    if (asFeet > 0 && asFeet <= Math.max(distance, 5) && rawWidth >= dp) {
      width = asFeet;
    }
  }

  return {
    t: templateDoc?.t || "circle",
    x: Number(templateDoc?.x) || 0,
    y: Number(templateDoc?.y) || 0,
    direction: Number(templateDoc?.direction) || 0,
    distance,
    angle: Number(templateDoc?.angle) || 53.13,
    width: width || 5
  };
}

/** Wait for Foundry to draw the area's placeable (Region, or a legacy template). */
export async function waitForTemplateObject(templateDoc, { tries = 20 } = {}) {
  if (!templateDoc) return null;
  for (let i = 0; i < tries; i += 1) {
    const object = templateDoc.object
      ?? canvas.regions?.get?.(templateDoc.id)
      ?? null;
    if (object) {
      try {
        if (!object.shape && typeof object._computeShape === "function") {
          object.shape = object._computeShape();
        }
      } catch {
        /* ignore */
      }
      return object;
    }
    await new Promise((r) => {
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => r());
      else setTimeout(r, 16);
    });
  }
  return null;
}

/**
 * Sample token footprint against AoE geometry.
 * Prefer Scene Region.testPoint (correct V14 line width) or Illusive feet-based shape.
 * Do not use MeasuredTemplate placeable.shape — V14 shim inflates ray width (px read as feet).
 */
export function isTokenInsideTemplate(templateDoc, token, {
  origin = null,
  wallsBlock = false,
  object = null
} = {}) {
  if (!templateDoc || !token?.actor) return false;
  const grid = canvas?.scene?.grid ?? canvas?.grid;
  const gridSize = Number(grid?.size ?? 100) || 100;
  const region = regionForTemplateDoc(templateDoc);
  const shape = shapeFromTemplateDoc(templateDoc);

  const width = Number(token.document?.width ?? 1) || 1;
  const height = Number(token.document?.height ?? 1) || 1;
  const tokenX = Number(token.document?.x ?? token.x) || 0;
  const tokenY = Number(token.document?.y ?? token.y) || 0;
  const elev = Number(token.document?.elevation ?? token.elevation ?? region?.elevation?.bottom ?? 0) || 0;

  const startX = width >= 1 ? 0.5 : width / 2;
  const startY = height >= 1 ? 0.5 : height / 2;

  if (region && typeof region.testPoint === "function") {
    for (let x = startX; x < width; x += 1) {
      for (let y = startY; y < height; y += 1) {
        const worldX = tokenX + x * gridSize;
        const worldY = tokenY + y * gridSize;
        let contains = false;
        try {
          contains = region.testPoint({ x: worldX, y: worldY, elevation: elev });
        } catch {
          contains = false;
        }
        if (!contains) continue;
        if (wallsBlock && origin && pointBlockedByWall(origin, { x: worldX, y: worldY })) continue;
        return true;
      }
    }
    return false;
  }

  for (let x = startX; x < width; x += 1) {
    for (let y = startY; y < height; y += 1) {
      const worldX = tokenX + x * gridSize;
      const worldY = tokenY + y * gridSize;
      if (!pointInTemplateShape(shape, { x: worldX, y: worldY }, gridFacts())) continue;
      if (wallsBlock && origin && pointBlockedByWall(origin, { x: worldX, y: worldY })) continue;
      return true;
    }
  }
  return false;
}

export function tokensInTemplateDoc(templateDoc, { origin = null, wallsBlock = false, object = null } = {}) {
  if (!templateDoc) return [];
  const out = [];
  const probes = [];
  for (const token of canvas.tokens?.placeables ?? []) {
    if (!token?.actor || token.document?.hidden) continue;
    try {
      const probe = probeTokenInTemplate(templateDoc, token, { object });
      const inside = isTokenInsideTemplate(templateDoc, token, { origin, wallsBlock, object });
      probes.push({ ...probe, inside, wallsBlocked: !inside && (probe.foundry || probe.illusive) });
      if (inside) out.push(token);
    } catch (err) {
      probes.push({
        name: tokenDebugName(token),
        uuid: tokenDebugUuid(token),
        error: String(err?.message ?? err)
      });
    }
  }
  dbgTemplate("select.tokensInTemplate", {
    templateId: templateDoc?.id ?? null,
    templateUuid: templateDoc?.uuid ?? null,
    shape: shapeFromTemplateDoc(templateDoc),
    rawWidth: Number(templateDoc?.width) || null,
    wallsBlock,
    hit: out.map((t) => ({ name: tokenDebugName(t), uuid: tokenDebugUuid(t) })),
    probes: probes.filter((p) => p.inside || p.illusive || p.foundry || p.mismatch || p.error)
  });
  return out;
}

export function filterByAffects(tokens, activity, casterToken) {
  const affects = activity?.target?.affects?.type ?? activity?.target?.affects ?? null;
  const type = typeof affects === "string" ? affects : affects?.type;
  if (!type || type === "creature" || type === "any" || type === "") return tokens;

  const casterDisp = casterToken?.document?.disposition;
  return tokens.filter((t) => {
    const d = t.document?.disposition;
    if (type === "enemy" || type === "hostile") {
      return casterDisp == null || d == null || d !== casterDisp;
    }
    if (type === "ally" || type === "friendly") {
      return casterDisp == null || d === casterDisp;
    }
    return true;
  });
}

/**
 * dnd5e 6 regions: `flags.dnd5e.activity` is the activity and `origin` the caster token.
 * dnd5e 5 templates stored the activity in `origin`.
 */
export async function activityFromTemplate(templateDoc) {
  const flags = templateDoc?.flags?.dnd5e ?? {};
  const itemUuid = flags.item ?? null;
  const candidates = [flags.activity, flags.origin].filter(Boolean);

  for (const uuid of candidates) {
    if (typeof fromUuid !== "function") break;
    try {
      const act = await fromUuid(uuid);
      if (act && act.documentName !== "Token" && act.item) return { activity: act, item: act.item };
    } catch {
      /* fall through */
    }
  }
  if (itemUuid && typeof fromUuid === "function") {
    try {
      const item = await fromUuid(itemUuid);
      const list = listActivities(item);
      const save = list.find((a) => a?.type === "save")
        ?? list.find((a) => a?.target?.template?.type)
        ?? list[0];
      if (save) return { activity: save, item };
    } catch {
      /* ignore */
    }
  }
  return { activity: null, item: null };
}

function setTargets(tokens) {
  try {
    if (!game.user) return;
    const before = [...(game.user.targets ?? [])].map((t) => tokenDebugName(t));
    // setTarget(false) per token — Set.clear() alone leaves target arrows on the canvas.
    clearUserTargets();
    for (const t of tokens) {
      t.setTarget?.(true, { user: game.user, releaseOthers: false, groupSelection: true });
    }
    dbgTemplate("select.setTargets", {
      cleared: before,
      set: tokens.map((t) => tokenDebugName(t)),
      after: [...(game.user.targets ?? [])].map((t) => tokenDebugName(t))
    });
  } catch {
    /* ignore */
  }
}

export async function collectTemplateTargetUuids(placed, {
  activity = null,
  casterToken = null,
  casterUuid = null
} = {}) {
  const docs = Array.isArray(placed) ? placed : (placed ? [placed] : []);
  const uuids = new Set();
  const wallsBlock = Boolean(activity?.target?.template?.walls);
  const origin = casterToken?.center ?? null;
  const priorTargets = [...(game.user?.targets ?? [])].map((t) => ({
    name: tokenDebugName(t),
    uuid: tokenDebugUuid(t)
  }));

  dbgTemplate("select.collect.start", {
    docCount: docs.length,
    docIds: docs.map((d) => d?.id ?? d?.uuid),
    activityId: activity?.id ?? activity?._id ?? null,
    activityName: activity?.name ?? null,
    wallsBlock,
    casterUuid,
    priorTargets
  });

  for (const doc of docs) {
    const object = await waitForTemplateObject(doc);
    dbgTemplate("select.collect.doc", {
      id: doc?.id,
      uuid: doc?.uuid,
      hasObject: Boolean(object),
      hasShape: Boolean(object?.shape),
      shapeType: object?.shape?.constructor?.name ?? null,
      docShape: shapeFromTemplateDoc(doc)
    });
    let inArea = tokensInTemplateDoc(doc, { origin, wallsBlock, object });
    const beforeAffects = inArea.map((t) => tokenDebugName(t));
    inArea = filterByAffects(inArea, activity, casterToken);
    dbgTemplate("select.collect.affects", {
      before: beforeAffects,
      after: inArea.map((t) => tokenDebugName(t)),
      affects: activity?.target?.affects?.type ?? activity?.target?.affects ?? null
    });
    for (const t of inArea) {
      if (casterUuid && t.actor?.uuid === casterUuid) {
        dbgTemplate("select.collect.skipCaster", { name: tokenDebugName(t), uuid: tokenDebugUuid(t) });
        continue;
      }
      const u = t.document?.uuid;
      if (u) uuids.add(u);
    }
  }

  const result = [...uuids];
  dbgTemplate("select.collect.done", {
    uuids: result,
    names: result.map((uuid) => {
      const t = canvas.tokens?.placeables?.find(
        (tok) => tok.document?.uuid === uuid || tok.uuid === uuid
      );
      return tokenDebugName(t) || uuid;
    })
  });
  return result;
}

export async function resolveTemplateArea({
  activity,
  item = null,
  targetUuids = [],
  templateDoc = null,
  templateDocs = null,
  resolutionId = null
} = {}) {
  const docs = Array.isArray(templateDocs) && templateDocs.length
    ? templateDocs
    : (templateDoc ? [templateDoc] : []);

  if (!activity) {
    await maybeDeleteInstantTemplates(docs, activity, item);
    return { prompted: 0 };
  }

  let uuids = [...(targetUuids ?? [])];
  const casterActorUuid = item?.actor?.uuid ?? activity.actor?.uuid;
  const casterToken = canvas.tokens?.placeables?.find((t) => t.actor?.uuid === casterActorUuid) ?? null;
  dbgTemplate("select.resolveArea.start", {
    item: item?.name ?? null,
    activityId: activity?.id ?? activity?._id ?? null,
    passedUuids: uuids,
    docCount: docs.length,
    priorTargets: [...(game.user?.targets ?? [])].map((t) => tokenDebugName(t))
  });
  if (!uuids.length && docs.length) {
    uuids = await collectTemplateTargetUuids(docs, {
      activity,
      casterToken,
      casterUuid: casterActorUuid
    });
  } else if (uuids.length && docs.length) {
    // Still probe so console shows Foundry vs Illusive for the confirmed shape.
    for (const doc of docs) {
      const object = await waitForTemplateObject(doc);
      tokensInTemplateDoc(doc, {
        origin: casterToken?.center ?? null,
        wallsBlock: Boolean(activity?.target?.template?.walls),
        object
      });
    }
  }

  // Always sync canvas targets to the template hit list (empty clears leftovers).
  setTargets(
    uuids.map((uuid) => canvas.tokens?.placeables?.find(
      (t) => t.document?.uuid === uuid || t.uuid === uuid
    )).filter(Boolean)
  );

  if (!uuids.length) {
    await maybeDeleteInstantTemplates(docs, activity, item);
    return { prompted: 0 };
  }

  emitCombatFx({
    kind: "templateSave",
    subtype: item?.name ?? activity.name,
    actorUuid: item?.actor?.uuid ?? activity.actor?.uuid ?? null,
    targetUuids: uuids,
    origin: { itemUuid: item?.uuid ?? null, activityId: activity.id ?? activity._id }
  });

  // Cover for Dex saves is sampled from the caster token (effect origin for cones;
  // best available token origin for circles until point-based cover lands).
  const originUuid = casterToken?.document?.uuid ?? casterToken?.uuid ?? null;

  let result;
  if (activity.type === "save") {
    result = await resolveSaveActivity({
      activity,
      targetUuids: uuids,
      event: null,
      originUuid,
      resolutionId
    });
  } else {
    const savedByUuid = new Map(uuids.map((u) => [u, false]));
    const effects = await applyActivityEffects({ activity, targetUuids: uuids, savedByUuid });
    result = { prompted: uuids.length, effects, hitUuids: uuids };
  }

  await maybeDeleteInstantTemplates(docs, activity, item);
  return result;
}

function isConcentration(activity, item) {
  if (activity?.duration?.concentration) return true;
  const props = item?.system?.properties;
  if (props?.has?.("concentration")) return true;
  if (Array.isArray(props) && props.includes("concentration")) return true;
  return false;
}

function isInstantDuration(activity, item) {
  const override = activity?.duration?.override;
  const units = override
    ? activity?.duration?.units
    : (item?.system?.duration?.units ?? activity?.duration?.units);
  return units == null || units === "" || units === "inst" || units === "instantaneous";
}

export async function maybeDeleteInstantTemplate(templateDoc, activity, item) {
  if (!templateDoc) return;
  if (isConcentration(activity, item) || !isInstantDuration(activity, item)) return;
  try {
    await templateDoc.delete?.();
  } catch {
    /* ignore */
  }
}

export async function maybeDeleteInstantTemplates(templateDocs = [], activity, item) {
  const list = Array.isArray(templateDocs) ? templateDocs : (templateDocs ? [templateDocs] : []);
  for (const doc of list) await maybeDeleteInstantTemplate(doc, activity, item);
}

/**
 * Areas placed outside an Illusive-driven use (e.g. from the dnd5e sheet): resolve saves on the
 * placing user's client only.
 */
export async function handleTemplateCreated(templateDoc, { userId = null } = {}) {
  if (!templateDoc) return null;
  if (userId && userId !== game.user?.id) return null;
  if (!templateDoc.flags?.core?.MeasuredTemplate && !templateDoc.flags?.dnd5e?.activity) return null;
  if (isOwnedResolve()) return null;
  if (templateDoc.flags?.[MODULE_ID]?.resolvedByIllusive) return null;

  await waitForTemplateObject(templateDoc);

  const { activity, item } = await activityFromTemplate(templateDoc);
  if (!activity) return null;

  const casterUuid = item?.actor?.uuid ?? activity.actor?.uuid;
  const casterToken = canvas.tokens?.placeables?.find((t) => t.actor?.uuid === casterUuid) ?? null;
  const targetUuids = await collectTemplateTargetUuids([templateDoc], {
    activity,
    casterToken,
    casterUuid
  });
  if (!targetUuids.length) {
    await maybeDeleteInstantTemplate(templateDoc, activity, item);
    return { prompted: 0 };
  }
  return resolveTemplateArea({ activity, item, targetUuids, templateDoc });
}
