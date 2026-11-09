import { illusiveDnd } from "../../../i18n/index.mjs";
import { settingOn } from "../../lib/hud-settings.mjs";
import {
	isPartyRailMinimizedEffective,
	readPartyPlayerPrefs,
	updatePartyPlayerPrefs
} from "../../lib/party-player-prefs.mjs";
import { getUiLocalRect, prefersReducedMotion, runMinimizeToggle, updateMinimizeControl as updateMinimizeControlShared, waitForCssMotion } from "../../lib/viewport.mjs";
import { getPartyMaxVisible, measurePartyViewportHeight } from "./party-status-scroll.mjs";

const RAIL_MOTION_MS = 280;
const RAIL_MOTION_CLASS = "illusive-dnd-party-rail-motion";
const RAIL_MOTION_OUT_CLASS = "illusive-dnd-party-rail-motion-out";
const RAIL_MOTION_IN_CLASS = "illusive-dnd-party-rail-motion-in";

export function isPartyRailMinimized() {
	return isPartyRailMinimizedEffective();
}

function hudAnimationEnabled() {
	return settingOn("partyRailAnimation") && !prefersReducedMotion();
}

function updateMinimizeControl(root) {
	updateMinimizeControlShared(root, {
		buttonSelector: ".illusive-dnd-party-minimize",
		minimizedClass: "illusive-dnd-party-minimized",
		iconMinimized: "fas fa-chevron-right",
		iconExpanded: "fas fa-chevron-left",
		expandLabel: illusiveDnd.partyRail("expand"),
		minimizeLabel: illusiveDnd.partyRail("minimize")
	});
}

/** Remember panel size so the side tab stays put when the rail is minimized. */
function fallbackCardWidth() {
	const size = document.body.dataset.illusiveDndPartySize ?? "normal";
	if (size === "compact") return 51;
	if (size === "large") return 76;
	return 62;
}

function measurePartyBodyFrame(root) {
	const body = root.querySelector(".illusive-dnd-party-body");
	const list = root.querySelector("#illusive-dnd-party-list");
	if (!body || !list) return null;

	if (!root.classList.contains("illusive-dnd-party-minimized") && body.offsetHeight > 0 && body.offsetWidth > 0) {
		return { height: body.offsetHeight, width: body.offsetWidth };
	}

	const listHeight = measurePartyViewportHeight(list);
	if (listHeight == null) return null;

	const bodyStyle = getComputedStyle(body);
	const bodyVertical =
		(parseFloat(bodyStyle.paddingTop) || 0)
		+ (parseFloat(bodyStyle.paddingBottom) || 0)
		+ (parseFloat(bodyStyle.borderTopWidth) || 0)
		+ (parseFloat(bodyStyle.borderBottomWidth) || 0);
	const bodyHorizontal =
		(parseFloat(bodyStyle.paddingLeft) || 0)
		+ (parseFloat(bodyStyle.paddingRight) || 0)
		+ (parseFloat(bodyStyle.borderLeftWidth) || 0)
		+ (parseFloat(bodyStyle.borderRightWidth) || 0);

	const track = list.querySelector("#illusive-dnd-party-list-track") ?? list;
	const cards = track.querySelectorAll(".illusive-dnd-portrait-card");
	const card = cards[0];
	let cardWidth = fallbackCardWidth();
	if (card) {
		const measured = card.offsetWidth || parseFloat(getComputedStyle(card).width);
		if (Number.isFinite(measured) && measured > 0) cardWidth = measured;
	}

	const scrollable = settingOn("partyScroll") && cards.length > getPartyMaxVisible();
	let contentWidth = cardWidth;
	if (scrollable) contentWidth += 18;

	return {
		height: listHeight + bodyVertical,
		width: contentWidth + bodyHorizontal
	};
}

export function syncPartyRailFrameMetrics(root = document.getElementById("illusive-dnd-party-status")) {
	if (!root) return;
	const frame = measurePartyBodyFrame(root);
	if (!frame) return;
	if (frame.height > 0) root.style.setProperty("--illusive-dnd-party-frame-height", `${frame.height}px`);
	if (frame.width > 0) root.style.setProperty("--illusive-dnd-party-frame-width", `${frame.width}px`);
}

function readFrameWidthPx(root, body) {
	const fromVar = parseFloat(root.style.getPropertyValue("--illusive-dnd-party-frame-width"));
	if (Number.isFinite(fromVar) && fromVar > 0) return fromVar;
	const measured = body.scrollWidth || body.offsetWidth;
	return measured > 0 ? measured : fallbackCardWidth();
}

function clearBodyMotionStyles(body) {
	body.style.removeProperty("width");
	body.style.removeProperty("flex-basis");
	body.style.removeProperty("flex-grow");
	body.style.removeProperty("flex-shrink");
	body.style.removeProperty("min-width");
	body.style.removeProperty("max-width");
	body.style.removeProperty("margin-left");
	body.style.removeProperty("transform");
	body.style.removeProperty("overflow");
	body.style.removeProperty("pointer-events");
	body.style.removeProperty("visibility");
}

function clearRootMotionStyles(root) {
	root.style.removeProperty("overflow");
}

