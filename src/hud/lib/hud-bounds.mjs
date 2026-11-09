/**
 * Geometry helper: the horizontal band of the viewport that is NOT covered by
 * Foundry's side UI (the right sidebar and the left scene-control column). HUD
 * panels centre themselves within this band and cap their width to it so they
 * never spill over the sidebar, whatever the window size or sidebar state.
 * When the side menu is missing/hidden, the band spans the full UI viewport.
 *
 * Display scale is keyed to a 2560×1440 landscape reference, or 1080×1920 for
 * portrait / Vizio tabletop extends (common 1080p rotated secondary display).
 */

import { MODULE_ID } from "../../constants.mjs";
import { getUiLocalRect, getUiViewportSize } from "./viewport.mjs";

/** @typedef {{ start: number, end: number, width: number, center: number }} HudBand */
/** @typedef {{ w: number, h: number, portrait: boolean, profileKey: string }} DisplayViewport */

/** Shared design scale for turn tracker + party rail at factor 1.0 (landscape). */
export const HUD_FIT_BASE_SCALE = 1.5;
/**
 * Portrait skips the 1.5× landscape boost so ~6–9 tracker cards fit on a
 * 1080-wide short edge.
 */
export const HUD_FIT_BASE_SCALE_PORTRAIT = 1.0;
/** Action bar authored size at factor 1.0. */
export const HUD_ACTION_BAR_BASE_SCALE = 1.0;
/**
 * Extra size for the action bar and turn tracker only (party rail unchanged).
 */
export const HUD_COMBAT_CHROME_SCALE = 1.15;
/**
 * Extra trim when Display Profile is Vizio V405-G9 (~0.88 after successive
 * tuning passes). Applied after band-cap so it always shows.
 */
export const HUD_ACTION_BAR_VIZIO_SCALE = 0.88;
export const HUD_FIT_MIN_SCALE = 0.7;
export const HUD_FIT_MIN_FACTOR = 0.5;
export const HUD_FIT_MAX_FACTOR = 2.0;
/**
 * Mild portrait trim so the landscape-authored action bar still leaves map room
 * once the reference matches a 1080p rotated Vizio.
 */
export const HUD_PORTRAIT_FACTOR_BIAS = 1.0;
/** Authored action-bar width used when clamping to the HUD band. */
export const HUD_ACTION_BAR_DESIGN_WIDTH = 1120;

export const HUD_DESIGN_REF_LANDSCAPE = Object.freeze({ w: 2560, h: 1440 });
/** Extended Vizio / portrait tabletop at 1080p rotated. */
export const HUD_DESIGN_REF_PORTRAIT = Object.freeze({ w: 1080, h: 1920 });
/** Auto treats taller viewports as portrait. */
export const HUD_PORTRAIT_ASPECT_RATIO = 1.3;

export const DISPLAY_PROFILE_CHOICES = Object.freeze([
  "auto",
  "1920x1080",
  "2560x1440",
  "3840x2160",
  "vizio-v405-g9-portrait"
]);

/** Locked presets — Auto reads the live window instead. */
const DISPLAY_PRESETS = Object.freeze({
  "1920x1080": { w: 1920, h: 1080 },
  "2560x1440": { w: 2560, h: 1440 },
  "3840x2160": { w: 3840, h: 2160 },
  "vizio-v405-g9-portrait": { w: 1080, h: 1920, portrait: true }
});

/** Legacy profile ids rewritten on read. */
const DISPLAY_PROFILE_ALIASES = Object.freeze({
  "vizio-v405-g9-sideways": "vizio-v405-g9-portrait",
  "vizio-v405-g9-landscape": "vizio-v405-g9-portrait"
});

/** Layout viewport (swapped under 90°/270° UI rotation). */
function viewportSize() {
  return getUiViewportSize();
}

/**
 * @param {number} w
 * @param {number} h
 * @param {boolean} [forcePortrait]
 */
function isPortrait(w, h, forcePortrait = false) {
  if (forcePortrait) return true;
  return h / Math.max(1, w) >= HUD_PORTRAIT_ASPECT_RATIO;
}

