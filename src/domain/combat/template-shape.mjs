/**
 * Pure AoE shape helpers for Illusive template placement (no PIXI).
 */

/**
 * Shapes are in grid distance units (feet) with a pixel origin.
 * rect: square of side `distance` with its top-left corner at the origin.
 * emanation: `distance` beyond a token footprint of baseWidth × baseHeight pixels centred on the origin.
 * @typedef {"circle"|"cone"|"ray"|"rect"|"emanation"} TemplateShape
 * @typedef {{ x: number, y: number, direction?: number, distance: number, angle?: number, width?: number,
 *   baseWidth?: number, baseHeight?: number, t: TemplateShape }} ShapeSpec
 */

export const DEFAULT_CONE_ANGLE = 53.13;

/** dnd5e `target.template.type` → Illusive preview shape. */
const AREA_SHAPES = {
  circle: "circle",
  sphere: "circle",
  cylinder: "circle",
  ring: "circle",
  cone: "cone",
  line: "ray",
  wall: "ray",
  cube: "rect",
  square: "rect",
  radius: "emanation"
};

export function templateShapeForArea(areaType) {
  return AREA_SHAPES[areaType] ?? null;
}

/**
 * Initial preview shapes for an activity's area target (one per `count`).
 * @param {{ type?: string, size?: number|string, width?: number|string, count?: number|string }} template
 * @param {{ gridDistance?: number, coneAngle?: number }} [opts]
 * @returns {ShapeSpec[]}
 */
export function shapesForAreaTarget(template, { gridDistance = 5, coneAngle = DEFAULT_CONE_ANGLE } = {}) {
  const t = templateShapeForArea(template?.type);
  if (!t) return [];
  const distance = Number(template?.size) || 0;
  const shape = { t, x: 0, y: 0, direction: 0, distance, angle: 0, width: 0 };
  if (t === "cone") shape.angle = Number(coneAngle) || DEFAULT_CONE_ANGLE;
  if (t === "ray") shape.width = Number(template?.width) || gridDistance;
  const count = Math.max(1, Math.floor(Number(template?.count) || 1));
  return Array.from({ length: count }, () => ({ ...shape }));
}

/**
 * Foundry Region shape data (pixels) for a feet-based shape.
 * @param {ShapeSpec} shape
 * @param {{ gridDistance?: number, gridSize?: number }} grid
 * @param {{ x: number, y: number, width: number, height: number, shape?: number }|null} [token]
 *   Caster token document data (grid units for width/height) — required for emanations.
 */
export function regionShapeData(shape, grid = {}, token = null) {
  const gridDistance = grid.gridDistance || 5;
  const gridSize = grid.gridSize || 100;
  const px = (feet) => ((Number(feet) || 0) / gridDistance) * gridSize;
  const x = Number(shape?.x) || 0;
  const y = Number(shape?.y) || 0;
  const rotation = Number(shape?.direction) || 0;
  switch (shape?.t) {
    case "cone":
      return { type: "cone", x, y, radius: px(shape.distance), angle: Number(shape.angle) || DEFAULT_CONE_ANGLE, rotation };
    case "ray":
      return { type: "line", x, y, length: px(shape.distance), width: px(shape.width || gridDistance), rotation };
    case "rect":
      return { type: "rectangle", x, y, width: px(shape.distance), height: px(shape.distance), rotation: 0 };
    case "emanation":
      if (token) {
        return {
          type: "emanation",
          radius: px(shape.distance),
          base: {
            type: "token",
            x: Math.round(Number(token.x) || 0),
            y: Math.round(Number(token.y) || 0),
            width: Number(token.width) || 1,
            height: Number(token.height) || 1,
            shape: token.shape
          }
        };
      }
      return { type: "circle", x, y, radius: px(shape.distance) + Math.max(Number(shape.baseWidth) || 0, Number(shape.baseHeight) || 0) / 2 };
    default:
      return { type: "circle", x, y, radius: px(shape?.distance) };
  }
}

/** Degrees → radians. */
export function degToRad(deg) {
  return (Number(deg) || 0) * (Math.PI / 180);
}

/**
 * Distance in grid feet from origin to point, given pixels-per-distance.
 * @param {{x:number,y:number}} origin
 * @param {{x:number,y:number}} point
 * @param {number} gridDistance feet per grid unit
 * @param {number} gridSize pixels per grid unit
 */
export function feetBetweenPoints(origin, point, { gridDistance = 5, gridSize = 100 } = {}) {
  const dx = (point.x - origin.x) / (gridSize || 100);
  const dy = (point.y - origin.y) / (gridSize || 100);
  return Math.hypot(dx, dy) * (gridDistance || 5);
}

/**
 * Angle in degrees from origin → point (Foundry: 0 = right / east, clockwise positive in some versions;
 * MeasuredTemplate direction is degrees clockwise from east-ish — match Foundry: 0 east, increases clockwise).
 */
