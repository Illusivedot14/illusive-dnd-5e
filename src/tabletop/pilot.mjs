import { nextScale, nextViewPosition, stickToSceneDelta } from "../foundry/camera-control.mjs";
import { acceptRemoteView, readTabletopView, tabletopHeldView } from "./lock.mjs";
import { isTabletopPilot, tabletopControlsItself } from "./roles.mjs";
import { emitTabletop } from "./socket.mjs";

const SEND_EVERY_MS = 50;

let shadow = null;
let asked = false;
let lastSentAt = 0;
let pending = null;
let pendingTimer = 0;

export function resetTabletopPilot() {
  shadow = null;
  asked = false;
  lastSentAt = 0;
  pending = null;
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = 0;
}

export function tabletopShadowView() {
  return shadow ? { ...shadow } : null;
}

export function noteTabletopReport(view) {
  shadow = {
    x: Number(view?.x) || 0,
    y: Number(view?.y) || 0,
    scale: Math.max(0.05, Number(view?.scale) || 1),
    sceneId: view?.sceneId ?? null,
    minScale: Number(view?.minScale) || 0.1,
    maxScale: Number(view?.maxScale) || 3
  };
  asked = false;
  return { ...shadow };
}

export function requestTabletopView() {
  if (!isTabletopPilot()) return false;
  return emitTabletop({ action: "request" });
}

export function requestTabletopRecenter() {
  if (!isTabletopPilot()) return false;
  return emitTabletop({ action: "recenter" });
}

function flush() {
  pendingTimer = 0;
  if (!pending) return;
  lastSentAt = Date.now();
  const view = pending;
  pending = null;
  emitTabletop({ action: "set", ...view });
}

function queueView(view) {
  pending = view;
  const wait = SEND_EVERY_MS - (Date.now() - lastSentAt);
  if (wait <= 0) {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = 0;
    }
    flush();
    return;
  }
  if (pendingTimer) return;
  pendingTimer = setTimeout(flush, wait);
}

export { tabletopControlsItself };

/**
 * The table user is holding their own pad. Move the locked view in place.
 * Returns true when this client is that user.
 */
export function driveLocalTable({ stick, zoomHeld, dt } = {}) {
  if (!tabletopControlsItself()) return false;
  const current = tabletopHeldView() ?? readTabletopView();
  const { dx, dy } = stickToSceneDelta(stick?.x, stick?.y, current.scale, dt);
  const scale = nextScale(current.scale, zoomHeld, dt, {
    minScale: current.minScale,
    maxScale: current.maxScale
  });
  acceptRemoteView(nextViewPosition(current, { dx, dy, scale }));
  return true;
}

/**
 * Advance the table's view from another client's pad.
 * Returns true when this client is the pilot, so the pad must not pan locally.
 */
export function driveTableFromStick({ stick, zoomHeld, dt } = {}) {
  if (tabletopControlsItself()) return false;
  if (!isTabletopPilot()) return false;
  if (!shadow) {
    if (!asked) {
      asked = true;
      requestTabletopView();
    }
    return true;
  }

  const { dx, dy } = stickToSceneDelta(stick?.x, stick?.y, shadow.scale, dt);
  const scale = nextScale(shadow.scale, zoomHeld, dt, {
    minScale: shadow.minScale,
    maxScale: shadow.maxScale
  });
  const next = nextViewPosition(shadow, { dx, dy, scale });
  const same = next.x === shadow.x && next.y === shadow.y && next.scale === shadow.scale;
  shadow = { ...shadow, ...next };
  if (!same) queueView(shadow);
  return true;
}
