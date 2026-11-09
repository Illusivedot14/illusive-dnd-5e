/**
 * Flanking evaluation against the canvas.
 */

import { isFlanking, footprintsAdjacent } from "../domain/combat/flanking.mjs";
import { isFriendly } from "../domain/combat/disposition.mjs";
import { getTokenFacts, getGridFacts } from "../foundry/scene-adapter.mjs";
import { tokenFootprintCells, tokenFootprintCenter } from "../domain/spatial/geometry.mjs";

function footprintsAdjacentTokens(a, b, gridSize) {
  return footprintsAdjacent(
    tokenFootprintCells(getTokenFacts(a), gridSize),
    tokenFootprintCells(getTokenFacts(b), gridSize)
  );
}

/**
 * @param {Token} attackerToken
 * @param {Token} defenderToken
 * @returns {boolean}
 */
export function evaluateFlanking(attackerToken, defenderToken) {
  if (!attackerToken || !defenderToken) return false;
  const grid = getGridFacts();
  const size = grid.size || 100;
  if (!footprintsAdjacentTokens(attackerToken, defenderToken, size)) return false;

  const targetCenter = tokenFootprintCenter(getTokenFacts(defenderToken), size);
  const attackerCenter = tokenFootprintCenter(getTokenFacts(attackerToken), size);
  const allies = [];
  for (const other of canvas.tokens?.placeables ?? []) {
    if (!other?.actor || other.id === attackerToken.id || other.id === defenderToken.id) continue;
    if (!isFriendly(attackerToken, other)) continue;
    if (!footprintsAdjacentTokens(other, defenderToken, size)) continue;
    allies.push(tokenFootprintCenter(getTokenFacts(other), size));
  }
  return isFlanking(attackerCenter, targetCenter, allies);
}
