/**
 * A zone is a region a declaration places. It then ticks on a turn start,
 * when a creature enters, or once per square moved through it.
 */

import { MODULE_ID } from "../constants.mjs";
import { regionShapeData } from "../domain/combat/template-shape.mjs";
import { gridFeetBetween } from "../domain/spatial/geometry.mjs";
import { isTokenInsideTemplate } from "./template-saves.mjs";
import { settleSave } from "./triggers/settle-save.mjs";
import { createEmbedded } from "../foundry/write-gateway.mjs";
import { tokenForActor } from "../foundry/token-lookup.mjs";
import { isEconomyAvailable, markEconomyUsed } from "./economy.mjs";
import { isTokenInCombat } from "./action-economy.mjs";
import { averageDice, evaluateArithmetic } from "../domain/triggers/formula.mjs";
import { rollVisible } from "./dice.mjs";

export const ZONE_FLAG = "zone";
export const ZONE_WHENS = Object.freeze(["turnStart", "enter", "square"]);

function gridOf() {
  const grid = globalThis.canvas?.scene?.grid ?? globalThis.canvas?.grid ?? {};
  return {
    size: Number(grid.size) || 100,
    distance: Number(grid.distance) || 5
  };
}

export function squaresCrossed(feet) {
  const n = Number(feet);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(1, Math.floor(n / 5));
}

function zoneRegions() {
  const sceneList = globalThis.canvas?.scene?.regions?.contents
    ?? globalThis.canvas?.scene?.regions
    ?? [];
  const canvasList = (globalThis.canvas?.regions?.placeables ?? []).map((p) => p.document).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const region of [...sceneList, ...canvasList]) {
    const spec = region?.flags?.[MODULE_ID]?.[ZONE_FLAG];
    if (!spec || seen.has(region.id ?? region.uuid)) continue;
    seen.add(region.id ?? region.uuid);
    out.push({ region, spec });
  }
  return out;
}

async function amountFor(formula, actor) {
  const text = String(formula ?? "").trim();
  if (!text) return 0;
  const numeric = Number(text);
  if (Number.isFinite(numeric) && String(numeric) === text) return numeric;
  if (globalThis.Roll) {
    try {
      const roll = await rollVisible(text, { actor, flavor: "Zone" });
      const total = Number(roll?.total);
      if (Number.isFinite(total)) return total;
    } catch {
      /* average below */
    }
  }
  return evaluateArithmetic(averageDice(text)) ?? 0;
}

function ticks(spec, event) {
  if (spec.when === event) return true;
  return spec.when === "enterOrTurn" && (event === "turnStart" || event === "enter");
}

async function applySpec(actor, spec, times = 1) {
  const changes = [];
  const damage = (await amountFor(spec.damage, actor)) * times;
  const failEffect = spec.slowFeet ? {
    name: "Caltrops",
    transfer: false,
    changes: [{ key: "system.attributes.movement.walk", mode: 2, value: String(-Number(spec.slowFeet)) }],
    flags: { [MODULE_ID]: { specialDuration: ["healed"] } }
  } : null;
  changes.push(...await settleSave({
    actor,
    ability: spec.ability ?? null,
    dc: spec.dc ?? null,
    damage,
    damageType: spec.damageType ?? null,
    onSave: spec.onSave ?? "none",
    onFail: times > 0 ? (spec.onFail ?? null) : null,
    failEffect: times > 0 ? failEffect : null
  }));
  return changes;
}

export async function placeZone({ token, label, step }) {
  const scene = globalThis.canvas?.scene;
  const doc = token?.document ?? token;
  if (!scene?.createEmbeddedDocuments || !doc) return [];
  const grid = gridOf();
  const feet = Number(step.feet) || 0;
  const shape = regionShapeData({
    t: "emanation",
    x: Number(doc.x) || 0,
    y: Number(doc.y) || 0,
    distance: feet
  }, { gridSize: grid.size, gridDistance: grid.distance }, doc);
  const tokenId = doc.id ?? token?.id ?? null;
  const movable = Boolean(step.movable);
  const follow = step.follow !== false && !movable && !step.terrain && Boolean(tokenId);
  const spec = {
    when: step.when,
    feet,
    ability: step.ability ?? null,
    dc: step.dc ?? null,
    damage: step.damage ?? null,
    damageType: step.damageType ?? null,
    onSave: step.onSave ?? "none",
    onFail: step.onFail ?? null,
    follow,
    sourceId: (follow || movable || step.move) ? tokenId : null,
    terrain: Boolean(step.terrain),
    movable,
    burning: false,
    move: step.move ?? null,
    moveFeet: Number(step.moveFeet) || null,
    difficult: Boolean(step.difficult),
    flammable: Boolean(step.flammable),
    igniteDamage: step.igniteDamage ?? null,
    igniteWhen: step.igniteWhen ?? null,
    burnAway: Boolean(step.burnAway),
    slowFeet: Number(step.slowFeet) || null
  };
  const data = {
    name: label,
    shapes: [shape],
    flags: { [MODULE_ID]: { [ZONE_FLAG]: spec } }
  };
  if (follow) data.attachment = { token: tokenId };
  const made = await createEmbedded(scene, "Region", [data]);
  return made.undo ?? [];
}

