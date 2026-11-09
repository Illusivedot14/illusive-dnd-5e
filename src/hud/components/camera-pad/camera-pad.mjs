import { illusiveDnd } from "../../../i18n/index.mjs";
import { setting, settingOn } from "../../lib/hud-settings.mjs";
import { desktopHudEnabled } from "../../lib/mobile-client.mjs";
import { getHudBand } from "../../lib/hud-bounds.mjs";
import { getUiLocalRect, getUiViewportSize, setImportant } from "../../lib/viewport.mjs";
import { getActionBarToken } from "../../../application/reaction-context.mjs";
import { panCanvasToToken } from "../../../foundry/token-actions.mjs";
import { getHudFocusToken, isTouchTableClient } from "../../lib/hooks/touch-table.mjs";
import {
  applyCanvasView,
  canvasScaleLimits,
  clampStick,
  nextScale,
  nextViewPosition,
  readCanvasView,
  stickToSceneDelta,
  withLockViewUnlocked
} from "../../../foundry/camera-control.mjs";

const PAD_ID = "illusive-dnd-camera-pad";
export const PAD_CONTROL_PX = 48;
const KEY_GAP_PX = 4;
export const PAD_GRID_PX = PAD_CONTROL_PX * 3 + KEY_GAP_PX * 2;
export const PAD_WIDTH_PX = PAD_GRID_PX;
export const PAD_HEIGHT_PX = PAD_GRID_PX + KEY_GAP_PX + PAD_CONTROL_PX;
export const PAD_CLEARANCE_PX = 12;
const IDLE_MS = 2400;

const OBSTACLE_SELECTOR = ["#illusive-dnd-action-bar-dock", "#illusive-dnd-turn-tracker"].join(", ");

function cameraPadAllowed() {
  try {
    return setting("cameraPadVisibleTo");
  } catch {
    return null;
  }
}

/** Pad is on when this client enables it, desktop HUD is up, and this user is on the world list. */
export function shouldShowCameraPad() {
  if (!desktopHudEnabled()) return false;
  if (!settingOn("enableCameraPad")) return false;
  const allowed = cameraPadAllowed();
  if (Array.isArray(allowed)) return allowed.includes(game.user?.id);
  if (allowed === "gm") return Boolean(game.user?.isGM);
  if (allowed === "all") return true;
  return isTouchTableClient();
}

function boxesOverlapX(left, right, box) {
  return !(right <= box.left || left >= box.right);
}

/**
 * Compact map cluster on the right of the HUD band, above the action bar when
 * there is room. Opposite the party rail so the fight HUD stays the focus.
 *
 * When the bar + turn tracker leave no vertical slot for the pad, keep it in
 * the bottom-right corner (drawn above the bar) instead of clamping into a
 * mid-screen overlap that reads as "the zoom pad disappeared."
 */
export function cameraPadPlacement({
  viewportHeight,
  padWidth = PAD_WIDTH_PX,
  padHeight = PAD_HEIGHT_PX,
  bandEnd = 0,
  actionBar = null,
  turnTracker = null,
  gap = PAD_CLEARANCE_PX,
  floor = 16
} = {}) {
  const left = Math.max(floor, Math.round((bandEnd || padWidth + gap) - padWidth - gap));
  const padRight = left + padWidth;
  const cap = Math.max(floor, viewportHeight - padHeight - floor);

  let aboveBar = floor;
  if (actionBar && actionBar.height >= 1 && boxesOverlapX(left, padRight, actionBar)) {
    aboveBar = Math.max(floor, Math.round(viewportHeight - actionBar.top + gap));
  }

  let maxBottom = cap;
  if (turnTracker && turnTracker.height >= 1 && boxesOverlapX(left, padRight, turnTracker)) {
    const underTracker = viewportHeight - padHeight - (turnTracker.bottom + gap);
    if (Number.isFinite(underTracker)) maxBottom = Math.min(maxBottom, underTracker);
  }

  // Only lift when the whole pad still fits under the turn tracker.
  const bottom = aboveBar > floor && aboveBar <= maxBottom ? aboveBar : floor;
  return { left, bottom: Math.round(Math.max(floor, Math.min(bottom, cap))) };
}

const ARROWS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

