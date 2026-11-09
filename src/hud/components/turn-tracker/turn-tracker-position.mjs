import { getHudBand } from "../../lib/hud-bounds.mjs";
import { getUiLocalRect } from "../../lib/viewport.mjs";
import {
	CONTROL_GAP,
	TRACK_PADDING_INLINE,
	computeTurnTrackerScale,
	measureControlExtents,
	sizeCarouselWindow
} from "./turn-tracker-window.mjs";
import { updateCarouselScrollSlider } from "./turn-tracker-scroll.mjs";

const BAND_PAD = 4;

function applyTrackerTransform(root, band, scale) {
	root.style.left = `${Math.round(band.center)}px`;
	root.style.maxWidth = `${Math.round(band.width / scale)}px`;
	root.style.setProperty("--illusive-dnd-turn-scale", String(scale));
	root.style.setProperty("--illusive-dnd-turn-control-gap", `${CONTROL_GAP}px`);
	root.style.setProperty("--illusive-dnd-turn-track-pad", `${TRACK_PADDING_INLINE}px`);
	root.style.transform = `translateX(-50%) scale(${scale})`;
}

function readTrackerLeft(root, band) {
	const left = parseFloat(root.style.left);
	return Number.isFinite(left) ? left : band.center;
}

function centerDockOnBand(root, band, left) {
	// Centre the full dock (carousel + both GM strips) so left/right menus stay balanced.
	const visual = getDockVisualRect(root);
	if (!visual) return left;
	return left + band.center - visual.center;
}

function clampTrackerToBand(root, band, left) {
	const visual = getDockVisualRect(root);
	if (!visual) return left;

	if (visual.right > band.end - BAND_PAD) {
		left -= visual.right - (band.end - BAND_PAD);
	}
	if (visual.left < band.start + BAND_PAD) {
		left += (band.start + BAND_PAD) - visual.left;
	}

	return left;
}

/** Union rect of the carousel + flanking GM controls (UI-local coords). */
export function getDockVisualRect(root) {
	const dock = root.querySelector(".illusive-dnd-turn-dock");
	if (!dock) return null;

	const minimize = dock.querySelector(".illusive-dnd-turn-minimize");
	if (root.classList.contains("illusive-dnd-turn-minimized")) {
		return getUiLocalRect(minimize) ?? getUiLocalRect(dock);
	}

	const boxes = [];
	const carousel = dock.querySelector(".illusive-dnd-turn-carousel");
	const carouselRect = carousel ? getUiLocalRect(carousel) : null;
	if (carouselRect) boxes.push(carouselRect);

	for (const sel of [".illusive-dnd-turn-controls-left", ".illusive-dnd-turn-controls-right"]) {
		const el = dock.querySelector(sel);
		if (el && !el.hidden) {
			const rect = getUiLocalRect(el);
			if (rect) boxes.push(rect);
		}
	}

	if (!boxes.length) return getUiLocalRect(dock);

	const left = Math.min(...boxes.map((r) => r.left));
	const right = Math.max(...boxes.map((r) => r.right));
	const top = Math.min(...boxes.map((r) => r.top));
	const bottom = Math.max(...boxes.map((r) => r.bottom));
	return {
		left,
		right,
		top,
		bottom,
		width: right - left,
		height: bottom - top,
		center: (left + right) / 2
	};
}


/**
 * Fit the tracker to the available on-screen band: centre the full dock
 * (carousel + GM strips), scale down on small windows, and clamp so GM controls
 * never overlap the sidebar.
 */
export function positionTurnTracker() {
	const root = document.getElementById("illusive-dnd-turn-tracker");
	if (!root || root.classList.contains("illusive-dnd-hidden")) return;

	const band = getHudBand();
	const extents = measureControlExtents(root);
	const scale = computeTurnTrackerScale(band, root, extents);

	applyTrackerTransform(root, band, scale);
	sizeCarouselWindow(root, band, scale, extents);

	requestAnimationFrame(() => alignTurnTrackerToBand(root, band));
}

/**
 * Centre the full dock on the HUD band, then clamp so carousel + GM controls
 * stay inside the band.
 */
export function alignTurnTrackerToBand(root, band = getHudBand()) {
	let left = readTrackerLeft(root, band);
	root.style.left = `${Math.round(left)}px`;

	left = centerDockOnBand(root, band, left);
	root.style.left = `${Math.round(left)}px`;

	left = clampTrackerToBand(root, band, left);
	root.style.left = `${Math.round(left)}px`;

	updateCarouselScrollSlider(root);
	publishTurnTrackerBounds();
}

/**
 * Screen-space right edge of the full turn tracker (cards + flanking GM controls).
 * Status icons anchor to the right of this so they never overlap the initiative row.
 */
function getTurnTrackerRightEdge() {
	const root = document.getElementById("illusive-dnd-turn-tracker");
	if (!root || root.classList.contains("illusive-dnd-hidden")) {
		return getHudBand().start;
	}

	const visual = getDockVisualRect(root);
	return visual?.right ?? getHudBand().start;
}

export function publishTurnTrackerBounds() {
	const right = getTurnTrackerRightEdge();
	document.documentElement.style.setProperty("--illusive-dnd-turn-tracker-right", `${Math.round(right)}px`);
}
