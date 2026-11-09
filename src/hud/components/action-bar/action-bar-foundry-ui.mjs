import { MODULE_ID } from "../../../constants.mjs";
import { settingOn } from "../../lib/hud-settings.mjs";
import { desktopHudEnabled } from "../../lib/mobile-client.mjs";
import { getHudBand } from "../../lib/hud-bounds.mjs";
import { getUiLocalRect } from "../../lib/viewport.mjs";
import { isActionBarMinimized } from "./action-bar-minimize.mjs";

const HIDE_SELECTORS = ["#players", "#fps"];
const HOTBAR_PARENT_SELECTORS = ["#ui-bottom", "#interface", "body"];
const HANDOFF_MS = 300;
const HOTBAR_ALIGN_CLASS = "illusive-dnd-hotbar-band-aligned";

/** True when the action bar panel is showing token combat content. */
export function isActionBarContentVisible() {
  if (!settingOn("enableActionBar") || !desktopHudEnabled()) return false;
  const dock = document.getElementById("illusive-dnd-action-bar-dock");
  if (!dock || dock.hidden) return false;
  const bar = document.getElementById("illusive-dnd-action-bar");
  return Boolean(bar && !bar.hidden);
}

/** Action bar is on-screen (token selected) and not tucked away via the hide chevron. */
export function isActionBarExpanded() {
  return isActionBarContentVisible() && !isActionBarMinimized();
}

function chromeTargets() {
  const nodes = HIDE_SELECTORS
    .map((selector) => document.querySelector(selector))
    .filter(Boolean);
  const hotbar = document.getElementById("hotbar");
  if (hotbar) nodes.push(hotbar);
  const uiBottom = document.getElementById("ui-bottom");
  if (uiBottom) nodes.push(uiBottom);
  return nodes;
}

/** Undo any leftover dock into #illusive-dnd-hotbar-well from older module versions. */
function restoreFoundryHotbarParent() {
  const hotbar = document.getElementById("hotbar");
  if (!hotbar) return;
  if (hotbar.parentElement?.id !== "illusive-dnd-hotbar-well" && hotbar.dataset.illusiveDndDocked !== "true") return;

  let parent = null;
  for (const sel of HOTBAR_PARENT_SELECTORS) {
    parent = document.querySelector(sel);
    if (parent) break;
  }
  parent ??= document.body;
  if (hotbar.parentElement !== parent) parent.appendChild(hotbar);
  delete hotbar.dataset.illusiveDndDocked;
}

