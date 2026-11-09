import { illusiveDnd } from "../i18n/index.mjs";
import { focusHudToken, isTouchTableClient, releaseCanvasSelection } from "../hud/lib/hooks/touch-table.mjs";

/** Soft canvas pan — longer than Foundry's default snap. */
const TOKEN_PAN_DURATION_MS = 800;
const TOKEN_FLIP_DURATION_MS = 120;

export function clearUserTargets() {
  if (typeof game === "undefined" || !game?.user) return;
  for (const token of [...(game.user.targets ?? [])]) {
    token.setTarget?.(false, { releaseOthers: false, user: game.user });
  }
}

export function canControlToken(token) {
  if (!token) return false;
  if (game.user.isGM) return true;
  return Boolean(token.isOwner || token.actor?.isOwner);
}

function readTextureScale(token, axis) {
  const fromSource = Number(token?.document?._source?.texture?.[axis]);
  if (Number.isFinite(fromSource) && fromSource !== 0) return fromSource;
  const live = Number(token?.document?.texture?.[axis]);
  if (Number.isFinite(live) && live !== 0) return live;
  return 1;
}

export function isTokenFlipped(token) {
  return readTextureScale(token, "scaleX") < 0;
}

export async function flipToken(token) {
  if (!canControlToken(token) || !token?.document) {
    ui.notifications.warn(illusiveDnd.warning("noOwner"));
    return false;
  }
  const scaleX = readTextureScale(token, "scaleX");
  const scaleY = readTextureScale(token, "scaleY");
  const mag = Math.abs(scaleY) || Math.abs(scaleX) || 1;
  await token.document.update(
    { "texture.scaleX": (scaleX < 0 ? 1 : -1) * mag },
    { animate: true, animation: { duration: TOKEN_FLIP_DURATION_MS } }
  );
  return true;
}

export function getElevationStep() {
  const step = Number(
    canvas?.scene?.grid?.distance
    ?? canvas?.grid?.distance
    ?? canvas?.dimensions?.distance
    ?? 5
  );
  return Number.isFinite(step) && step > 0 ? step : 5;
}

export function getElevationBase() {
  const base = Number(canvas?.level?.elevation?.base ?? 0);
  return Number.isFinite(base) ? base : 0;
}

function readStoredElevation(token) {
  const raw = Number(token?.document?._source?.elevation ?? token?.document?.elevation ?? 0);
  return Number.isFinite(raw) ? raw : 0;
}

/** Height the Foundry token HUD shows: stored elevation minus the current floor. */
export function getTokenElevation(token) {
  return Math.round(readStoredElevation(token) - getElevationBase());
}

/** Next height on the grid. Off-step values snap to the next square in that direction. */
export function nextElevation(current, direction, step = getElevationStep()) {
  const value = Math.round(Number(current) || 0);
  const grid = Number.isFinite(Number(step)) && Number(step) > 0 ? Number(step) : 5;
  if (direction < 0) return Math.ceil(value / grid) * grid - grid;
  return Math.floor(value / grid) * grid + grid;
}

let elevationBusy = false;

async function applyTokenElevation(token, nextStored) {
  const doc = token.document;
  const origin = doc._source ?? doc;
  if (typeof doc.move === "function") {
    const destination = typeof token._getHUDMovementPosition === "function"
      ? token._getHUDMovementPosition(nextStored)
      : { elevation: nextStored };
    destination.x = Math.round(destination.x ?? origin.x ?? 0);
    destination.y = Math.round(destination.y ?? origin.y ?? 0);
    destination.elevation ??= nextStored;
    destination.width ??= origin.width;
    destination.height ??= origin.height;
    destination.shape ??= origin.shape;
    destination.action = token._getHUDMovementAction?.() ?? origin.movementAction;
    destination.checkpoint = true;
    destination.explicit = false;
    const unconstrained = Boolean(game.user?.isGM && game.settings?.get?.("core", "unconstrainedMovement"));
    await doc.move(destination, {
      method: "hud",
      animate: false,
      constrainOptions: { ignoreWalls: unconstrained, ignoreCost: unconstrained }
    });
    return;
  }
  await doc.update({ elevation: nextStored }, { animate: false });
}

export async function nudgeTokenElevation(token, direction) {
  if (elevationBusy) return false;
  if (!canControlToken(token) || !token?.document) {
    ui.notifications.warn(illusiveDnd.warning("noOwner"));
    return false;
  }
  elevationBusy = true;
  try {
    const nextStored = nextElevation(getTokenElevation(token), direction) + getElevationBase();
    await applyTokenElevation(token, nextStored);
    return true;
  } finally {
    elevationBusy = false;
  }
}

/**
 * Smoothly pan the canvas to a token's center.
 * @param {Token} token
 * @param {{ duration?: number }} [options]
 * @returns {Promise<unknown>|void}
 */
export function panCanvasToToken(token, { duration = TOKEN_PAN_DURATION_MS } = {}) {
  if (!token?.isVisible || !canvas?.animatePan) return;

  const center = token.center ?? { x: token.x, y: token.y };
  const options = {
    x: center.x,
    y: center.y,
    duration
  };

  const easing = globalThis.CanvasAnimation?.easeInOutCosine
    ?? globalThis.foundry?.utils?.easeInOutCosine;
  if (typeof easing === "function") options.easing = easing;

  return canvas.animatePan(options);
}

/** Draw a canvas ping at a token's center. */
export function pingCanvasAtToken(token) {
  if (!token?.isVisible || !canvas?.ping) return;
  const center = token.center ?? { x: token.x, y: token.y };
  canvas.ping(center);
}

export async function selectToken(token, { pan = true, clearTargets = false } = {}) {
  if (!token) return false;

  if (canControlToken(token)) {
    if (clearTargets) clearUserTargets();
    await token.control({ releaseOthers: true });
    if (pan) panCanvasToToken(token);
    return token.controlled;
  }

  if (isTouchTableClient()) {
    return focusHudToken(token, { pan, clearTargets });
  }

  ui.notifications.warn(illusiveDnd.warning("noOwner"));
  return false;
}

/**
 * Pan to a token from HUD chrome. Selects only when the user can control it —
 * otherwise pans and pings (no ownership warning).
 */
export function focusTokenOnCanvas(token) {
  if (!token) return false;
  if (canControlToken(token)) {
    void selectToken(token, { pan: true });
    return true;
  }
  if (isTouchTableClient()) {
    void focusHudToken(token, { pan: true });
    return true;
  }
  panCanvasToToken(token);
  pingCanvasAtToken(token);
  return true;
}

/** Auto-pan on turn change — GM, non-touch players, and touch table each behave differently. */
export async function selectTokenForTurn(token) {
  if (!token) return false;

  if (isTouchTableClient()) {
    if (canControlToken(token)) {
      return selectToken(token, { pan: false, clearTargets: true });
    }
    return focusHudToken(token, { pan: false, clearTargets: true });
  }

  if (game.user.isGM) {
    releaseCanvasSelection();
    if (canControlToken(token)) {
      return selectToken(token, { pan: true, clearTargets: true });
    }
    clearUserTargets();
    panCanvasToToken(token);
    return true;
  }

  clearUserTargets();
  if (canControlToken(token)) {
    await token.control({ releaseOthers: true });
  }
  panCanvasToToken(token);
  return true;
}

export function openActorSheetFromEvent(event) {
  event.stopPropagation();
  const row = event.target.closest("[data-actor-id]");
  const actor = game.actors.get(row?.dataset.actorId);
  actor?.sheet?.render(true);
}
