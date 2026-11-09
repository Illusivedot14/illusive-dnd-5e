import { MODULE_ID } from "../../../constants.mjs";
import { illusiveDnd } from "../../../i18n/index.mjs";
import { hudAnimationOn } from "../../lib/hud-settings.mjs";
import {
  applyMinimizedInstant as applyMinimizedInstantShared,
  beginMotion as beginMotionShared,
  clearMotionStyles,
  getUiLocalRect,
  getUiViewportSize,
  lockMotionHeight,
  prefersReducedMotion,
  runMinimizeToggle,
  updateMinimizeControl as updateMinimizeControlShared,
  waitForCssMotion
} from "../../lib/viewport.mjs";
import {
  beginFoundryChromeConceal,
  beginFoundryChromeReveal,
  finishFoundryChromeReveal,
  syncFoundryUiVisibility
} from "./action-bar-foundry-ui.mjs";

const MOTION_MS = 320;
const MOTION_CLASS = "illusive-dnd-action-bar-motion-active";
const MOTION_OUT = "illusive-dnd-action-bar-motion-out";
const MOTION_IN = "illusive-dnd-action-bar-motion-in";
const HANDOFF_DOCK = "illusive-dnd-action-bar-dock--handoff";

async function repositionDock() {
  const { positionActionBar } = await import("./action-bar.mjs");
  positionActionBar();
}

function motionRoot(dock = document.getElementById("illusive-dnd-action-bar-dock")) {
  return dock?.querySelector(".illusive-dnd-action-bar-motion") ?? null;
}

function animationEnabled() {
  return hudAnimationOn() && !prefersReducedMotion();
}

export function isActionBarMinimized() {
  return game.settings.get(MODULE_ID, "actionBarMinimized") === true;
}

function motionSpec() {
  return { motionClass: MOTION_CLASS, outClass: MOTION_OUT, inClass: MOTION_IN };
}

function updateMinimizeControl(dock) {
  updateMinimizeControlShared(dock, {
    buttonSelector: ".illusive-dnd-action-bar-minimize",
    minimizedClass: "illusive-dnd-action-bar-dock--minimized",
    iconMinimized: "fas fa-chevron-up",
    iconExpanded: "fas fa-chevron-down",
    expandLabel: illusiveDnd.actionBar("expand"),
    minimizeLabel: illusiveDnd.actionBar("minimize")
  });
}

function clearMotionClasses(dock) {
  dock.classList.remove(MOTION_CLASS, MOTION_OUT, MOTION_IN);
}

function beginMotion(dock, direction) {
  beginMotionShared(dock, motionSpec(), direction);
}

function clearBarMotionStyles(motion) {
  clearMotionStyles(motion, ["margin-bottom"]);
}

function waitForMotion(motion) {
  return waitForCssMotion(motion, MOTION_MS + 120);
}

/** Pixels needed to move the motion root fully past the bottom of the UI viewport. */
function slideOffDistance(motion) {
  const top = getUiLocalRect(motion)?.top ?? 0;
  const uiH = getUiViewportSize().h;
  return Math.ceil(Math.max(uiH - top, motion.offsetHeight)) + 8;
}

function applyMinimizedInstant(dock, minimized) {
  applyMinimizedInstantShared(dock, minimized, {
    minimizedClass: "illusive-dnd-action-bar-dock--minimized",
    motionSelector: ".illusive-dnd-action-bar-motion",
    motionClasses: [MOTION_CLASS, MOTION_OUT, MOTION_IN],
    extraStyleProps: ["margin-bottom"],
    beforeToggle: (root) => root.classList.remove(HANDOFF_DOCK)
  });
}

/**
 * Slide the action bar fully off the bottom of the screen (transform) while
 * collapsing only the layout gap for the chevron (margin-bottom). Height stays locked.
 */
