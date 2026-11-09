/**
 * Movement preview / commit use cases.
 */

import { evaluateMove } from "../domain/movement/evaluate-move.mjs";
import {
  collectBlockedCells,
  getGridFacts,
  getTokenFacts,
  gridToPixel,
  pixelToGrid
} from "../foundry/scene-adapter.mjs";
import { featureEnabled } from "./levels.mjs";
import { MODULE_ID } from "../constants.mjs";
import { movementSpeed } from "../domain/combat/actor-paths.mjs";

const previews = new Map();
let previewSeq = 0;

function remainingFeet(token) {
  const combat = game.combat?.started ? game.combat : null;
  const moved = Number(token?.document?.movement?.spent ?? token?.document?.flags?.[MODULE_ID]?.movedFeet ?? 0);
  const walk = movementSpeed(token?.actor?.system?.attributes?.movement, "walk") || 30;
  if (!combat) return walk;
  return Math.max(0, walk - moved);
}

/**
 * @param {{ tokenUuid: string, destination: { x: number, y: number } }} args
 *   destination in scene pixels
 */
export async function preview({ tokenUuid, destination }) {
  if (!featureEnabled("movementPreview")) {
    return { previewId: null, status: "disabled", reason: "automation-level" };
  }
  const tokenDoc = await fromUuid(tokenUuid);
  const token = tokenDoc?.object ?? canvas.tokens?.placeables?.find((t) => t.document?.uuid === tokenUuid);
  const facts = getTokenFacts(token ?? tokenDoc);
  if (!facts) return { previewId: null, status: "error", reason: "missing-token" };

  const grid = getGridFacts();
  const { blocked } = collectBlockedCells({ ignoreTokenId: facts.id });
  // Allow standing cell
  const fromGrid = pixelToGrid(facts.x, facts.y, grid);
  blocked.delete(`${fromGrid.x},${fromGrid.y}`);
  const toGrid = pixelToGrid(destination.x, destination.y, grid);

  const evaluation = evaluateMove({
    fromGrid,
    toGrid,
    remainingFeet: remainingFeet(token),
    gridDistance: grid.distance,
    blocked
  });

  const id = `${MODULE_ID}:move:${Date.now()}:${++previewSeq}`;
  const record = {
    previewId: id,
    tokenUuid,
    destination,
    fromGrid,
    toGrid,
    evaluation,
    grid,
    status: evaluation.ok ? "ok" : "blocked",
    reason: evaluation.reason,
    route: evaluation.path.map((p) => gridToPixel(p.x, p.y, grid)),
    costFeet: evaluation.costFeet,
    remainingAfter: evaluation.remainingAfter
  };
  previews.set(id, record);
  return record;
}

export async function commit({ previewId }) {
  const preview = previews.get(previewId);
  if (!preview) return { previewId, status: "error", reason: "unknown-preview" };
  if (!preview.evaluation?.ok) {
    return { previewId, status: "blocked", reason: preview.reason };
  }

  const tokenDoc = await fromUuid(preview.tokenUuid);
  if (!tokenDoc) return { previewId, status: "error", reason: "missing-token" };

  const last = preview.route[preview.route.length - 1];
  const prior = { x: tokenDoc.x, y: tokenDoc.y };
  await tokenDoc.update(
    { x: last.x, y: last.y },
    { illusiveDndBypassMovementBudget: true }
  );

  const spent = Number(tokenDoc.getFlag?.(MODULE_ID, "movedFeet") ?? 0) + (preview.costFeet ?? 0);
  try {
    await tokenDoc.setFlag(MODULE_ID, "movedFeet", spent);
    await tokenDoc.setFlag(MODULE_ID, "lastMove", { prior, costFeet: preview.costFeet, at: Date.now() });
  } catch {
    /* flags optional in tests */
  }

  try {
    const { recordMovementOnGameLog, isGameLogEnabled } = await import("./combat-game-log.mjs");
    if (isGameLogEnabled()) {
      const token = tokenDoc.object ?? tokenDoc;
      const name = token?.name ?? tokenDoc.name ?? "Token";
      recordMovementOnGameLog({
        tokenUuid: preview.tokenUuid,
        actorUuid: token?.actor?.uuid ?? tokenDoc.actor?.uuid ?? null,
        label: `${name} moved`,
        detail: preview.costFeet ? `Combat movement (${preview.costFeet} ft)` : "Combat movement",
        appliedChanges: [{
          type: "token-position",
          tokenUuid: preview.tokenUuid,
          prior,
          next: last,
          costFeet: preview.costFeet
        }]
      });
    }
  } catch {
    /* game log optional */
  }

  previews.delete(previewId);
  return {
    previewId,
    status: "committed",
    costFeet: preview.costFeet,
    remainingAfter: preview.remainingAfter,
    appliedChanges: [{
      type: "token-position",
      tokenUuid: preview.tokenUuid,
      prior,
      next: last,
      costFeet: preview.costFeet
    }]
  };
}

export async function undoLastMove({ tokenUuid }) {
  const tokenDoc = await fromUuid(tokenUuid);
  if (!tokenDoc) return { ok: false, reason: "missing-token" };
  const last = tokenDoc.getFlag?.(MODULE_ID, "lastMove");
  if (!last?.prior) return { ok: false, reason: "nothing-to-undo" };
  await tokenDoc.update({ x: last.prior.x, y: last.prior.y });
  const spent = Math.max(0, Number(tokenDoc.getFlag?.(MODULE_ID, "movedFeet") ?? 0) - (last.costFeet ?? 0));
  await tokenDoc.setFlag(MODULE_ID, "movedFeet", spent);
  await tokenDoc.unsetFlag?.(MODULE_ID, "lastMove");
  return { ok: true, prior: last.prior };
}

export function getPreview(previewId) {
  return previews.get(previewId) ?? null;
}