/** @returns {string} */
export function getDisplayProfile() {
  try {
    const raw = game.settings.get(MODULE_ID, "displayProfile") ?? "auto";
    return DISPLAY_PROFILE_ALIASES[raw] ?? raw;
  } catch {
    return "auto";
  }
}

/**
 * Resolve the width/height used for scale math (live Auto or locked preset).
 * @param {string} [profile]
 * @returns {DisplayViewport}
 */
export function resolveDisplayViewport(profile = getDisplayProfile()) {
  const live = viewportSize();

  if (profile === "auto") {
    const portrait = isPortrait(live.w, live.h);
    return {
      w: live.w,
      h: live.h,
      portrait,
      profileKey: portrait ? "auto-portrait" : "auto"
    };
  }

  const preset = DISPLAY_PRESETS[profile];
  if (preset) {
    const portrait = isPortrait(preset.w, preset.h, preset.portrait === true);
    return {
      w: preset.w,
      h: preset.h,
      portrait,
      profileKey: profile
    };
  }

  const portrait = isPortrait(live.w, live.h);
  return {
    w: live.w,
    h: live.h,
    portrait,
    profileKey: portrait ? "auto-portrait" : "auto"
  };
}

/**
 * Uniform scale factor vs the active design reference (1.0 at 2560×1440 landscape
 * or at 1080×1920 portrait / Vizio, then mild portrait bias).
 * @param {DisplayViewport} [viewport]
 */
export function computeDisplayFactor(viewport = resolveDisplayViewport()) {
  const ref = viewport.portrait ? HUD_DESIGN_REF_PORTRAIT : HUD_DESIGN_REF_LANDSCAPE;
  let raw = Math.min(viewport.w / ref.w, viewport.h / ref.h);
  if (viewport.portrait) raw *= HUD_PORTRAIT_FACTOR_BIAS;
  return Math.max(HUD_FIT_MIN_FACTOR, Math.min(HUD_FIT_MAX_FACTOR, raw));
}

/** True when the active display profile is treating the HUD as portrait / Vizio. */
export function isPortraitDisplay(viewport = resolveDisplayViewport()) {
  return Boolean(viewport.portrait || viewport.profileKey === "vizio-v405-g9-portrait");
}

/** True only when Display Profile is locked to Vizio V405-G9 (not Auto portrait). */
export function isVizioDisplayProfile(profile = getDisplayProfile()) {
  return profile === "vizio-v405-g9-portrait";
}

/**
 * Publish the active display profile for optional CSS hooks.
 * @param {DisplayViewport} [viewport]
 */
export function applyDisplayProfileDataset(viewport = resolveDisplayViewport()) {
  const root = document.documentElement;
  const vizio = isVizioDisplayProfile(viewport.profileKey);
  root.classList.toggle("illusive-dnd-display-vizio", vizio);
  root.dataset.illusiveDndVizio = vizio ? "1" : "0";
  if (vizio) {
    root.dataset.illusiveDndDisplayProfile = "vizio-portrait";
  } else if (isPortraitDisplay(viewport)) {
    root.dataset.illusiveDndDisplayProfile = "vizio-portrait";
  } else if (viewport.profileKey === "auto") {
    root.dataset.illusiveDndDisplayProfile = "auto";
  } else {
    root.dataset.illusiveDndDisplayProfile = viewport.profileKey;
  }
}

/**
 * True when an element is connected and paints a meaningful box in UI-local space.
 * Lock View hides #sidebar / #scene-controls with visibility:hidden while wrappers
 * like #ui-right still take layout space — treat those as absent.
 * @param {Element|null|undefined} el
 */
function isVisiblyOccupying(el) {
  if (!(el instanceof HTMLElement) || !el.isConnected) return false;
  if (el.style?.visibility === "hidden" || el.style?.display === "none") return false;
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (Number.parseFloat(style.opacity || "1") === 0) return false;
  const rect = getUiLocalRect(el);
  return Boolean(rect && rect.width >= 8 && rect.height >= 8);
}

