/**
 * Grid pathfinding over normalized scene facts. Pure.
 * A* on square grid; blocked cells from walls/occupied.
 *
 * Climb / ceilings (deferred): this graph is 2D only. Token elevation and
 * Foundry v14 levels/ceilings are not edges here. Movement modes include a
 * "climb" label in application/token-movement.mjs but do not change this
 * path cost model. A later slice would add elevation-aware neighbors
 * (climb cost, roof/ceiling blocks) using scene levels + token elevation.
 */

function key(x, y) {
  return `${x},${y}`;
}

function heuristic(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * @param {{ x: number, y: number }} start  grid coords
 * @param {{ x: number, y: number }} goal
 * @param {{
 *   blocked?: Set<string>,
 *   maxCost?: number,
 *   allowDiagonal?: boolean
 * }} [opts]
 * @returns {{ path: {x:number,y:number}[], cost: number, blocked: boolean, reason: string|null }}
 */
export function findPath(start, goal, opts = {}) {
  const blocked = opts.blocked ?? new Set();
  const maxCost = opts.maxCost ?? 200;
  const diagonal = opts.allowDiagonal !== false;
  const startK = key(start.x, start.y);
  const goalK = key(goal.x, goal.y);
  if (blocked.has(goalK)) {
    return { path: [], cost: 0, blocked: true, reason: "destination-blocked" };
  }

  const open = [{ x: start.x, y: start.y, g: 0, f: heuristic(start, goal) }];
  const came = new Map();
  const gScore = new Map([[startK, 0]]);

  const deltas = diagonal
    ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
    : [[1, 0], [-1, 0], [0, 1], [0, -1]];

  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift();
    const ck = key(current.x, current.y);
    if (ck === goalK) {
      const path = [{ x: current.x, y: current.y }];
      let cur = ck;
      while (came.has(cur)) {
        cur = came.get(cur);
        const [x, y] = cur.split(",").map(Number);
        path.push({ x, y });
      }
      path.reverse();
      return { path, cost: gScore.get(goalK) ?? path.length - 1, blocked: false, reason: null };
    }
    if (current.g >= maxCost) continue;

    for (const [dx, dy] of deltas) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const nk = key(nx, ny);
      if (blocked.has(nk) && nk !== goalK) continue;
      const step = dx !== 0 && dy !== 0 ? 1.5 : 1;
      const tentative = current.g + step;
      if (tentative >= (gScore.get(nk) ?? Infinity)) continue;
      came.set(nk, ck);
      gScore.set(nk, tentative);
      open.push({ x: nx, y: ny, g: tentative, f: tentative + heuristic({ x: nx, y: ny }, goal) });
    }
  }

  return { path: [], cost: 0, blocked: true, reason: "no-path" };
}