function waitForRailMotion(body) {
	return waitForCssMotion(body, RAIL_MOTION_MS + 120);
}

function clearMotionClasses(root) {
	root.classList.remove(RAIL_MOTION_CLASS, RAIL_MOTION_OUT_CLASS, RAIL_MOTION_IN_CLASS);
}

function beginRailMotion(root, direction) {
	clearMotionClasses(root);
	root.classList.add(RAIL_MOTION_CLASS);
	root.classList.add(direction === "out" ? RAIL_MOTION_OUT_CLASS : RAIL_MOTION_IN_CLASS);
}

function applyMinimizedInstant(root, minimized) {
	clearMotionClasses(root);
	clearRootMotionStyles(root);
	const body = root.querySelector(".illusive-dnd-party-body");
	if (body) {
		clearBodyMotionStyles(body);
		body.setAttribute("aria-hidden", minimized ? "true" : "false");
	}
	if (minimized) syncPartyRailFrameMetrics(root);
	root.classList.toggle("illusive-dnd-party-minimized", minimized);
	if (!minimized) requestAnimationFrame(() => syncPartyRailFrameMetrics(root));
}

function paintRailFrame() {
	return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function lockBodyWidth(body, width) {
	body.style.overflow = "visible";
	body.style.flexGrow = "0";
	body.style.flexShrink = "0";
	body.style.flexBasis = `${width}px`;
	body.style.width = `${width}px`;
	body.style.minWidth = `${width}px`;
	body.style.maxWidth = `${width}px`;
	body.style.visibility = "visible";
}

/** Pixels needed to move the body's right edge fully past the left of the UI viewport. */
function slideOffDistance(body) {
	const right = getUiLocalRect(body)?.right ?? body.offsetWidth;
	return Math.ceil(Math.max(right, body.offsetWidth)) + 8;
}

/**
 * Slide portraits fully off the left of the screen (transform) while collapsing
 * only the layout gap for the arrow (margin-left). Width stays locked — no shrink.
 */
async function animatePartyRailMinimized(root, minimized) {
	const body = root.querySelector(".illusive-dnd-party-body");
	if (!body || !hudAnimationEnabled()) {
		applyMinimizedInstant(root, minimized);
		return;
	}

	root.style.overflow = "visible";

	if (minimized) {
		syncPartyRailFrameMetrics(root);
		const width = body.offsetWidth;
		if (width <= 0) {
			applyMinimizedInstant(root, true);
			return;
		}

		const slidePx = slideOffDistance(body);
		const extraSlide = Math.max(0, slidePx - width);
		lockBodyWidth(body, width);
		body.style.marginLeft = "0px";
		body.style.transform = "translateX(0)";
		await paintRailFrame();

		beginRailMotion(root, "out");
		// margin collapses layout space; transform finishes the trip past the screen edge
		body.style.marginLeft = `${-width}px`;
		body.style.transform = `translateX(${-extraSlide}px)`;
		body.style.pointerEvents = "none";

		await waitForRailMotion(body);

		root.classList.add("illusive-dnd-party-minimized");
		clearMotionClasses(root);
		clearBodyMotionStyles(body);
		clearRootMotionStyles(root);
		body.setAttribute("aria-hidden", "true");
		return;
	}

	syncPartyRailFrameMetrics(root);
	const targetWidth = readFrameWidthPx(root, body);

	root.classList.remove("illusive-dnd-party-minimized");
	body.setAttribute("aria-hidden", "false");
	lockBodyWidth(body, targetWidth);
	body.style.marginLeft = `${-targetWidth}px`;
	body.style.transform = "translateX(0)";
	body.style.pointerEvents = "none";
	await paintRailFrame();

	const offPx = Math.ceil(Math.max(0, getUiLocalRect(body)?.right ?? 0)) + 8;
	body.style.transform = `translateX(${-offPx}px)`;
	await paintRailFrame();

	beginRailMotion(root, "in");
	body.style.marginLeft = "0px";
	body.style.transform = "translateX(0)";
	body.style.pointerEvents = "";

	await waitForRailMotion(body);

	clearMotionClasses(root);
	clearBodyMotionStyles(body);
	clearRootMotionStyles(root);
	syncPartyRailFrameMetrics(root);
}

/** Sync minimized UI from stored prefs (no animation — used on mount/settings). */
export function applyPartyRailMinimized(root = document.getElementById("illusive-dnd-party-status")) {
	if (!root) return;
	// Don't snap closed/open while a toggle animation is running.
	if (root.dataset.railAnimating === "1") return;
	applyMinimizedInstant(root, isPartyRailMinimized());
	updateMinimizeControl(root);
}

export async function togglePartyRailMinimized(root = document.getElementById("illusive-dnd-party-status")) {
	await runMinimizeToggle(root, {
		animatingKey: "railAnimating",
		isMinimized: isPartyRailMinimizedEffective,
		animate: animatePartyRailMinimized,
		persist: async (nextMinimized) => {
			updateMinimizeControl(root);
			const prefs = readPartyPlayerPrefs();
			const rail = { ...(prefs.rail ?? {}), minimized: nextMinimized };
			await updatePartyPlayerPrefs({ rail });
		},
		apply: applyPartyRailMinimized
	});
}