const PAD_SHELL = `
<div id="${PAD_ID}" class="illusive-dnd-camera-pad">
  <div class="illusive-dnd-camera-pad-arrows">
    <span class="illusive-dnd-camera-pad-empty" aria-hidden="true"></span>
    <div role="button" tabindex="0" data-camera="up"><i class="fas fa-arrow-up" aria-hidden="true"></i></div>
    <span class="illusive-dnd-camera-pad-empty" aria-hidden="true"></span>
    <div role="button" tabindex="0" data-camera="left"><i class="fas fa-arrow-left" aria-hidden="true"></i></div>
    <span class="illusive-dnd-camera-pad-hub" aria-hidden="true"></span>
    <div role="button" tabindex="0" data-camera="right"><i class="fas fa-arrow-right" aria-hidden="true"></i></div>
    <span class="illusive-dnd-camera-pad-empty" aria-hidden="true"></span>
    <div role="button" tabindex="0" data-camera="down"><i class="fas fa-arrow-down" aria-hidden="true"></i></div>
    <span class="illusive-dnd-camera-pad-empty" aria-hidden="true"></span>
  </div>
  <div class="illusive-dnd-camera-pad-tools">
    <div role="button" tabindex="0" data-camera="zoom-in"><i class="fas fa-plus" aria-hidden="true"></i></div>
    <div role="button" tabindex="0" data-camera="recenter"><i class="fas fa-crosshairs" aria-hidden="true"></i></div>
    <div role="button" tabindex="0" data-camera="zoom-out"><i class="fas fa-minus" aria-hidden="true"></i></div>
  </div>
</div>`;

const heldArrows = new Set();
const pointers = new Map();
let zoomHeld = null;
let rafId = 0;
let lastTs = 0;
let bound = false;
let idleTimer = 0;

function rootEl() {
  return document.getElementById(PAD_ID);
}

function wakePad() {
  const root = rootEl();
  root?.classList.remove("illusive-dnd-camera-pad--idle");
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    rootEl()?.classList.add("illusive-dnd-camera-pad--idle");
  }, IDLE_MS);
}

function stickFromArrows() {
  let x = 0;
  let y = 0;
  for (const dir of heldArrows) {
    const step = ARROWS[dir];
    if (!step) continue;
    x += step.x;
    y += step.y;
  }
  return clampStick(x, y);
}

function stopLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  lastTs = 0;
}

function resetInput() {
  heldArrows.clear();
  pointers.clear();
  zoomHeld = null;
  rootEl()?.querySelectorAll(".is-held").forEach((el) => el.classList.remove("is-held"));
}

function tick(ts) {
  rafId = 0;
  const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0;
  lastTs = ts;

  const stick = stickFromArrows();
  const moving = stick.x !== 0 || stick.y !== 0;
  if (!moving && !zoomHeld) {
    lastTs = 0;
    return;
  }

  const view = readCanvasView();
  const { dx, dy } = stickToSceneDelta(stick.x, stick.y, view.scale, dt);
  const scale = nextScale(view.scale, zoomHeld, dt, canvasScaleLimits());
  applyCanvasView(nextViewPosition(view, { dx, dy, scale }));
  rafId = requestAnimationFrame(tick);
}

function ensureLoop() {
  if (!rafId) rafId = requestAnimationFrame(tick);
}

function setHeld(el, held) {
  el?.classList.toggle("is-held", held);
}

function recenterOnToken() {
  const token = getActionBarToken() ?? getHudFocusToken();
  if (!token) return;
  withLockViewUnlocked(() => panCanvasToToken(token));
}

function pressAction(action, el) {
  if (ARROWS[action]) {
    heldArrows.add(action);
    setHeld(el, true);
    ensureLoop();
    return;
  }
  if (action === "zoom-in" || action === "zoom-out") {
    zoomHeld = action === "zoom-in" ? "in" : "out";
    setHeld(el, true);
    ensureLoop();
    return;
  }
  if (action === "recenter") {
    setHeld(el, true);
    recenterOnToken();
  }
}

