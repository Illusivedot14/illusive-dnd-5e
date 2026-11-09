/**
 * Cross-owned party tables: Foundry auto-controls every owned token while a
 * scene loads — on first world join, refresh, and scene change. Drop those
 * selections during a short guard window; players tap to select when they want.
 */

let guardUntil = 0;
let bound = false;

function inSceneLoadGuard() {
  return !game.user?.isGM && Date.now() < guardUntil;
}

function beginSceneLoadGuard(ms = 3000) {
  if (game.user?.isGM) return;
  guardUntil = Date.now() + ms;
  canvas.tokens?.releaseAll?.();
}

function scheduleReleasePasses() {
  if (game.user?.isGM) return;
  for (const delay of [0, 50, 150, 400, 800, 1500, 2500, 3500]) {
    setTimeout(() => {
      if (inSceneLoadGuard()) canvas.tokens?.releaseAll?.();
    }, delay);
  }
}

function armDeselectGuard(ms = 3000) {
  beginSceneLoadGuard(ms);
  scheduleReleasePasses();
}

function onCanvasReady() {
  armDeselectGuard();
}

function onWorldReady() {
  // World join / F5 — canvasReady may have already fired or be imminent.
  armDeselectGuard(4000);
  if (canvas?.ready) armDeselectGuard(4000);
}

export function bindSceneLoadDeselect() {
  if (bound) return;
  bound = true;

  Hooks.on("canvasReady", onCanvasReady);
  Hooks.on("ready", onWorldReady);

  Hooks.on("controlToken", (token, controlled) => {
    if (!inSceneLoadGuard() || !controlled) return;
    queueMicrotask(() => {
      if (!inSceneLoadGuard()) return;
      if (token.controlled) token.release();
    });
  });
}
