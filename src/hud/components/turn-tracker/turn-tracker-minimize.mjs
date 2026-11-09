import { MODULE_ID } from "../../../constants.mjs";
import { illusiveDnd } from "../../../i18n/index.mjs";
import {
	applyMinimizedInstant as applyMinimizedInstantShared,
	beginMotion as beginMotionShared,
	clearMotionStyles,
	getUiLocalRect,
	lockMotionHeight,
	prefersReducedMotion,
	runMinimizeToggle,
	updateMinimizeControl as updateMinimizeControlShared,
	waitForCssMotion
} from "../../lib/viewport.mjs";
import { positionTurnTracker } from "./turn-tracker-position.mjs";

const MOTION_MS = 320;
const MOTION_CLASS = "illusive-dnd-turn-rail-motion";
const MOTION_OUT = "illusive-dnd-turn-rail-motion-out";
const MOTION_IN = "illusive-dnd-turn-rail-motion-in";

function motionRoot(root = document.getElementById("illusive-dnd-turn-tracker")) {
	return root?.querySelector(".illusive-dnd-turn-motion") ?? null;
}

function animationEnabled() {
	return !prefersReducedMotion();
}

export function isTurnTrackerMinimized() {
	return game.settings.get(MODULE_ID, "turnTrackerMinimized") === true;
}

function updateMinimizeControl(root) {
	updateMinimizeControlShared(root, {
		buttonSelector: ".illusive-dnd-turn-minimize",
		minimizedClass: "illusive-dnd-turn-minimized",
		iconMinimized: "fas fa-chevron-down",
		iconExpanded: "fas fa-chevron-up",
		expandLabel: illusiveDnd.turnTracker("expand"),
		minimizeLabel: illusiveDnd.turnTracker("minimize")
	});
}

function clearMotionClasses(root) {
	root.classList.remove(MOTION_CLASS, MOTION_OUT, MOTION_IN);
}

function beginMotion(root, direction) {
	beginMotionShared(root, { motionClass: MOTION_CLASS, outClass: MOTION_OUT, inClass: MOTION_IN }, direction);
}

function clearTurnMotionStyles(motion) {
	clearMotionStyles(motion, ["margin-top"]);
}

function waitForMotion(motion) {
	return waitForCssMotion(motion, MOTION_MS + 120);
}

/** Pixels needed to move the motion root fully past the top of the UI viewport. */
function slideOffDistance(motion) {
	const bottom = getUiLocalRect(motion)?.bottom ?? motion.offsetHeight;
	return Math.ceil(Math.max(bottom, motion.offsetHeight)) + 8;
}

function applyMinimizedInstant(root, minimized) {
	applyMinimizedInstantShared(root, minimized, {
		minimizedClass: "illusive-dnd-turn-minimized",
		motionSelector: ".illusive-dnd-turn-motion",
		motionClasses: [MOTION_CLASS, MOTION_OUT, MOTION_IN],
		extraStyleProps: ["margin-top"]
	});
}

/**
 * Slide the turn cards fully off the top of the screen (transform) while
 * collapsing only the layout gap for the chevron (margin-top). Height stays locked.
 */
async function animateTurnTrackerMinimized(root, minimized) {
	const motion = motionRoot(root);
	if (!motion || !animationEnabled()) {
		applyMinimizedInstant(root, minimized);
		return;
	}

	root.style.overflow = "visible";

	if (minimized) {
		const height = motion.offsetHeight;
		if (height <= 0) {
			applyMinimizedInstant(root, true);
			return;
		}

		const slidePx = slideOffDistance(motion);
		const extraSlide = Math.max(0, slidePx - height);
		lockMotionHeight(motion, height);
		motion.style.marginTop = "0px";
		motion.style.transform = "translateY(0)";
		// Sync start state in this frame — no painted pause at full size.
		void motion.offsetHeight;

		beginMotion(root, "out");
		motion.style.marginTop = `${-height}px`;
		motion.style.transform = `translateY(${-extraSlide}px)`;
		motion.style.pointerEvents = "none";

		await waitForMotion(motion);

		root.classList.add("illusive-dnd-turn-minimized");
		clearMotionClasses(root);
		clearTurnMotionStyles(motion);
		root.style.removeProperty("overflow");
		motion.setAttribute("aria-hidden", "true");
		return;
	}

	const storedHeight = Math.ceil(parseFloat(root.style.getPropertyValue("--illusive-dnd-turn-frame-height")) || 0);
	const controls = [...root.querySelectorAll(".illusive-dnd-turn-controls")];
	// Seed the collapsed pose before the first paint so the open tracker never flashes.
	root.classList.remove("illusive-dnd-turn-minimized");
	motion.setAttribute("aria-hidden", "false");
	motion.style.visibility = "hidden";
	motion.style.pointerEvents = "none";
	for (const el of controls) {
		el.style.visibility = "hidden";
		el.style.pointerEvents = "none";
	}

	const height = motion.offsetHeight || storedHeight;
	if (height <= 0) {
		for (const el of controls) {
			el.style.removeProperty("visibility");
			el.style.removeProperty("pointer-events");
		}
		clearTurnMotionStyles(motion);
		applyMinimizedInstant(root, false);
		return;
	}

	lockMotionHeight(motion, height);
	motion.style.marginTop = `${-height}px`;
	motion.style.transform = "translateY(0)";
	void motion.offsetHeight;

	motion.style.transform = `translateY(${-slideOffDistance(motion)}px)`;
	void motion.offsetHeight;

	motion.style.visibility = "visible";
	beginMotion(root, "in");
	motion.style.marginTop = "0px";
	motion.style.transform = "translateY(0)";
	motion.style.pointerEvents = "";

	await waitForMotion(motion);

	for (const el of controls) {
		el.style.removeProperty("visibility");
		el.style.removeProperty("pointer-events");
	}
	clearMotionClasses(root);
	clearTurnMotionStyles(motion);
	root.style.removeProperty("overflow");
}

