/**
 * Push a token directly away from a source. Pixels, grid feet.
 */

export function pushDestination(source, target, feet, grid = {}) {
  const size = Number(grid.size) || 100;
  const distance = Number(grid.distance) || 5;
  const pixels = ((Number(feet) || 0) / distance) * size;
  const ax = source?.center?.x ?? source?.x ?? source?.document?.x ?? 0;
  const ay = source?.center?.y ?? source?.y ?? source?.document?.y ?? 0;
  const tx = target?.center?.x ?? target?.x ?? target?.document?.x ?? 0;
  const ty = target?.center?.y ?? target?.y ?? target?.document?.y ?? 0;
  const dx = tx - ax;
  const dy = ty - ay;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: (target?.document?.x ?? target?.x ?? 0) + (dx / len) * pixels,
    y: (target?.document?.y ?? target?.y ?? 0) + (dy / len) * pixels
  };
}
