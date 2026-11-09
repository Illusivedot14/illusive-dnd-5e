/**
 * Shared grid / unit / coordinate calculations. Pure.
 */

export function pixelsToGridUnits(pixels, gridSize, gridDistance) {
  const size = Number(gridSize) || 1;
  const distance = Number(gridDistance) || 1;
  return (Number(pixels) / size) * distance;
}

export function gridUnitsToPixels(units, gridSize, gridDistance) {
  const size = Number(gridSize) || 1;
  const distance = Number(gridDistance) || 1;
  return (Number(units) / distance) * size;
}