function releaseAction(action, el) {
  if (ARROWS[action]) {
    heldArrows.delete(action);
    setHeld(el, false);
    return;
  }
  if (action === "zoom-in" || action === "zoom-out") {
    if ((action === "zoom-in" && zoomHeld === "in") || (action === "zoom-out" && zoomHeld === "out")) {
      zoomHeld = null;
    }
    setHeld(el, false);
    return;
  }
  if (action === "recenter") setHeld(el, false);
}

function onPointerDown(event) {
  const root = rootEl();
  if (!root?.contains(event.target)) return;
  const button = event.target.closest("[data-camera]");
  const action = button?.dataset?.camera;
  if (!action) return;
  event.preventDefault();
  event.stopPropagation();
  wakePad();
  button.setPointerCapture?.(event.pointerId);
  pointers.set(event.pointerId, { action, button });
  pressAction(action, button);
}

function onPointerUp(event) {
  const held = pointers.get(event.pointerId);
  if (!held) return;
  event.preventDefault();
  event.stopPropagation();
  pointers.delete(event.pointerId);
  releaseAction(held.action, held.button);
  wakePad();
}

function paintPad(root) {
  root.setAttribute("aria-label", illusiveDnd.cameraPad("title"));
  for (const [action, key] of [
    ["up", "panUp"],
    ["down", "panDown"],
    ["left", "panLeft"],
    ["right", "panRight"],
    ["zoom-in", "zoomIn"],
    ["zoom-out", "zoomOut"],
    ["recenter", "recenter"]
  ]) {
    const button = root.querySelector(`[data-camera="${action}"]`);
    if (button) button.setAttribute("aria-label", illusiveDnd.cameraPad(key));
  }
}

export function applyCameraPadChrome(root) {
  if (!root) return root;

  setImportant(root, {
    position: "fixed",
    inset: "auto",
    top: "auto",
    "z-index": "2147483646",
    display: "flex",
    "flex-direction": "column",
    "align-items": "center",
    "justify-content": "flex-start",
    gap: `${KEY_GAP_PX}px`,
    width: `${PAD_WIDTH_PX}px`,
    height: `${PAD_HEIGHT_PX}px`,
    "min-width": `${PAD_WIDTH_PX}px`,
    "max-width": `${PAD_WIDTH_PX}px`,
    "min-height": `${PAD_HEIGHT_PX}px`,
    "max-height": `${PAD_HEIGHT_PX}px`,
    padding: "0",
    margin: "0",
    "box-sizing": "border-box",
    overflow: "visible",
    border: "none",
    background: "transparent",
    "pointer-events": "auto",
    "touch-action": "none",
    visibility: "visible",
    flex: "none",
    transform: "none"
  });

  const arrows = root.querySelector(".illusive-dnd-camera-pad-arrows");
  if (arrows) {
    const track = `${PAD_CONTROL_PX}px ${PAD_CONTROL_PX}px ${PAD_CONTROL_PX}px`;
    setImportant(arrows, {
      display: "grid",
      "grid-template-columns": track,
      "grid-template-rows": track,
      gap: `${KEY_GAP_PX}px`,
      width: `${PAD_GRID_PX}px`,
      height: `${PAD_GRID_PX}px`,
      flex: "none"
    });
  }

  const tools = root.querySelector(".illusive-dnd-camera-pad-tools");
  if (tools) {
    setImportant(tools, {
      display: "flex",
      "flex-direction": "row",
      "justify-content": "center",
      "align-items": "center",
      gap: `${KEY_GAP_PX}px`,
      width: `${PAD_GRID_PX}px`,
      height: `${PAD_CONTROL_PX}px`,
      flex: "none"
    });
  }

  const key = `${PAD_CONTROL_PX}px`;
  root.querySelectorAll(".illusive-dnd-camera-pad-empty, .illusive-dnd-camera-pad-hub").forEach((el) => {
    setImportant(el, {
      width: key,
      height: key,
      padding: "0",
      margin: "0",
      border: "none",
      background: "transparent"
    });
  });

  root.querySelectorAll("[data-camera]").forEach((el) => {
    setImportant(el, {
      width: key,
      height: key,
      "min-width": key,
      "max-width": key,
      "min-height": key,
      "max-height": key,
      padding: "0",
      margin: "0",
      flex: "none",
      "box-sizing": "border-box",
      display: "flex",
      "align-items": "center",
      "justify-content": "center",
      border: "1px solid #9a7840",
      "border-radius": "999px",
      background: "rgba(18, 12, 30, 0.88)",
      color: "#f0ddb0",
      "font-size": "18px",
      "line-height": "1",
      cursor: "pointer"
    });
  });

  return root;
}

