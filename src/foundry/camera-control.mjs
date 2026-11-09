/** Screen pixels per second at the current zoom. */
export const CAMERA_PAN_SPEED = 520;

/** Zoom factor applied each second while a zoom button is held. */
export const CAMERA_ZOOM_PER_SEC = 1.55;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function clampStick(nx, ny) {
  const x = Number(nx) || 0;
  const y = Number(ny) || 0;
  const length = Math.hypot(x, y);
  if (length <= 1) return { x, y };
  return { x: x / length, y: y / length };
}

/** Finger offset inside a pad → stick of length 0..1. */
export function offsetToStick(dx, dy, radius) {
  const reach = Math.max(1, Number(radius) || 1);
  return clampStick(dx / reach, dy / reach);
}

/**
 * Convert a held stick and elapsed time into a scene-space shift.
 * Faster zoom (larger scale) covers less scene per screen pixel.
 */
export function stickToSceneDelta(nx, ny, scale, dt, speed = CAMERA_PAN_SPEED) {
  const stick = clampStick(nx, ny);
  const zoom = Math.max(0.05, Number(scale) || 1);
  const seconds = Math.max(0, Number(dt) || 0);
  const step = (Number(speed) || 0) * seconds / zoom;
  return {
    dx: stick.x * step,
    dy: stick.y * step
  };
}

export function nextScale(scale, zoomHeld, dt, { minScale = 0.1, maxScale = 3 } = {}) {
  const current = Math.max(0.05, Number(scale) || 1);
  if (zoomHeld !== "in" && zoomHeld !== "out") return clamp(current, minScale, maxScale);
  const seconds = Math.max(0, Number(dt) || 0);
  const factor = zoomHeld === "in" ? CAMERA_ZOOM_PER_SEC : 1 / CAMERA_ZOOM_PER_SEC;
  return clamp(current * (factor ** seconds), minScale, maxScale);
}

export function nextViewPosition(view, { dx = 0, dy = 0, scale } = {}) {
  return {
    x: (Number(view?.x) || 0) + (Number(dx) || 0),
    y: (Number(view?.y) || 0) + (Number(dy) || 0),
    scale: Math.max(0.05, Number(scale ?? view?.scale) || 1)
  };
}

export function readCanvasView() {
  const stored = canvas?.scene?._viewPosition;
  const center = canvas?.center;
  return {
    x: Number(stored?.x ?? center?.x ?? canvas?.stage?.pivot?.x ?? 0) || 0,
    y: Number(stored?.y ?? center?.y ?? canvas?.stage?.pivot?.y ?? 0) || 0,
    scale: Number(stored?.scale ?? canvas?.stage?.scale?.x ?? 1) || 1
  };
}

export function canvasScaleLimits() {
  const dims = canvas?.dimensions;
  return {
    minScale: Number(dims?.minScale ?? 0.1) || 0.1,
    maxScale: Number(dims?.maxScale ?? 3) || 3
  };
}

/**
 * Lock View wraps canvas.pan and drops the move when applyLocks is on.
 * Lift that flag for our call, then put it back — same trick Lock View
 * uses for pings and its own forced view.
 */
export function withLockViewUnlocked(fn) {
  const locks = globalThis.lockView?.locks;
  const wasApplied = Boolean(locks?.applyLocks);
  if (wasApplied) locks.applyLocks = false;
  const restore = () => {
    if (wasApplied && locks) locks.applyLocks = true;
  };
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result.finally(restore);
    }
    restore();
    return result;
  } catch (err) {
    restore();
    throw err;
  }
}

export function applyCanvasView(view) {
  if (!canvas || !view) return false;
  const next = { x: view.x, y: view.y, scale: view.scale };
  return Boolean(withLockViewUnlocked(() => {
    try {
      if (typeof canvas.pan === "function") {
        canvas.pan(next);
        return true;
      }
      if (typeof canvas.animatePan === "function") {
        canvas.animatePan({ ...next, duration: 0 });
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }));
}
