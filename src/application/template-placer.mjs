/**
 * Illusive template placement preview (PIXI).
 * On confirm, creates a Scene Region shaped like the dnd5e 6 template (same `flags.dnd5e` keys),
 * so dnd5e region behaviors, concentration links and Region hit tests all see it.
 *
 * Self-origin spells (range self): cone/ray stick to caster token edge;
 * emanations stick to caster center. Free placement otherwise (e.g. Fireball).
 */

import { MODULE_ID } from "../constants.mjs";
import {
  shapePolygonPoints,
  pointInTemplateShape,
  shapesForAreaTarget,
  regionShapeData
} from "../domain/combat/template-shape.mjs";
import {
  templateAnchorMode,
  tokenBorderPoint,
  directionToward
} from "../domain/combat/template-anchor.mjs";
import { emitCombatFx } from "./combat-fx.mjs";
import { debugLog, DEBUG_CHANNELS } from "../foundry/debug.mjs";

function dbgTemplate(tag, data = {}) {
  debugLog(DEBUG_CHANNELS.TEMPLATE, tag, data);
}

const WHITE = 0xffffff;
const FILL_ALPHA = 0.22;
const STROKE_ALPHA = 0.95;
const HIGHLIGHT_ALPHA = 0.2;

let bound = false;
let activePlacer = null;

function gridFacts() {
  const grid = canvas?.grid;
  return {
    gridSize: Number(grid?.size ?? 100) || 100,
    gridDistance: Number(grid?.distance ?? canvas?.scene?.grid?.distance ?? 5) || 5
  };
}

function resolveCasterToken(activity) {
  return activity?.actor?.getActiveTokens?.(true)?.[0]
    ?? activity?.item?.actor?.getActiveTokens?.(true)?.[0]
    ?? canvas.tokens?.controlled?.[0]
    ?? null;
}

/** Activity area sizes converted to the scene's grid units. */
function areaTargetInSceneUnits(activity) {
  const template = activity?.target?.template ?? {};
  const sceneUnits = canvas?.scene?.grid?.units;
  const convert = globalThis.dnd5e?.utils?.convertLength;
  const toScene = (value) => {
    if (!value) return value;
    if (typeof convert !== "function" || !template.units || !sceneUnits) return Number(value);
    try {
      return convert(value, template.units, sceneUnits, { strict: false });
    } catch {
      return Number(value);
    }
  };
  return {
    type: template.type,
    count: template.count,
    size: toScene(template.size),
    width: toScene(template.width),
    height: toScene(template.height)
  };
}

function snapPoint(point, layer) {
  if (typeof layer?.getSnappedPoint === "function") return layer.getSnappedPoint(point);
  const modes = globalThis.CONST?.GRID_SNAPPING_MODES;
  if (modes && typeof canvas.grid?.getSnappedPoint === "function") {
    return canvas.grid.getSnappedPoint(point, { mode: modes.CENTER | modes.VERTEX });
  }
  return { x: point.x, y: point.y };
}

/**
 * Sheet-initiated uses go through dnd5e's TemplatePlacement; swap in the Illusive preview.
 */
export function bindIllusiveTemplatePlacer() {
  if (bound) return;
  bound = true;

  Hooks.on("dnd5e.preCreateMeasuredTemplate", (activity) => {
    void placeActivityTemplates(activity);
    return false;
  });
}

/**
 * Place an activity's area templates via the Illusive preview.
 * @param {object} activity
 * @returns {Promise<object[]>} created Region documents (empty when dismissed)
 */
export async function placeActivityTemplates(activity) {
  if (!activity || !canvas?.scene) return [];
  const grid = gridFacts();
  const area = areaTargetInSceneUnits(activity);
  const shapes = shapesForAreaTarget(area, {
    gridDistance: grid.gridDistance,
    coneAngle: CONFIG?.MeasuredTemplate?.defaults?.angle
  });
  const created = [];
  for (const shape of shapes) {
    try {
      const docs = await placeWithIllusivePreview(activity, shape, area);
      if (Array.isArray(docs)) created.push(...docs);
      else if (docs) created.push(docs);
    } catch {
      break;
    }
  }
  return created;
}