function obstacleVisible(el) {
  if (el.hidden || el.closest("[hidden]")) return false;
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const clipped = el.closest(".illusive-dnd-action-bar-motion");
  if (clipped) {
    const clip = clipped.getBoundingClientRect();
    if (clip.width < 1 || clip.height < 1) return false;
  }
  return true;
}

function panelBox(id) {
  const el = document.getElementById(id);
  if (!el || !obstacleVisible(el)) return null;
  return getUiLocalRect(el);
}

/**
 * Expanded bar: the full dock. Minimized: only the chevron — the dock still
 * reports the collapsed motion's max-content width, which falsely overlaps the
 * right-side pad and leaves a floating gap above the arrow.
 */
function actionBarObstacle() {
  const dock = document.getElementById("illusive-dnd-action-bar-dock");
  if (!dock || !obstacleVisible(dock)) return null;
  if (dock.classList.contains("illusive-dnd-action-bar-dock--minimized")) {
    const chevron = dock.querySelector(".illusive-dnd-action-bar-minimize");
    if (!chevron || !obstacleVisible(chevron)) return null;
    return getUiLocalRect(chevron);
  }
  return getUiLocalRect(dock);
}

function placePad(root) {
  applyCameraPadChrome(root);
  const ui = getUiViewportSize();
  const { left, bottom } = cameraPadPlacement({
    viewportHeight: ui.h,
    bandEnd: getHudBand().end,
    actionBar: actionBarObstacle(),
    turnTracker: panelBox("illusive-dnd-turn-tracker")
  });
  setImportant(root, { left: `${left}px`, bottom: `${bottom}px`, right: "auto" });
}

let placeRaf = 0;
let obstacleWatch = null;

function schedulePlace() {
  if (placeRaf) return;
  placeRaf = requestAnimationFrame(() => {
    placeRaf = 0;
    const root = rootEl();
    if (root) placePad(root);
  });
}

/** Re-measure obstacles after the action bar / turn tracker moves. */
export function repositionCameraPad() {
  schedulePlace();
}

function watchObstacles() {
  if (obstacleWatch || typeof ResizeObserver !== "function") return;
  const observer = new ResizeObserver(() => schedulePlace());
  const seen = new Set();
  const attach = () => {
    for (const el of document.querySelectorAll(OBSTACLE_SELECTOR)) {
      if (seen.has(el)) continue;
      seen.add(el);
      observer.observe(el);
    }
  };
  attach();
  const overlay = document.getElementById("illusive-dnd-hud-overlay") ?? document.body;
  const mutations = new MutationObserver(() => {
    attach();
    schedulePlace();
  });
  mutations.observe(overlay, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "hidden"]
  });
  obstacleWatch = { observer, mutations };
}

function unmountPad() {
  stopLoop();
  resetInput();
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = 0;
  rootEl()?.remove();
}

function mountPad() {
  let el = rootEl();
  if (!el) {
    const wrap = document.createElement("div");
    wrap.innerHTML = PAD_SHELL.trim();
    el = wrap.firstElementChild;
    if (!el) return;
    document.documentElement.appendChild(el);
  }
  placePad(el);
  paintPad(el);
  wakePad();
}

function bindPad() {
  if (bound) return;
  bound = true;
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointerup", onPointerUp, true);
  document.addEventListener("pointercancel", onPointerUp, true);
  window.addEventListener("resize", schedulePlace);
  watchObstacles();
}

export function refreshCameraPad() {
  if (!shouldShowCameraPad()) {
    unmountPad();
    return;
  }
  bindPad();
  mountPad();
}

export function bindCameraPad() {
  const show = () => refreshCameraPad();
  Hooks.on("ready", show);
  Hooks.on("canvasReady", show);
  if (globalThis.game?.ready) show();
}

export const cameraPadPanel = {
  id: PAD_ID,
  mask: "layout",
  paint() {
    refreshCameraPad();
  },
  unmount() {
    unmountPad();
  },
  position() {
    schedulePlace();
  }
};