/**
 * Prefer #sidebar over #ui-right. Lock View hides #sidebar; #ui-right stays and
 * would otherwise keep stealing band width.
 */
function getSidebarMenuElement() {
  return document.getElementById("sidebar")
    ?? ui?.sidebar?.element
    ?? document.getElementById("ui-right")
    ?? document.querySelector("#interface #ui-right")
    ?? null;
}

/**
 * Whether Foundry's right-side menu chrome is present and taking space.
 */
export function isSidebarMenuPresent() {
  const sidebar = document.getElementById("sidebar") ?? ui?.sidebar?.element ?? null;
  if (sidebar && !isVisiblyOccupying(sidebar)) return false;

  const root = getSidebarMenuElement();
  if (!isVisiblyOccupying(root)) return false;

  const vw = viewportSize().w;
  const rootRect = getUiLocalRect(root);
  if (!rootRect) return false;

  if (rootRect.width >= vw * 0.85 && rootRect.left <= 4) return false;
  if (rootRect.left >= vw - 4) return false;

  const tabs = document.getElementById("sidebar-tabs")
    ?? root.querySelector?.("#sidebar-tabs, nav.tabs, menu");
  if (tabs && isVisiblyOccupying(tabs)) return true;

  return rootRect.right >= vw * 0.55 && rootRect.width >= 24;
}

/**
 * UI-local X of the sidebar's left edge, or null when the menu is absent.
 * @returns {number|null}
 */
export function getSidebarOccupiedLeft() {
  if (!isSidebarMenuPresent()) return null;
  const menu = document.getElementById("sidebar") ?? getSidebarMenuElement();
  const rect = getUiLocalRect(menu);
  if (!rect) return null;
  return rect.left;
}

function getSceneControlsRight() {
  const controls = document.getElementById("scene-controls")
    ?? document.getElementById("ui-left")
    ?? document.getElementById("controls")
    ?? document.querySelector("#interface #ui-left");
  if (!isVisiblyOccupying(controls)) return 0;
  return getUiLocalRect(controls)?.right ?? 0;
}

/**
 * @param {number} [margin] px of breathing room kept on each side of the band.
 * @returns {HudBand}
 */
export function getHudBand(margin = 12) {
  const vw = viewportSize().w;

  const occupiedLeft = getSidebarOccupiedLeft();
  const rightEdge = occupiedLeft ?? vw;

  const rawLeft = getSceneControlsRight();
  const leftEdge = Math.min(Math.max(0, rawLeft), vw * 0.2);

  const start = leftEdge + margin;
  const end = Math.min(vw, rightEdge) - margin;
  const width = Math.max(160, end - start);

  return { start, end, width, center: start + width / 2 };
}

/**
 * Screen-fit multiplier for turn tracker and party rail.
 * Landscape keeps the 1.5× design boost; portrait uses 1.0× so more cards fit.
 * @param {DisplayViewport} [viewport]
 */
export function computeHudFitScale(viewport = resolveDisplayViewport()) {
  const base = viewport.portrait ? HUD_FIT_BASE_SCALE_PORTRAIT : HUD_FIT_BASE_SCALE;
  return base * computeDisplayFactor(viewport);
}

/**
 * Action bar scale, additionally capped so the authored 1120px bar fits the band.
 * Vizio V405-G9 profile then applies {@link HUD_ACTION_BAR_VIZIO_SCALE} (~0.88).
 * @param {HudBand} [band]
 * @param {number} [factor]
 * @param {string} [profile]
 */
export function computeActionBarScale(
  band = getHudBand(),
  factor = computeDisplayFactor(),
  profile = getDisplayProfile()
) {
  const base = HUD_ACTION_BAR_BASE_SCALE * HUD_COMBAT_CHROME_SCALE * factor;
  const bandCap = (Math.max(160, band.width) * 0.96) / HUD_ACTION_BAR_DESIGN_WIDTH;
  let scale = Math.max(HUD_FIT_MIN_FACTOR, Math.min(base, bandCap));
  // Apply after band-cap so the trim is always visible on Vizio, even when the
  // band was already the limiting factor.
  if (isVizioDisplayProfile(profile)) scale *= HUD_ACTION_BAR_VIZIO_SCALE;
  return Math.max(HUD_FIT_MIN_FACTOR, scale);
}

