/**
 * Optional flanking — attacker has advantage if an ally is adjacent to the
 * target on the opposite side (simple adjacent-ally rule, 5e DMG optional).
 */

/**
 * @param {{ col: number, row: number, width?: number, height?: number }} a
 * @param {{ col: number, row: number, width?: number, height?: number }} b
 * @returns {boolean} footprints share an edge or corner (Chebyshev ≤ 1, not overlapping)
 */
export function footprintsAdjacent(a, b) {
  const aColMax = a.col + (a.width ?? 1) - 1;
  const aRowMax = a.row + (a.height ?? 1) - 1;
  const bColMax = b.col + (b.width ?? 1) - 1;
  const bRowMax = b.row + (b.height ?? 1) - 1;

  let dx = 0;
  if (aColMax < b.col) dx = b.col - aColMax;
  else if (bColMax < a.col) dx = a.col - bColMax;

  let dy = 0;
  if (aRowMax < b.row) dy = b.row - aRowMax;
  else if (bRowMax < a.row) dy = a.row - bRowMax;

  const d = Math.max(dx, dy);
  return d === 1;
}

/**
 * True when attacker and at least one ally are both adjacent to the target
 * and on roughly opposite sides (dot product of vectors ≤ 0).
 *
 * @param {{ x: number, y: number }} attackerCenter
 * @param {{ x: number, y: number }} targetCenter
 * @param {Array<{ x: number, y: number }>} allyCenters
 */
export function isFlanking(attackerCenter, targetCenter, allyCenters = []) {
  if (!allyCenters.length) return false;
  const ax = attackerCenter.x - targetCenter.x;
  const ay = attackerCenter.y - targetCenter.y;
  const aLen = Math.hypot(ax, ay) || 1;
  for (const ally of allyCenters) {
    const bx = ally.x - targetCenter.x;
    const by = ally.y - targetCenter.y;
    const bLen = Math.hypot(bx, by) || 1;
    const dot = (ax / aLen) * (bx / bLen) + (ay / aLen) * (by / bLen);
    if (dot <= 0) return true;
  }
  return false;
}