function regionDataFor(activity, shape, area, { casterToken, anchorMode }) {
  const grid = gridFacts();
  const tokenDoc = casterToken?.document ?? null;
  const baseToken = shape.t === "emanation" && tokenDoc
    ? {
      x: tokenDoc.x,
      y: tokenDoc.y,
      width: tokenDoc.width,
      height: tokenDoc.height,
      shape: tokenDoc.shape ?? globalThis.CONST?.TOKEN_SHAPES?.RECTANGLE_1
    }
    : null;
  const regionShape = regionShapeData(shape, grid, baseToken);
  const attached = regionShape.type === "emanation" && !activity?.target?.template?.stationary;
  const item = activity?.item ?? null;

  const data = {
    name: `${item?.name ?? activity?.name ?? "Area"} [${game.user?.name ?? "?"}]`,
    color: "#ffffff",
    shapes: [regionShape],
    restriction: { enabled: true, type: "move" },
    attachment: { token: attached ? tokenDoc.id : null },
    visibility: CONST.REGION_VISIBILITY.ALWAYS,
    highlightMode: "coverage",
    flags: {
      core: { MeasuredTemplate: true },
      dnd5e: {
        activity: activity?.uuid ?? null,
        item: item?.uuid ?? null,
        origin: tokenDoc?.uuid ?? null,
        dimensions: {
          size: area.size,
          width: area.width,
          height: area.height,
          units: canvas.scene?.grid?.units
        },
        spellLevel: activity?.getRollData?.()?.item?.level ?? item?.system?.level ?? null
      },
      [MODULE_ID]: {
        illusivePlacer: true,
        previewShape: { ...shape },
        anchorMode: anchorMode ?? null,
        sourceTokenUuid: tokenDoc?.uuid ?? null
      }
    }
  };
  if (canvas.level?.id) data.levels = [canvas.level.id];
  return data;
}

/**
 * Interactive preview for one shape; resolves with the created Region documents.
 * @param {object} activity
 * @param {import("../domain/combat/template-shape.mjs").ShapeSpec} shape  mutated while aiming
 * @param {object} area  scene-unit area target
 * @returns {Promise<object[]>}
 */
