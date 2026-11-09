/**
 * Shared footprints, distances, and spatial primitives. Pure.
 */

export function distanceBetween(a, b) {
  const dx = Number(a?.x ?? 0) - Number(b?.x ?? 0);
  const dy = Number(a?.y ?? 0) - Number(b?.y ?? 0);
  return Math.hypot(dx, dy);
}

/** Square-grid (Chebyshev) distance in cells between two pixel centers. */
export function gridCellsBetween(a, b, gridSize) {
  const size = Number(gridSize) || 100;
  const dx = Math.abs(Number(a?.x ?? 0) - Number(b?.x ?? 0)) / size;
  const dy = Math.abs(Number(a?.y ?? 0) - Number(b?.y ?? 0)) / size;
  return Math.max(dx, dy);
}

/** 5e square distance in feet (diagonal counts as 1 square). */
export function gridFeetBetween(a, b, { gridSize = 100, gridDistance = 5 } = {}) {
  const cells = gridCellsBetween(a, b, gridSize);
  return cells * (Number(gridDistance) || 5);
}

export function tokenFootprintCenter(token, gridSize) {
  const size = Number(gridSize) || 100;
  const w = Number(token?.width ?? 1) || 1;
  const h = Number(token?.height ?? 1) || 1;
  return {
    x: Number(token?.x ?? 0) + (w * size) / 2,
    y: Number(token?.y ?? 0) + (h * size) / 2
  };
}

/**
 * Token footprint in grid cells (top-left col/row + width/height in squares).
 * @param {{ x?: number, y?: number, width?: number, height?: number }} token
 * @param {number} [gridSize=100]
 */
export function tokenFootprintCells(token, gridSize = 100) {
  const size = Number(gridSize) || 100;
  const width = Math.max(1, Math.round(Number(token?.width ?? 1) || 1));
  const height = Math.max(1, Math.round(Number(token?.height ?? 1) || 1));
  return {
    col: Math.round(Number(token?.x ?? 0) / size),
    row: Math.round(Number(token?.y ?? 0) / size),
    width,
    height
  };
}

/**
 * Chebyshev distance in cells between closest squares of two footprints.
 * Adjacent Mediums → 1; Large beside Medium → 1; overlapping → 0.
 * Matches 5e grid counting (include target square, not yours).
 */
export function footprintCellsBetween(a, b, gridSize = 100) {
  const A = tokenFootprintCells(a, gridSize);
  const B = tokenFootprintCells(b, gridSize);
  const aColMax = A.col + A.width - 1;
  const aRowMax = A.row + A.height - 1;
  const bColMax = B.col + B.width - 1;
  const bRowMax = B.row + B.height - 1;

  let dx = 0;
  if (aColMax < B.col) dx = B.col - aColMax;
  else if (bColMax < A.col) dx = A.col - bColMax;

  let dy = 0;
  if (aRowMax < B.row) dy = B.row - aRowMax;
  else if (bRowMax < A.row) dy = A.row - bRowMax;

  return Math.max(dx, dy);
}

/** 5e footprint distance in feet (accounts for creature size / token width×height). */
export function footprintFeetBetween(a, b, { gridSize = 100, gridDistance = 5 } = {}) {
  return footprintCellsBetween(a, b, gridSize) * (Number(gridDistance) || 5);
}

/**
 * Footprint distance including elevation (Chebyshev 3D).
 * Prefer committed `_source` positions when callers pass them.
 */
export function spaceFeetBetween(a, b, {
  gridSize = 100,
  gridDistance = 5,
  includeElevation = true
} = {}) {
  const planar = footprintFeetBetween(a, b, { gridSize, gridDistance });
  if (!includeElevation) return planar;
  // Lazy import avoided — vertical helpers live in range.mjs; inline slab gap here to keep geometry self-contained.
  const step = Number(gridDistance) || 5;
  const slab = (t) => {
    const elev = Number(t?.elevation) || 0;
    const depthSquares = Number.isFinite(Number(t?.depth))
      ? Math.max(0, Number(t.depth))
      : Math.max(1, Number(t?.width) || 1, Number(t?.height) || 1);
    return { bottom: elev, top: elev + depthSquares * step };
  };
  const A = slab(a);
  const B = slab(b);
  let vertical = 0;
  if (A.top < B.bottom) vertical = B.bottom - A.top;
  else if (B.top < A.bottom) vertical = A.bottom - B.top;
  return Math.max(planar, vertical);
}