function shiftShape(shape, dx, dy) {
  const next = { ...shape };
  if (Number.isFinite(Number(shape?.x))) next.x = shape.x + dx;
  if (Number.isFinite(Number(shape?.y))) next.y = shape.y + dy;
  if (shape?.base) {
    next.base = { ...shape.base };
    if (Number.isFinite(Number(shape.base.x))) next.base.x = shape.base.x + dx;
    if (Number.isFinite(Number(shape.base.y))) next.base.y = shape.base.y + dy;
  }
  return next;
}

/** Slide a zone this caster can move, toward `toward`, by at most `feet`. */
export async function moveZoneBy({ token, feet, toward }) {
  const doc = token?.document ?? token;
  const sourceId = doc?.id ?? token?.id ?? null;
  if (!sourceId || !toward) return [];
  const grid = gridOf();
  const budget = ((Number(feet) || 0) / grid.distance) * grid.size;
  if (!(budget > 0)) return [];
  const moved = [];
  for (const { region, spec } of zoneRegions()) {
    if (!spec.movable || spec.sourceId !== sourceId) continue;
    const shapes = region.shapes ?? region._source?.shapes;
    if (!Array.isArray(shapes)) continue;
    const origin = shapes[0]?.base ?? shapes[0] ?? { x: Number(doc.x) || 0, y: Number(doc.y) || 0 };
    const tx = toward?.center?.x ?? toward?.document?.x ?? toward?.x ?? origin.x;
    const ty = toward?.center?.y ?? toward?.document?.y ?? toward?.y ?? origin.y;
    const len = Math.hypot(tx - origin.x, ty - origin.y) || 1;
    const step = Math.min(budget, len);
    const dx = ((tx - origin.x) / len) * step;
    const dy = ((ty - origin.y) / len) * step;
    if (!dx && !dy) continue;
    const next = shapes.map((shape) => shiftShape(shape, dx, dy));
    if (typeof region.update === "function") await region.update({ shapes: next });
    else region.shapes = next;
    moved.push(region);
  }
  return moved;
}

/** Terrain under this creature catches fire and starts dealing fire damage. */
export async function igniteTerrain(token, { onlyFlammable = false } = {}) {
  const placeable = token?.actor || token?.document ? token : placeableFor(token);
  const lit = [];
  for (const { region, spec } of zoneRegions()) {
    if (!spec.terrain || spec.burning) continue;
    if (onlyFlammable && !spec.flammable) continue;
    if (placeable && !isTokenInsideTemplate(region, placeable)) continue;
    spec.burning = true;
    spec.damageType = "fire";
    if (spec.igniteDamage) spec.damage = spec.igniteDamage;
    else if (!spec.damage || spec.damage === "0") spec.damage = "1d4";
    if (spec.igniteWhen) spec.when = spec.igniteWhen;
    else if (spec.when !== "turnStart" && spec.when !== "enterOrTurn") spec.when = "square";
    if (spec.burnAway) spec.ability = null;
    const flags = { [MODULE_ID]: { [ZONE_FLAG]: { ...spec } } };
    if (typeof region.update === "function") await region.update({ flags });
    else region.flags = { ...(region.flags ?? {}), ...flags };
    lit.push(region);
  }
  return lit;
}

/** Move regions that follow this token, unless the attachment already did. */
export async function followCaster(tokenDoc, prior) {
  if (!tokenDoc || !prior) return;
  const dx = (Number(tokenDoc.x) || 0) - prior.x;
  const dy = (Number(tokenDoc.y) || 0) - prior.y;
  if (!dx && !dy) return;
  const sourceId = tokenDoc.id ?? null;
  for (const { region, spec } of zoneRegions()) {
    if (!spec.follow || spec.sourceId !== sourceId) continue;
    const shapes = region.shapes ?? region._source?.shapes;
    if (!Array.isArray(shapes) || typeof region.update !== "function") continue;
    const base = shapes[0]?.base;
    const hereX = Math.round(Number(tokenDoc.x) || 0);
    const hereY = Math.round(Number(tokenDoc.y) || 0);
    if (base && base.x === hereX && base.y === hereY) continue;
    await region.update({ shapes: shapes.map((shape) => shiftShape(shape, dx, dy)) });
  }
}

