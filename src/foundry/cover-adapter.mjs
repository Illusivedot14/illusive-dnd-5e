/**
 * Sample cover between two tokens using wall collisions along the attack line
 * and neighboring rays across the target footprint.
 */

import { getGridFacts, getTokenFacts, hasLineOfSight } from "./scene-adapter.mjs";
import { tokenFootprintCenter } from "../domain/spatial/geometry.mjs";
import { evaluateCover } from "../domain/combat/cover.mjs";

function centerOf(facts, gridSize) {
  const c = tokenFootprintCenter(facts, gridSize);
  return { cx: c.x, cy: c.y, ...facts };
}

/**
 * Estimate blocked fraction by casting several rays from attacker center
 * to points across the target footprint; count how many are wall-blocked.
 */
export function sampleBlockedFraction(attackerFacts, targetFacts, { gridSize, walls } = {}) {
  const size = gridSize || getGridFacts().size;
  const from = centerOf(attackerFacts, size);
  const tw = Math.max(1, Number(targetFacts.width) || 1);
  const th = Math.max(1, Number(targetFacts.height) || 1);
  const samples = [];
  const steps = 3;
  for (let ix = 0; ix < steps; ix += 1) {
    for (let iy = 0; iy < steps; iy += 1) {
      const tx = targetFacts.x + ((ix + 0.5) / steps) * tw * size;
      const ty = targetFacts.y + ((iy + 0.5) / steps) * th * size;
      samples.push({ cx: tx, cy: ty, x: tx, y: ty });
    }
  }

  let blocked = 0;
  for (const sample of samples) {
    const clear = hasLineOfSight(from, sample, walls);
    if (clear === false) blocked += 1;
  }
  return samples.length ? blocked / samples.length : 0;
}

export function evaluateTokenCover(attackerToken, targetToken, { edition = "2024" } = {}) {
  const grid = getGridFacts();
  const a = getTokenFacts(attackerToken);
  const t = getTokenFacts(targetToken);
  if (!a || !t) {
    return evaluateCover({ edition, blockedFraction: 0 });
  }

  const sameSquare = a.x === t.x && a.y === t.y;
  const walls = canvas?.walls?.placeables ?? [];
  const fraction = sampleBlockedFraction(a, t, { gridSize: grid.size, walls });
  const centerClear = hasLineOfSight(centerOf(a, grid.size), centerOf(t, grid.size), walls);
  const totalCover = centerClear === false && fraction >= 0.999;

  return evaluateCover({
    edition,
    blockedFraction: fraction,
    totalCover,
    sameSquare
  });
}

/** Re-export for callers that need the soft-cover band helper. */
export { isCoverAmbiguous } from "../domain/combat/cover.mjs";