export function directionToPoint(origin, point) {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  // Foundry canvas y grows down; atan2(dy,dx) then convert to Foundry direction (0 east, clockwise)
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

function angleDelta(a, b) {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

/**
 * Is a world-pixel point inside the AoE shape?
 * @param {ShapeSpec} shape
 * @param {{x:number,y:number}} point
 * @param {{ gridDistance?: number, gridSize?: number }} grid
 */
export function pointInTemplateShape(shape, point, grid = {}) {
  if (!shape || !point) return false;
  const gridDistance = grid.gridDistance || 5;
  const gridSize = grid.gridSize || 100;
  const origin = { x: Number(shape.x) || 0, y: Number(shape.y) || 0 };
  const feet = feetBetweenPoints(origin, point, { gridDistance, gridSize });
  const distance = Number(shape.distance) || 0;
  const t = shape.t || "circle";
  const dir = Number(shape.direction) || 0;

  if (t === "circle") return feet <= distance + 1e-6;

  if (t === "cone") {
    if (feet > distance + 1e-6) return false;
    const angle = Number(shape.angle) || 53.13;
    const facing = directionToPoint(origin, point);
    return angleDelta(facing, dir) <= angle / 2 + 1e-6;
  }

  if (t === "ray") {
    const width = Number(shape.width) || gridDistance;
    if (feet > distance + 1e-6) return false;
    const facing = directionToPoint(origin, point);
    // Half-width as an angular + perpendicular distance check
    const rad = degToRad(dir);
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const along = dx * ux + dy * uy;
    if (along < -1e-6 || along > (distance / gridDistance) * gridSize + 1e-6) return false;
    const perp = Math.abs(-dy * ux + dx * uy);
    const halfWidthPx = (width / gridDistance) * gridSize / 2;
    return perp <= halfWidthPx + 1e-6 && angleDelta(facing, dir) <= 90;
  }

  if (t === "rect") {
    const side = (distance / gridDistance) * gridSize;
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    return dx >= -1e-6 && dx <= side + 1e-6 && dy >= -1e-6 && dy <= side + 1e-6;
  }

  if (t === "emanation") {
    const halfW = (Number(shape.baseWidth) || 0) / 2;
    const halfH = (Number(shape.baseHeight) || 0) / 2;
    const gapX = Math.max(0, Math.abs(point.x - origin.x) - halfW);
    const gapY = Math.max(0, Math.abs(point.y - origin.y) - halfH);
    return (Math.hypot(gapX, gapY) / gridSize) * gridDistance <= distance + 1e-6;
  }

  return false;
}

/**
 * Build PIXI-friendly polygon points (local coords, origin at 0,0) for preview stroke/fill.
 * Returns array of [x,y] in pixels.
 */
export function shapePolygonPoints(shape, grid = {}) {
  const gridDistance = grid.gridDistance || 5;
  const gridSize = grid.gridSize || 100;
  const px = (feet) => (feet / gridDistance) * gridSize;
  const t = shape.t || "circle";
  const distance = Number(shape.distance) || 0;
  const dir = Number(shape.direction) || 0;
  const rad = degToRad(dir);
  const r = px(distance);

  if (t === "circle") {
    const pts = [];
    const steps = 48;
    for (let i = 0; i <= steps; i += 1) {
      const a = (i / steps) * Math.PI * 2;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return pts;
  }

  if (t === "cone") {
    const angle = Number(shape.angle) || 53.13;
    const half = degToRad(angle / 2);
    const pts = [[0, 0]];
    const steps = 24;
    for (let i = 0; i <= steps; i += 1) {
      const a = rad - half + (i / steps) * (half * 2);
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    pts.push([0, 0]);
    return pts;
  }

  if (t === "ray") {
    const width = Number(shape.width) || gridDistance;
    const half = px(width) / 2;
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);
    const px_ = -uy;
    const py_ = ux;
    return [
      [px_ * half, py_ * half],
      [ux * r + px_ * half, uy * r + py_ * half],
      [ux * r - px_ * half, uy * r - py_ * half],
      [-px_ * half, -py_ * half],
      [px_ * half, py_ * half]
    ];
  }

  if (t === "emanation") {
    // Rounded rectangle: token footprint grown by `distance` on every side.
    const halfW = (Number(shape.baseWidth) || 0) / 2;
    const halfH = (Number(shape.baseHeight) || 0) / 2;
    const corners = [[halfW, halfH, 0], [-halfW, halfH, 90], [-halfW, -halfH, 180], [halfW, -halfH, 270]];
    const pts = [];
    const steps = 12;
    for (const [cx, cy, start] of corners) {
      for (let i = 0; i <= steps; i += 1) {
        const a = degToRad(start + (i / steps) * 90);
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
    }
    pts.push(pts[0]);
    return pts;
  }

  const side = px(distance);
  return [[0, 0], [side, 0], [side, side], [0, side], [0, 0]];
}