/**
 * Publish shared fit / action-bar scales as CSS variables.
 * @param {HudBand} [band]
 * @param {DisplayViewport} [viewport]
 * @returns {{ band: HudBand, viewport: DisplayViewport, factor: number, fitScale: number, actionBarScale: number }}
 */
export function applyHudFitScale(band = getHudBand(), viewport = resolveDisplayViewport()) {
  const factor = computeDisplayFactor(viewport);
  const fitScale = computeHudFitScale(viewport);
  const actionBarScale = computeActionBarScale(band, factor, viewport.profileKey);
  const root = document.documentElement;
  applyDisplayProfileDataset(viewport);
  root.style.setProperty("--illusive-dnd-hud-fit-scale", String(fitScale));
  root.style.setProperty("--illusive-dnd-global-scale", String(fitScale));
  root.style.setProperty("--illusive-dnd-action-bar-scale", String(actionBarScale));
  root.style.setProperty("--illusive-dnd-display-factor", String(factor));
  root.style.setProperty(
    "--illusive-dnd-vizio-ui-scale",
    String(isVizioDisplayProfile(viewport.profileKey) ? HUD_ACTION_BAR_VIZIO_SCALE : 1)
  );
  root.classList.toggle("illusive-dnd-display-portrait", isPortraitDisplay(viewport));
  root.classList.toggle("illusive-dnd-sidebar-absent", !isSidebarMenuPresent());
  return { band, viewport, factor, fitScale, actionBarScale };
}

export function getSidebarLeftEdge() {
  return getSidebarOccupiedLeft() ?? viewportSize().w;
}

/**
 * Distance from the viewport's right edge to the inner edge of Foundry's tab column.
 * Uses the tab strip — not the chat panel — so HUD chips sit beside the side menu.
 * When the menu is absent, returns only a small edge gap so status can fill right.
 * @param {number} [gap]
 */
export function getSidebarTabInsetFromRight(gap = 4) {
  if (!isSidebarMenuPresent()) return gap;

  const vw = viewportSize().w;
  const selectors = [
    "#sidebar-tabs",
    "#ui-right .sidebar-tab",
    "#sidebar .sidebar-tab",
    "#ui-right > nav.flexcol",
    "#sidebar > nav.flexcol"
  ];

  let tabLeft = vw;
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el || !isVisiblyOccupying(el)) continue;
    const rect = getUiLocalRect(el);
    if (!rect || rect.width <= 0 || rect.left < vw * 0.45) continue;
    tabLeft = Math.min(tabLeft, rect.left);
  }

  if (tabLeft < vw) return Math.max(gap, vw - tabLeft + gap);
  // Menu present but tabs not measured — keep a modest tab-strip reserve.
  return 52 + gap;
}

/**
 * Publish band geometry as CSS variables for HUD panels that anchor to the sidebar edge.
 * @returns {{ band: HudBand, viewport: DisplayViewport, factor: number, fitScale: number, actionBarScale: number }}
 */
export function applyHudBandVariables(margin = 12) {
  const band = getHudBand(margin);
  const root = document.documentElement;
  root.style.setProperty("--illusive-dnd-hud-band-start", `${band.start}px`);
  root.style.setProperty("--illusive-dnd-hud-band-end", `${band.end}px`);
  root.style.setProperty("--illusive-dnd-hud-band-center", `${band.center}px`);
  root.style.setProperty("--illusive-dnd-hud-band-width", `${band.width}px`);
  root.style.setProperty("--illusive-dnd-sidebar-left", `${getSidebarLeftEdge()}px`);
  root.style.setProperty("--illusive-dnd-sidebar-tab-inset", `${getSidebarTabInsetFromRight()}px`);
  return applyHudFitScale(band);
}