function syncFrameHeight(root) {
	const motion = motionRoot(root);
	if (!motion || root.classList.contains("illusive-dnd-turn-minimized")) return;
	const height = motion.offsetHeight;
	if (height > 0) root.style.setProperty("--illusive-dnd-turn-frame-height", `${height}px`);
}

const REVEAL_CLASS = "illusive-dnd-turn-reveal-in";
const REVEAL_PREP_CLASS = "illusive-dnd-turn-reveal-prep";

function waitForDockReveal(dock) {
	return waitForCssMotion(dock, MOTION_MS + 120);
}

function clearRevealStyles(root, dock) {
	root.classList.remove(REVEAL_CLASS, REVEAL_PREP_CLASS);
	dock.style.removeProperty("transform");
	dock.style.removeProperty("opacity");
}

/**
 * Park the dock above the viewport before the tracker is un-hidden so the first
 * painted frame is never the fully open encounter bar.
 * @returns {boolean} true when a reveal animation should run
 */
export function seedTurnTrackerReveal(root = document.getElementById("illusive-dnd-turn-tracker")) {
	const dock = root?.querySelector(".illusive-dnd-turn-dock");
	if (!dock || !animationEnabled()) return false;

	dock.style.transform = "translateY(-120vh)";
	dock.style.opacity = "0";
	root.classList.add(REVEAL_PREP_CLASS);
	return true;
}

/**
 * Slide the whole turn tracker dock down into place when an encounter first appears.
 * Gated by the shared HUD slide animation setting.
 */
export async function playTurnTrackerReveal(root = document.getElementById("illusive-dnd-turn-tracker")) {
	const dock = root?.querySelector(".illusive-dnd-turn-dock");
	if (!dock) return;
	if (!animationEnabled()) {
		clearRevealStyles(root, dock);
		return;
	}
	if (root.dataset.turnAnimating === "1") return;

	root.dataset.turnAnimating = "1";
	try {
		positionTurnTracker();
		const height = Math.ceil(dock.offsetHeight || getUiLocalRect(dock)?.height || 0);
		const slidePx = Math.max(height, 80) + 28;

		// Stay off-screen for this frame — never paint the open pose first.
		dock.style.transform = `translateY(${-slidePx}px)`;
		dock.style.opacity = "0";
		void dock.offsetHeight;

		root.classList.add(REVEAL_CLASS);
		root.classList.remove(REVEAL_PREP_CLASS);
		dock.style.transform = "translateY(0)";
		dock.style.opacity = "1";
		await waitForDockReveal(dock);
	} finally {
		clearRevealStyles(root, dock);
		delete root.dataset.turnAnimating;
	}
}

/** Sync minimized UI from the client setting (no animation — used on mount/settings). */
export function applyTurnTrackerMinimized(root = document.getElementById("illusive-dnd-turn-tracker")) {
	if (!root) return;
	if (root.dataset.turnAnimating === "1") return;

	applyMinimizedInstant(root, isTurnTrackerMinimized());
	updateMinimizeControl(root);
	if (!isTurnTrackerMinimized()) syncFrameHeight(root);
	positionTurnTracker();
}

export async function toggleTurnTrackerMinimized(root = document.getElementById("illusive-dnd-turn-tracker")) {
	await runMinimizeToggle(root, {
		animatingKey: "turnAnimating",
		isMinimized: isTurnTrackerMinimized,
		syncFrame: syncFrameHeight,
		animate: animateTurnTrackerMinimized,
		persist: async (nextMinimized) => {
			updateMinimizeControl(root);
			await game.settings.set(MODULE_ID, "turnTrackerMinimized", nextMinimized);
		},
		apply: applyTurnTrackerMinimized
	});
}