export function placeWithIllusivePreview(activity, shape, area = {}) {
  if (activePlacer) {
    try { activePlacer.cancel(); } catch { /* ignore */ }
    activePlacer = null;
  }

  return new Promise((resolve, reject) => {
    const casterToken = resolveCasterToken(activity);
    const anchorMode = templateAnchorMode(activity, shape);
    if (shape.t === "emanation" && casterToken) {
      shape.baseWidth = casterToken.w;
      shape.baseHeight = casterToken.h;
    }

    const initialLayer = canvas.activeLayer;
    // TemplateLayer is deprecated in v14 but still keeps clicks off the token layer while aiming.
    const layer = canvas.templates ?? canvas.regions;
    layer.activate();

    const gfx = new PIXI.Graphics();
    gfx.eventMode = "none";
    const highlights = new PIXI.Graphics();
    highlights.eventMode = "none";

    const container = new PIXI.Container();
    container.name = "illusiveTemplatePlacer";
    container.addChild(highlights);
    container.addChild(gfx);
    (layer.preview ?? canvas.interface ?? canvas.stage).addChild(container);

    let moveTime = 0;
    let settled = false;
    let armConfirm = false;
    let lastHoverKey = "";

    const tokenCenter = (token) => token.center ?? { x: token.x + token.w / 2, y: token.y + token.h / 2 };

    const tokensInShape = () => {
      const grid = gridFacts();
      const hit = [];
      for (const token of canvas.tokens?.placeables ?? []) {
        if (!token?.actor || token.document?.hidden) continue;
        if (!pointInTemplateShape(shape, tokenCenter(token), grid)) continue;
        hit.push(token);
      }
      return hit;
    };

    const paint = () => {
      const grid = gridFacts();
      gfx.clear();
      highlights.clear();

      const pts = shapePolygonPoints(shape, grid);
      gfx.lineStyle({ width: 2, color: WHITE, alpha: STROKE_ALPHA });
      gfx.beginFill(WHITE, FILL_ALPHA);
      gfx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i += 1) gfx.lineTo(pts[i][0], pts[i][1]);
      gfx.closePath();
      gfx.endFill();

      gfx.lineStyle({ width: 2, color: WHITE, alpha: 1 });
      gfx.beginFill(WHITE, 1);
      gfx.drawCircle(0, 0, 5);
      gfx.endFill();

      container.position.set(shape.x, shape.y);

      const hit = tokensInShape();
      for (const token of hit) {
        const center = tokenCenter(token);
        const local = { x: center.x - shape.x, y: center.y - shape.y };
        const rw = (token.w || grid.gridSize) / 2;
        const rh = (token.h || grid.gridSize) / 2;
        highlights.lineStyle({ width: 2, color: WHITE, alpha: 1 });
        highlights.beginFill(WHITE, HIGHLIGHT_ALPHA);
        highlights.drawRoundedRect(local.x - rw, local.y - rh, rw * 2, rh * 2, 6);
        highlights.endFill();
      }

      const hoverKey = hit.map((t) => t.document?.uuid ?? t.name).join("|");
      if (hoverKey !== lastHoverKey) {
        lastHoverKey = hoverKey;
        dbgTemplate("placer.hover", {
          shape: { ...shape },
          highlighted: hit.map((t) => t.name ?? t.document?.name ?? "?")
        });
      }
    };

    /** Squares are placed by their centre but stored by their top-left corner. */
    const placeFree = (mouse) => {
      if (shape.t === "rect") {
        const half = ((shape.distance / gridFacts().gridDistance) * gridFacts().gridSize) / 2;
        const corner = snapPoint({ x: mouse.x - half, y: mouse.y - half }, layer);
        shape.x = corner.x;
        shape.y = corner.y;
        return;
      }
      const p = snapPoint(mouse, layer);
      shape.x = p.x;
      shape.y = p.y;
    };

    const aimFromPointer = (mouse) => {
      if (!casterToken || !anchorMode) {
        placeFree(mouse);
        return;
      }
      if (anchorMode === "center") {
        const c = tokenCenter(casterToken);
        shape.x = c.x;
        shape.y = c.y;
        return;
      }
      const snapped = snapPoint(tokenBorderPoint(casterToken, mouse.x, mouse.y), layer);
      shape.x = snapped.x;
      shape.y = snapped.y;
      shape.direction = directionToward(snapped, mouse);
    };

    const onMove = (event) => {
      event.stopPropagation?.();
      const now = Date.now();
      if (now - moveTime <= 16) return;
      moveTime = now;
      const mouse = event.data?.getLocalPosition?.(layer) ?? canvas.mousePosition;
      aimFromPointer(mouse);
      paint();
    };

    const onRotate = (event) => {
      if (shape.t !== "cone" && shape.t !== "ray") return;
      if (event.ctrlKey) event.preventDefault();
      event.stopPropagation?.();
      const delta = canvas.grid?.type > CONST.GRID_TYPES.SQUARE ? 30 : 15;
      const snap = event.shiftKey ? delta : 5;
      const nextDir = (Number(shape.direction) || 0) + (snap * Math.sign(event.deltaY || 0));
      if (anchorMode === "edge" && casterToken) {
        const rad = (nextDir * Math.PI) / 180;
        const c = tokenCenter(casterToken);
        const border = tokenBorderPoint(casterToken, c.x + Math.cos(rad) * 10000, c.y + Math.sin(rad) * 10000);
        const snapped = snapPoint(border, layer);
        shape.x = snapped.x;
        shape.y = snapped.y;
      }
      shape.direction = nextDir;
      paint();
    };

    const cleanup = () => {
      canvas.stage.off("mousemove", onMove);
      canvas.stage.off("mouseup", onConfirm);
      if (canvas.app?.view) {
        canvas.app.view.oncontextmenu = null;
        canvas.app.view.onwheel = null;
      }
      try { container.destroy({ children: true }); } catch { /* ignore */ }
      try { initialLayer?.activate?.(); } catch { /* ignore */ }
      if (activePlacer === api) activePlacer = null;
    };

    const onConfirm = async (event) => {
      event?.stopPropagation?.();
      if (!armConfirm || settled) return;
      settled = true;
      cleanup();

      aimFromPointer(canvas.mousePosition ?? { x: shape.x, y: shape.y });
      const data = regionDataFor(activity, shape, area, { casterToken, anchorMode });
      const hit = tokensInShape();
      dbgTemplate("placer.confirm", {
        shape: { ...shape },
        anchorMode,
        illusiveHighlighted: hit.map((t) => ({ name: t.name ?? t.document?.name, uuid: t.document?.uuid ?? null })),
        regionShape: data.shapes[0]
      });

      emitCombatFx({
        kind: "templatePlace",
        subtype: shape.t,
        actorUuid: activity?.actor?.uuid ?? null,
        origin: {
          itemUuid: activity?.item?.uuid ?? null,
          activityId: activity?.id ?? null
        },
        outcome: {
          x: shape.x,
          y: shape.y,
          distance: shape.distance,
          direction: shape.direction,
          anchorMode
        }
      });

      try {
        const created = await canvas.scene.createEmbeddedDocuments("Region", [data]);
        dbgTemplate("placer.created", {
          ids: (created ?? []).map((d) => d?.id),
          shapes: (created ?? []).map((d) => d?.shapes?.[0] ?? null)
        });
        resolve(created ?? []);
      } catch (err) {
        dbgTemplate("placer.create-failed", { error: String(err?.message ?? err) });
        reject(err);
      }
    };

    const onCancel = (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("cancelled"));
    };

    const api = { cancel: onCancel };
    activePlacer = api;

    canvas.stage.on("mousemove", onMove);
    if (canvas.app?.view) {
      canvas.app.view.oncontextmenu = onCancel;
      canvas.app.view.onwheel = onRotate;
    }

    const start = canvas.mousePosition
      ?? (casterToken ? { x: tokenCenter(casterToken).x + casterToken.w, y: tokenCenter(casterToken).y } : { x: 0, y: 0 });
    aimFromPointer(start);
    paint();

    const arm = () => {
      if (settled) return;
      armConfirm = true;
      canvas.stage.on("mouseup", onConfirm);
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(arm));
    } else {
      setTimeout(arm, 50);
    }
  });
}
