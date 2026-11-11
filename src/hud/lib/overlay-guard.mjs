/**
 * Prevent invisible HUD layers from eating clicks (dialogs, target-pick confirm, etc.).
 */

import { isIllusiveMobileMode } from "./mobile-client.mjs";

const DIALOG_SELECTOR = [
  ".application.dialog",
  ".application.dialog-v2",
  ".window-app.dialog",
  ".dialog-v2"
].join(", ");

const STALE_OVERLAY_SELECTOR = ".illusive-dnd-ms-overlay:not(.visible)";

/** Drop orphaned full-screen layers that still capture pointer events. */
export function cleanupStaleHudOverlays() {
  document.querySelectorAll(STALE_OVERLAY_SELECTOR).forEach((el) => el.remove());
  document.getElementById("illusive-dnd-portrait-hp-menu")?.remove();
  document.getElementById("illusive-dnd-status-context-menu")?.remove();
  if (isIllusiveMobileMode()) return;
  void import("../components/action-bar/action-bar-util-dropdown.mjs").then((m) => m.closeUtilDropdown());
  void import("../components/action-bar/action-bar-ui-tooltip.mjs").then((m) => m.hideActionBarUiTooltip());
}

/** Close floating HUD chrome before modal flows (target pick, dialogs). */
export function dismissFloatingHudChrome() {
  cleanupStaleHudOverlays();
}

function syncFoundryDialogOpenClass() {
  const open = Boolean(document.querySelector(DIALOG_SELECTOR));
  document.body.classList.toggle("illusive-dnd-foundry-dialog-open", open);
  if (open) dismissFloatingHudChrome();
}

export function bindOverlayGuardHooks() {
  Hooks.on("renderApplication", syncFoundryDialogOpenClass);
  Hooks.on("closeApplication", () => queueMicrotask(syncFoundryDialogOpenClass));
  Hooks.on("ready", () => {
    cleanupStaleHudOverlays();
    syncFoundryDialogOpenClass();
  });
  Hooks.on("canvasReady", cleanupStaleHudOverlays);
}