function placeableFor(doc) {
  return globalThis.canvas?.tokens?.placeables?.find((t) => t.document === doc || t.id === doc?.id)
    ?? (doc ? { document: doc, actor: doc.actor, id: doc.id } : null);
}

export async function tickZonesOnTurn(actor) {
  if (!actor) return [];
  const changes = [];
  for (const token of globalThis.canvas?.tokens?.placeables ?? []) {
    if (token.actor !== actor && token.actor?.uuid !== actor.uuid) continue;
    for (const { region, spec } of zoneRegions()) {
      if (spec.burning && spec.burnAway && spec.sourceId && (token.id === spec.sourceId || token.document?.id === spec.sourceId)) {
        if (typeof region.delete === "function") await region.delete();
        else if (region.parent?.deleteEmbeddedDocuments && region.id) {
          await region.parent.deleteEmbeddedDocuments("Region", [region.id]);
        }
        continue;
      }
      if (!ticks(spec, "turnStart")) continue;
      if (!isTokenInsideTemplate(region, token)) continue;
      changes.push(...await applySpec(token.actor, spec, 1));
    }
  }
  return changes;
}

export async function tickZoneMove(tokenDoc, prior) {
  if (!tokenDoc || !prior) return [];
  await followCaster(tokenDoc, prior);
  const token = placeableFor(tokenDoc);
  const actor = token?.actor ?? tokenDoc.actor;
  if (!actor) return [];
  const grid = gridOf();
  const feet = gridFeetBetween(
    { x: prior.x, y: prior.y },
    { x: tokenDoc.x, y: tokenDoc.y },
    { gridSize: grid.size, gridDistance: grid.distance }
  );
  const priorToken = { ...token, document: { ...tokenDoc, x: prior.x, y: prior.y } };
  const changes = [];
  for (const { region, spec } of zoneRegions()) {
    const insideNow = isTokenInsideTemplate(region, token);
    const insideThen = isTokenInsideTemplate(region, priorToken);
    if (ticks(spec, "enter") && insideNow && !insideThen) {
      changes.push(...await applySpec(actor, spec, 1));
    }
    if (spec.when === "square" && (insideNow || insideThen)) {
      const times = squaresCrossed(feet);
      if (times) changes.push(...await applySpec(actor, spec, times));
    }
  }
  return changes;
}

/** 2 while the token is in difficult terrain this module placed, else 1. */
export function movementCostMultiplier(tokenDoc) {
  const token = placeableFor(tokenDoc);
  if (!token) return 1;
  for (const { region, spec } of zoneRegions()) {
    if (!spec.difficult) continue;
    if (isTokenInsideTemplate(region, token)) return 2;
  }
  return 1;
}

/** Bonus-action buttons for zones the creature can move, such as Moonbeam. */
export function zoneBonusActions(actor) {
  const token = tokenForActor(actor);
  const sourceId = token?.document?.id ?? token?.id ?? null;
  if (!sourceId) return [];
  const out = [];
  for (const { region, spec } of zoneRegions()) {
    if (spec.move !== "bonus" || spec.sourceId !== sourceId) continue;
    const name = region.name ? `Move ${region.name}` : "Move zone";
    out.push({
      id: `zone:${region.id}`,
      itemId: `zone:${region.id}`,
      activityId: "",
      section: "bonus",
      activationType: "bonus",
      name,
      shortName: name,
      img: "icons/magic/light/beam-rays-orange.webp",
      needsTarget: true,
      hasTargets: (globalThis.game?.user?.targets?.size ?? 0) > 0,
      disabled: false,
      disabledReason: null,
      title: name,
      isZoneMove: true
    });
  }
  return out;
}

/** Spend a bonus action and slide that zone toward the current target. */
export async function movePlacedZone(token, regionId) {
  const actor = token?.actor;
  if (!actor || !regionId) return false;
  const toward = [...(globalThis.game?.user?.targets ?? [])][0] ?? null;
  if (!toward) return false;
  const found = zoneRegions().find(({ region }) => region.id === regionId || region.uuid === regionId);
  if (!found?.spec?.move) return false;
  if (isTokenInCombat(token)) {
    if (!isEconomyAvailable(actor, "bonus")) return false;
    await markEconomyUsed(actor, "bonus", { cost: "bonus" }, { token });
  }
  const feet = Number(found.spec.moveFeet) || 60;
  const moved = await moveZoneBy({ token, feet, toward });
  return moved.length > 0;
}
