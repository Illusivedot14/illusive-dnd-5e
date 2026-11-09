import { MODULE_ID } from "../../../constants.mjs";
import { computeHudFitScale, HUD_COMBAT_CHROME_SCALE } from "../../lib/hud-bounds.mjs";
import { settingOn } from "../../lib/hud-settings.mjs";
import { getUiLocalRect } from "../../lib/viewport.mjs";
import { updateCarouselScrollSlider } from "./turn-tracker-scroll.mjs";

const CARD_GAP = 8;
/**
 * Soft outside glow on the active portrait reaches ~16–18px past the card edge.
 * The scroll track carries this much inner padding on each side so the anchored
 * (front/left) active card's edge + glow is never clipped by the scrollport.
 */
export const ACTIVE_CARD_GLOW_CLEARANCE = 20;
/** Inner horizontal track pad, per side (matches CSS --illusive-dnd-turn-track-pad). */
export const TRACK_PADDING_INLINE = ACTIVE_CARD_GLOW_CLEARANCE;
/** Total horizontal track pad for width math (both sides). */
export const TRACK_PADDING = TRACK_PADDING_INLINE * 2;
/** Vertical track pad (px each side) — room for active scale + outside glow. */
export const TRACK_PADDING_BLOCK = 32;
const MAX_CARDS_CAP = 16;
const DEFAULT_MAX_CARDS = 9;
const FALLBACK_CARD_WIDTH = 88;
/** Menu breathing gap (left strip's margin toward the carousel). */
export const CONTROL_GAP = 16;
/**
 * Right strip sits one track-pad farther so the VISIBLE card→menu gap matches
 * the left (whose anchored active card is inset by the track's left pad).
 */
export const CONTROL_GAP_RIGHT = CONTROL_GAP + TRACK_PADDING_INLINE;
const MIN_TURN_SCALE = 0.4;
/** Turn portraits should read ~25% larger than party rail cards. */
const TURN_RELATIVE_TO_PARTY = 1.25;

const PARTY_CARD_WIDTH = Object.freeze({
	compact: 51,
	normal: 62,
	large: 76
});

/** The user's "max cards" cap, clamped to a sane 1–16. */
export function getMaxCards() {
	const raw = Number(game.settings.get(MODULE_ID, "turnTrackerMaxCards"));
	const n = Number.isFinite(raw) ? Math.round(raw) : DEFAULT_MAX_CARDS;
	return Math.max(1, Math.min(MAX_CARDS_CAP, n));
}

/** Width the GM control columns extend beyond the carousel box (layout px, pre-scale). */
export function measureControlExtents(root) {
	const left = root.querySelector(".illusive-dnd-turn-controls-left");
	const right = root.querySelector(".illusive-dnd-turn-controls-right");
	const leftExt = left && !left.hidden ? left.offsetWidth + CONTROL_GAP : 0;
	const rightExt = right && !right.hidden ? right.offsetWidth + CONTROL_GAP_RIGHT : 0;
	return { leftExt, rightExt };
}

function trackWidthFor(cardWidth, visibleCount) {
	return Math.round(
		visibleCount * cardWidth + (visibleCount - 1) * CARD_GAP + TRACK_PADDING
	);
}

function layoutWidthFor(cardWidth, count, extents) {
	return (
		count * cardWidth
		+ Math.max(0, count - 1) * CARD_GAP
		+ TRACK_PADDING
		+ extents.leftExt
		+ extents.rightExt
	);
}

function countVisibleCards(cardCount, cardWidth, band, scale, extents) {
	const slot = cardWidth + CARD_GAP;
	const trackRoom = band.width / scale - extents.leftExt - extents.rightExt - TRACK_PADDING;
	const fit = Math.max(1, Math.floor((trackRoom + CARD_GAP) / slot));
	return Math.max(1, Math.min(getMaxCards(), cardCount, fit));
}

/** Party portrait card width in layout space. */
function measurePartyCardVisualWidth() {
	const card = document.querySelector("#illusive-dnd-party-status .illusive-dnd-portrait-card");
	if (card) {
		const live = getUiLocalRect(card)?.width || card.getBoundingClientRect().width;
		if (live && live >= 8) return live;
	}

	const size = document.body.dataset.illusiveDndPartySize ?? "normal";
	const layoutW = PARTY_CARD_WIDTH[size] ?? PARTY_CARD_WIDTH.normal;
	const rootStyle = getComputedStyle(document.documentElement);
	const partyScale = Number.parseFloat(rootStyle.getPropertyValue("--illusive-dnd-party-scale")) || 1;
	const globalScale = Number.parseFloat(rootStyle.getPropertyValue("--illusive-dnd-global-scale")) || 1;
	return layoutW * partyScale * globalScale;
}

/**
 * Scale turn cards to ~125% of the party rail card, without exceeding the HUD fit scale.
 * @param {{ start: number, end: number, width: number, center: number }} band
 * @param {HTMLElement} root
 * @param {{ leftExt: number, rightExt: number }} [extents]
 */
export function computeTurnTrackerScale(band, root, extents = measureControlExtents(root)) {
	const base = computeHudFitScale();
	const track = root.querySelector("#illusive-dnd-turn-tracker-track");
	const cards = track?.querySelectorAll(".illusive-dnd-turn-card");
	const cardWidth = cards?.[0]?.offsetWidth || FALLBACK_CARD_WIDTH;

	const partyVisual = measurePartyCardVisualWidth();
	const relativeScale = (partyVisual * TURN_RELATIVE_TO_PARTY) / cardWidth;

	// Prefer the party-relative size; only shrink further when even 6 cards won't fit.
	let scale = Math.max(MIN_TURN_SCALE, Math.min(base, relativeScale)) * HUD_COMBAT_CHROME_SCALE;
	if (cards?.length) {
		const minWant = Math.min(6, getMaxCards(), cards.length);
		const fitMin = band.width / Math.max(1, layoutWidthFor(cardWidth, minWant, extents));
		if (scale > fitMin) scale = Math.max(MIN_TURN_SCALE, fitMin);
	}

	return scale;
}

function applyTrackOverflow(track) {
	track.style.overflowX = settingOn("turnTrackerScroll") ? "auto" : "hidden";
}

function clearTrackSizing(track) {
	track.style.removeProperty("width");
	track.style.removeProperty("flex");
}

/**
 * Pin the carousel to a whole number of cards so none is ever cut off, and set
 * its overflow from the scroll setting.
 */
export function sizeCarouselWindow(root, band, scale, extents = measureControlExtents(root)) {
	const track = root.querySelector("#illusive-dnd-turn-tracker-track");
	if (!track) return;

	applyTrackOverflow(track);

	const cards = track.querySelectorAll(".illusive-dnd-turn-card");
	if (!cards.length) {
		clearTrackSizing(track);
		return;
	}

	const cardWidth = cards[0].offsetWidth || FALLBACK_CARD_WIDTH;
	const visible = countVisibleCards(cards.length, cardWidth, band, scale, extents);

	track.style.flex = "0 0 auto";
	track.style.width = `${trackWidthFor(cardWidth, visible)}px`;

	updateCarouselScrollSlider(root);
}