function clearHandoffClasses(node) {
  node.classList.remove("illusive-dnd-ui-handoff", "illusive-dnd-ui-handoff-visible", "illusive-dnd-ui-handoff-exit");
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tokenOffsetX() {
  try {
    return Number(game.settings.get(MODULE_ID, "tokenOffsetX")) || 0;
  } catch {
    return 0;
  }
}

/** Remove band-centering overrides from Foundry's hotbar. */
export function clearFoundryHotbarAlignment(hotbar = document.getElementById("hotbar")) {
  if (!hotbar) return;
  hotbar.classList.remove(HOTBAR_ALIGN_CLASS);
  hotbar.style.removeProperty("left");
  if (hotbar.dataset.illusiveDndHotbarPos === "relative") {
    hotbar.style.removeProperty("position");
    delete hotbar.dataset.illusiveDndHotbarPos;
  }
  delete hotbar.dataset.illusiveDndHotbarShift;
}

/**
 * Centre Foundry's macro hotbar on the same HUD band as the turn tracker
 * and action-bar status icons (accounts for the right sidebar).
 */
export function positionFoundryHotbar() {
  const hotbar = document.getElementById("hotbar");
  if (!hotbar) return;

  if (hotbar.classList.contains("illusive-dnd-ui-hidden")) {
    clearFoundryHotbarAlignment(hotbar);
    return;
  }

  // Measure from Foundry's natural layout, then shift to the band center.
  clearFoundryHotbarAlignment(hotbar);
  void hotbar.offsetWidth;

  const rect = getUiLocalRect(hotbar);
  if (!rect || rect.width <= 0) return;

  const target = getHudBand().center + tokenOffsetX();
  const shift = Math.round(target - rect.center);
  if (shift === 0) {
    hotbar.classList.add(HOTBAR_ALIGN_CLASS);
    hotbar.dataset.illusiveDndHotbarShift = "0";
    return;
  }

  const computedPos = getComputedStyle(hotbar).position;
  if (computedPos === "static") {
    hotbar.style.position = "relative";
    hotbar.dataset.illusiveDndHotbarPos = "relative";
  }
  hotbar.style.left = `${shift}px`;
  hotbar.classList.add(HOTBAR_ALIGN_CLASS);
  hotbar.dataset.illusiveDndHotbarShift = String(shift);
}

/**
 * Start fading Foundry chrome in under the sliding action bar (minimize).
 * Leaves elements visible with opacity 0 → 1.
 */
export function beginFoundryChromeReveal() {
  restoreFoundryHotbarParent();
  for (const node of chromeTargets()) {
    node.classList.remove("illusive-dnd-ui-hidden");
    clearHandoffClasses(node);
    node.classList.add("illusive-dnd-ui-handoff");
  }
  positionFoundryHotbar();
  // Next frame so the opacity:0 state paints before we ease in.
  requestAnimationFrame(() => {
    for (const node of chromeTargets()) {
      if (!node.classList.contains("illusive-dnd-ui-handoff")) continue;
      node.classList.add("illusive-dnd-ui-handoff-visible");
    }
    positionFoundryHotbar();
  });
}

/** Finish reveal: drop handoff classes, keep chrome visible. */
export function finishFoundryChromeReveal() {
  for (const node of chromeTargets()) {
    clearHandoffClasses(node);
    node.classList.remove("illusive-dnd-ui-hidden");
  }
  positionFoundryHotbar();
}

/**
 * Fade Foundry chrome out before the action bar slides back in (expand).
 */
export async function beginFoundryChromeConceal() {
  const nodes = chromeTargets().filter((node) => !node.classList.contains("illusive-dnd-ui-hidden"));
  if (!nodes.length) {
    syncFoundryUiVisibility();
    return;
  }

  for (const node of nodes) {
    clearHandoffClasses(node);
    node.classList.add("illusive-dnd-ui-handoff", "illusive-dnd-ui-handoff-visible");
  }
  void document.body.offsetWidth;
  for (const node of nodes) {
    node.classList.remove("illusive-dnd-ui-handoff-visible");
    node.classList.add("illusive-dnd-ui-handoff-exit");
  }

  await waitMs(HANDOFF_MS);
  for (const node of nodes) {
    clearHandoffClasses(node);
    node.classList.add("illusive-dnd-ui-hidden");
  }
  clearFoundryHotbarAlignment();
}

/** @returns {boolean} whether Foundry bottom chrome was hidden for the expanded action bar */
export function syncFoundryUiVisibility() {
  restoreFoundryHotbarParent();

  // During minimize/expand, chrome opacity is owned by the handoff helpers.
  // Calling sync here (via positionActionBar) would snap the hotbar away mid-fade.
  const dock = document.getElementById("illusive-dnd-action-bar-dock");
  if (dock?.classList.contains("illusive-dnd-action-bar-dock--handoff")) {
    positionFoundryHotbar();
    return isActionBarExpanded();
  }

  const hideChrome = isActionBarExpanded();
  for (const node of chromeTargets()) {
    clearHandoffClasses(node);
    node.classList.toggle("illusive-dnd-ui-hidden", hideChrome);
  }

  if (hideChrome) clearFoundryHotbarAlignment();
  else positionFoundryHotbar();

  return hideChrome;
}

export function isFoundryHotbarHidden() {
  const hotbar = document.getElementById("hotbar");
  if (!hotbar) return false;
  if (hotbar.classList.contains("illusive-dnd-ui-hidden")) return true;
  // Mid-handoff reveal still counts as "present" for dock positioning.
  if (hotbar.classList.contains("illusive-dnd-ui-handoff")) return false;
  return false;
}

export const FOUNDRY_CHROME_HANDOFF_MS = HANDOFF_MS;