async function animateActionBarMinimized(dock, minimized) {
  const motion = motionRoot(dock);
  if (!motion || !animationEnabled()) {
    applyMinimizedInstant(dock, minimized);
    syncFoundryUiVisibility();
    await repositionDock();
    return;
  }

  dock.style.overflow = "visible";
  dock.classList.add(HANDOFF_DOCK);

  if (minimized) {
    const height = motion.offsetHeight;
    if (height <= 0) {
      applyMinimizedInstant(dock, true);
      syncFoundryUiVisibility();
      await repositionDock();
      return;
    }

    // Fade the Foundry hotbar in under the departing action bar, and lift the
    // dock to its final resting height so the end doesn't snap.
    beginFoundryChromeReveal();
    await repositionDock();

    const slidePx = slideOffDistance(motion);
    const extraSlide = Math.max(0, slidePx - height);
    lockMotionHeight(motion, height);
    motion.style.marginBottom = "0px";
    motion.style.transform = "translateY(0)";
    void motion.offsetHeight;

    beginMotion(dock, "out");
    motion.style.marginBottom = `${-height}px`;
    motion.style.transform = `translateY(${extraSlide}px)`;
    motion.style.pointerEvents = "none";

    await waitForMotion(motion);

    dock.classList.add("illusive-dnd-action-bar-dock--minimized");
    clearMotionClasses(dock);
    clearBarMotionStyles(motion);
    dock.style.removeProperty("overflow");
    motion.setAttribute("aria-hidden", "true");
    finishFoundryChromeReveal();
    dock.classList.remove(HANDOFF_DOCK);
    return;
  }

  // Expand: fade hotbar away first, drop the dock, then slide the action bar up.
  await beginFoundryChromeConceal();
  await repositionDock();

  const storedHeight = Math.ceil(parseFloat(dock.style.getPropertyValue("--illusive-dnd-action-bar-frame-height")) || 0);
  dock.classList.remove("illusive-dnd-action-bar-dock--minimized");
  motion.setAttribute("aria-hidden", "false");
  motion.style.visibility = "hidden";
  motion.style.pointerEvents = "none";

  const height = motion.offsetHeight || storedHeight;
  if (height <= 0) {
    clearBarMotionStyles(motion);
    applyMinimizedInstant(dock, false);
    dock.classList.remove(HANDOFF_DOCK);
    return;
  }

  lockMotionHeight(motion, height);
  motion.style.marginBottom = `${-height}px`;
  motion.style.transform = "translateY(0)";
  void motion.offsetHeight;

  motion.style.transform = `translateY(${slideOffDistance(motion)}px)`;
  void motion.offsetHeight;

  motion.style.visibility = "visible";
  beginMotion(dock, "in");
  motion.style.marginBottom = "0px";
  motion.style.transform = "translateY(0)";
  motion.style.pointerEvents = "";

  await waitForMotion(motion);

  clearMotionClasses(dock);
  clearBarMotionStyles(motion);
  dock.style.removeProperty("overflow");
  dock.classList.remove(HANDOFF_DOCK);
}

function syncFrameHeight(dock) {
  const motion = motionRoot(dock);
  if (!motion || dock.classList.contains("illusive-dnd-action-bar-dock--minimized")) return;
  const height = motion.offsetHeight;
  if (height > 0) dock.style.setProperty("--illusive-dnd-action-bar-frame-height", `${height}px`);
}

/** Sync minimized UI from the client setting (no animation — used on mount/settings). */
export function applyActionBarMinimized(dock = document.getElementById("illusive-dnd-action-bar-dock")) {
  if (!dock) return;
  if (dock.dataset.barAnimating === "1") return;
  applyMinimizedInstant(dock, isActionBarMinimized());
  updateMinimizeControl(dock);
  if (!isActionBarMinimized()) syncFrameHeight(dock);
}

/** Clear minimize so the bar is visible (e.g. on token select). */
export async function expandActionBarForSelection(dock = document.getElementById("illusive-dnd-action-bar-dock")) {
  if (!isActionBarMinimized()) {
    applyActionBarMinimized(dock);
    return;
  }
  await game.settings.set(MODULE_ID, "actionBarMinimized", false);
  applyActionBarMinimized(dock);
}

export async function toggleActionBarMinimized(dock = document.getElementById("illusive-dnd-action-bar-dock")) {
  await runMinimizeToggle(dock, {
    animatingKey: "barAnimating",
    isMinimized: isActionBarMinimized,
    syncFrame: syncFrameHeight,
    animate: animateActionBarMinimized,
    persist: async (nextMinimized) => {
      updateMinimizeControl(dock);
      await game.settings.set(MODULE_ID, "actionBarMinimized", nextMinimized);
      syncFoundryUiVisibility();
      await repositionDock();
    },
    apply: applyActionBarMinimized
  });
}
