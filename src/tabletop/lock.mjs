import { applyCanvasView, canvasScaleLimits, readCanvasView } from "../foundry/camera-control.mjs";
import { getHudFocusToken } from "../hud/lib/hooks/touch-table.mjs";
import { isTabletopClient } from "./roles.mjs";

const MARK = "__illusiveTabletopGuarded";

let applying = false;
let held = null;
let inputBound = false;

export function resetTabletopLock() {
  applying = false;
  held = null;
}

export function tabletopHeldView() {
  return held ? { ...held } : null;
}

export function readTabletopView() {
  const view = readCanvasView();
  const limits = canvasScaleLimits();
  return {
    x: view.x,
    y: view.y,
    scale: view.scale,
    sceneId: canvas?.scene?.id ?? null,
    minScale: limits.minScale,
    maxScale: limits.maxScale
  };
}

/** Remember and apply a view the GM sent. Local pans cannot replace it. */
export function acceptRemoteView(view) {
  held = {
    x: Number(view?.x) || 0,
    y: Number(view?.y) || 0,
    scale: Math.max(0.05, Number(view?.scale) || 1),
    sceneId: view?.sceneId ?? canvas?.scene?.id ?? null,
    minScale: Number(view?.minScale) || canvasScaleLimits().minScale,
    maxScale: Number(view?.maxScale) || canvasScaleLimits().maxScale
  };
  applying = true;
  try {
    applyCanvasView(held);
  } finally {
    applying = false;
  }
  return { ...held };
}

export function holdCurrentTabletopView() {
  held = readTabletopView();
  return { ...held };
}

function heldPan() {
  return { x: held.x, y: held.y, scale: held.scale };
}

function wrapCanvasMethod(name, fallback) {
  const original = canvas?.[name];
  if (typeof original !== "function" || original[MARK]) return;
  function wrapped(options) {
    if (!isTabletopClient() || applying) return original.call(canvas, options);
    if (!held) return undefined;
    return fallback(original);
  }
  wrapped[MARK] = true;
  canvas[name] = wrapped;
}

/** Drop drag, wheel, keyboard, and HUD pans on the table. Re-apply after each canvas rebuild. */
export function guardTabletopCamera() {
  if (!isTabletopClient() || !canvas) return;
  wrapCanvasMethod("pan", (original) => original.call(canvas, heldPan()));
  wrapCanvasMethod("animatePan", (original) => original.call(canvas, { ...heldPan(), duration: 0 }));
  bindInputLock();
}

function bindInputLock() {
  if (inputBound || typeof document === "undefined") return;
  inputBound = true;
  document.addEventListener("wheel", (event) => {
    if (!isTabletopClient()) return;
    const board = document.getElementById("board");
    if (!board || (event.target !== board && !board.contains(event.target))) return;
    event.preventDefault();
    event.stopPropagation();
  }, { capture: true, passive: false });
}

/** If something moved the table anyway, put the held view back. */
export function onTabletopCanvasPan(position) {
  if (!isTabletopClient() || applying || !held || !position) return false;
  const moved = position.x !== held.x || position.y !== held.y || position.scale !== held.scale;
  if (!moved) return false;
  acceptRemoteView(held);
  return true;
}

/** Center the table on the token it is focused on. Does not move the GM's map. */
export function recenterTabletop() {
  const current = held ?? readTabletopView();
  const token = getHudFocusToken();
  if (!token) return { ...current };
  const center = token.center ?? { x: token.x, y: token.y };
  return acceptRemoteView({ ...current, x: center.x, y: center.y });
}
