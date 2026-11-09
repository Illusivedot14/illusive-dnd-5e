/**
 * Normalize token, wall, door, grid, and light facts for domain services.
 */

export function getGridFacts(scene = canvas?.scene) {
  const grid = scene?.grid ?? {};
  return {
    size: Number(grid.size ?? 100) || 100,
    sizeX: Number(grid.sizeX ?? grid.size ?? 100) || 100,
    sizeY: Number(grid.sizeY ?? grid.size ?? 100) || 100,
    distance: Number(grid.distance ?? 5) || 5,
    units: grid.units ?? "ft",
    type: grid.type ?? 1,
    columns: Number(scene?.dimensions?.width ?? scene?.width ?? 0)
      ? Math.ceil((Number(scene.dimensions?.width ?? scene.width) || 0) / (Number(grid.sizeX ?? grid.size) || 100))
      : 0,
    rows: Number(scene?.dimensions?.height ?? scene?.height ?? 0)
      ? Math.ceil((Number(scene.dimensions?.height ?? scene.height) || 0) / (Number(grid.sizeY ?? grid.size) || 100))
      : 0
  };
}

export function getTokenFacts(token) {
  const doc = token?.document ?? token;
  if (!doc) return null;
  return {
    uuid: doc.uuid ?? null,
    id: doc.id ?? null,
    x: Number(doc.x ?? 0),
    y: Number(doc.y ?? 0),
    width: Number(doc.width ?? 1),
    height: Number(doc.height ?? 1),
    elevation: Number(doc.elevation ?? 0),
    disposition: doc.disposition ?? null,
    hidden: Boolean(doc.hidden),
    actorUuid: doc.actorLink ? doc.actor?.uuid : (token?.actor?.uuid ?? null)
  };
}

/** Pixel center → grid cell. */
export function pixelToGrid(x, y, grid = getGridFacts()) {
  const sx = grid.sizeX || grid.size || 100;
  const sy = grid.sizeY || grid.size || 100;
  return {
    x: Math.floor(Number(x) / sx),
    y: Math.floor(Number(y) / sy)
  };
}

export function gridToPixel(gx, gy, grid = getGridFacts()) {
  const sx = grid.sizeX || grid.size || 100;
  const sy = grid.sizeY || grid.size || 100;
  return {
    x: Number(gx) * sx,
    y: Number(gy) * sy
  };
}

/**
 * Build a set of blocked grid keys from walls (rough) and occupied tokens.
 */
export function collectBlockedCells({ scene = canvas?.scene, ignoreTokenId = null } = {}) {
  const grid = getGridFacts(scene);
  const blocked = new Set();
  const tokens = canvas?.tokens?.placeables ?? [];
  for (const t of tokens) {
    if (!t?.document || t.id === ignoreTokenId) continue;
    if (t.document.hidden && !game.user?.isGM) continue;
    const origin = pixelToGrid(t.document.x, t.document.y, grid);
    const w = Math.max(1, Math.round(Number(t.document.width) || 1));
    const h = Math.max(1, Math.round(Number(t.document.height) || 1));
    for (let dx = 0; dx < w; dx += 1) {
      for (let dy = 0; dy < h; dy += 1) {
        blocked.add(`${origin.x + dx},${origin.y + dy}`);
      }
    }
  }
  return { blocked, grid };
}

export function collectLightFacts(scene = canvas?.scene) {
  const lights = [];
  const ambient = scene?.lights?.contents ?? scene?.lights ?? [];
  for (const light of ambient) {
    lights.push({
      x: Number(light.x ?? 0),
      y: Number(light.y ?? 0),
      bright: Number(light.config?.bright ?? light.bright ?? 0),
      dim: Number(light.config?.dim ?? light.dim ?? 0)
    });
  }
  for (const token of canvas?.tokens?.placeables ?? []) {
    const l = token.document?.light;
    if (!l) continue;
    const bright = Number(l.bright ?? 0);
    const dim = Number(l.dim ?? 0);
    if (bright <= 0 && dim <= 0) continue;
    const cx = Number(token.document.x) + (Number(token.document.width) || 1) * (getGridFacts(scene).size) / 2;
    const cy = Number(token.document.y) + (Number(token.document.height) || 1) * (getGridFacts(scene).size) / 2;
    lights.push({ x: cx, y: cy, bright, dim });
  }
  return {
    lights,
    globalDarkness: Boolean(scene?.environment?.darknessLevel > 0.75 || scene?.darkness > 0.75)
  };
}

/** Simple LOS: no wall midpoint crossings (coarse). */
export function hasLineOfSight(a, b, walls = canvas?.walls?.placeables ?? []) {
  if (!a || !b) return null;
  const ax = a.x + (a.width || 0) * 50;
  const ay = a.y + (a.height || 0) * 50;
  // Prefer centers if width given in grid units — callers should pass centers.
  const x1 = a.cx ?? a.x;
  const y1 = a.cy ?? a.y;
  const x2 = b.cx ?? b.x;
  const y2 = b.cy ?? b.y;
  for (const wall of walls) {
    const doc = wall.document ?? wall;
    if (doc?.door && doc?.ds === 1) continue; // open door
    if (doc?.sight === 0 || doc?.move === 0 && doc?.sight === CONST?.WALL_SENSE_TYPES?.NONE) {
      /* sight-blocking check below */
    }
    const c = doc?.c ?? [doc?.x, doc?.y, doc?.x2, doc?.y2];
    if (!c || c.length < 4) continue;
    if (doc?.sight === CONST?.WALL_SENSE_TYPES?.NONE) continue;
    if (segmentsIntersect(x1, y1, x2, y2, c[0], c[1], c[2], c[3])) return false;
  }
  return true;
}

function segmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (d === 0) return false;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
  const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
