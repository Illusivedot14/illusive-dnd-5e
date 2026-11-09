/**
 * Movement legality / cost from selected rules. Pure.
 */

import { findPath } from "./find-path.mjs";

/**
 * @param {object} input
 * @param {{ x: number, y: number }} input.fromGrid
 * @param {{ x: number, y: number }} input.toGrid
 * @param {number} input.remainingFeet
 * @param {number} input.gridDistance  feet per cell
 * @param {Set<string>} [input.blocked]
 * @param {boolean} [input.dashing]
 */
export function evaluateMove(input) {
  const cellFeet = Number(input.gridDistance) || 5;
  const remaining = Number(input.remainingFeet);

  // Find a geometric path first; movement budget is checked after.
  const result = findPath(input.fromGrid, input.toGrid, {
    blocked: input.blocked,
    maxCost: 200
  });

  if (result.blocked) {
    return {
      ok: false,
      reason: result.reason,
      path: [],
      costFeet: 0,
      remainingAfter: remaining,
      steps: []
    };
  }

  const costFeet = result.cost * cellFeet;
  if (Number.isFinite(remaining) && costFeet - 0.01 > remaining) {
    return {
      ok: false,
      reason: "insufficient-movement",
      path: result.path,
      costFeet,
      remainingAfter: remaining,
      steps: result.path
    };
  }

  return {
    ok: true,
    reason: null,
    path: result.path,
    costFeet,
    remainingAfter: Number.isFinite(remaining) ? Math.max(0, remaining - costFeet) : null,
    steps: result.path,
    dashing: Boolean(input.dashing)
  };
}
