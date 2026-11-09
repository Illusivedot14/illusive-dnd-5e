import { MODULE_ID } from "../../../constants.mjs";
import { applyHudBandVariables } from "../hud-bounds.mjs";
import { removeHudOverlayIfEmpty } from "../hud-mount.mjs";
import { publishTurnTrackerBounds } from "../../components/turn-tracker/turn-tracker-position.mjs";
import { positionTokenStatuses } from "../../components/token-statuses/token-statuses.mjs";
import { resolveRenderMask } from "./scopes.mjs";
import { getHudPanels } from "./registry.mjs";
import { beginMemberCache, endMemberCache } from "./member-cache.mjs";

const MASK_KEYS = ["party", "actionBar", "turn", "layout"];

let renderChain = Promise.resolve();
/** @type {{ mask: object, options: object } | null} */
let pending = null;

export function repositionHud() {
  applyHudBandVariables();
  for (const panel of getHudPanels()) panel.position?.();
  publishTurnTrackerBounds();
  positionTokenStatuses();
}

function mergeMaskInto(target, mask) {
  for (const key of MASK_KEYS) if (mask[key]) target[key] = true;
  return target;
}

/**
 * Queue a HUD paint pass.
 *
 * All `refreshHud` calls made within the same tick are coalesced into a single
 * pass whose mask is the *union* of every requested scope. This matters because
 * one user action (e.g. advancing the turn) fans out into several refreshes with
 * different scopes — COMBAT_TURN, then PARTY/SELECTION from the action-bar reset
 * clearing actor flags. Previously each was a separate pass and a per-panel
 * "newer ticket" guard aborted the loop early, so the last-registered panel (the
 * turn tracker) could be starved when the final queued refresh didn't include
 * the `turn` mask — the carousel simply never re-rendered. Coalescing guarantees
 * the union mask is painted to completion, reading live game state at paint time.
 *
 * @param {string | import("./scopes.mjs").IllusiveDndRenderMask} [scope]
 * @param {{ recenter?: boolean, reposition?: boolean }} [options]
 */
export function refreshHud(scope, options = {}) {
  const mask = resolveRenderMask(scope);

  if (pending) {
    mergeMaskInto(pending.mask, mask);
    Object.assign(pending.options, options);
    return renderChain;
  }

  pending = { mask: mergeMaskInto({}, mask), options: { ...options } };
  renderChain = renderChain
    .then(() => {
      const flush = pending;
      pending = null;
      return runRenderPass(flush.mask, flush.options);
    })
    .catch((error) => console.error(`${MODULE_ID} | HUD render failed`, error));

  return renderChain;
}

/**
 * @param {import("./scopes.mjs").IllusiveDndRenderMask} mask
 * @param {{ recenter?: boolean, reposition?: boolean }} options
 */
async function runRenderPass(mask, options) {
  beginMemberCache();
  try {
    if (mask.layout) repositionHud();

    for (const panel of getHudPanels()) {
      if (!mask[panel.mask]) continue;
      await panel.paint(options);
    }

    removeHudOverlayIfEmpty();
  } finally {
    endMemberCache();
  }
}
