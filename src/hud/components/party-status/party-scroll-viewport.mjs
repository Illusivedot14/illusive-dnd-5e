import { MODULE_ID } from "../../../constants.mjs";
import {
	getListMaxScroll,
	measureCardHeight,
	measureListGap,
	measureListPadding,
	queryTrack
} from "./party-scroll-dom.mjs";

const PARTY_MAX_PORTRAITS = 8;
const PARTY_MIN_PORTRAITS = 1;
const PARTY_DEFAULT_PORTRAITS = 4;

function restoreScrollRatio(list, scrollBefore, maxBefore) {
	const maxAfter = getListMaxScroll(list);
	if (maxAfter <= 0) {
		list.scrollTop = 0;
		return;
	}
	if (maxBefore > 0) {
		list.scrollTop = (scrollBefore / maxBefore) * maxAfter;
		return;
	}
	list.scrollTop = 0;
}

export function getPartyMaxVisible() {
	const raw = Number(game.settings.get(MODULE_ID, "partyMaxPortraits"));
	if (!Number.isFinite(raw)) return PARTY_DEFAULT_PORTRAITS;
	return Math.min(PARTY_MAX_PORTRAITS, Math.max(PARTY_MIN_PORTRAITS, Math.round(raw)));
}

/** Pixel height for exactly N whole portrait rows in the list. */
export function measurePartyViewportHeight(list, maxVisible = getPartyMaxVisible()) {
	const track = queryTrack(list) ?? list;
	const cards = track.querySelectorAll(".illusive-dnd-portrait-card");
	if (!cards.length) return null;

	const gap = measureListGap(list);
	const cardHeight = measureCardHeight(cards[0], list);
	const visible = Math.min(maxVisible, cards.length);
	const contentHeight = visible * cardHeight + Math.max(0, visible - 1) * gap;
	return contentHeight + measureListPadding(list);
}

export function applyPartyListViewport(list) {
	const height = measurePartyViewportHeight(list);
	if (height == null) {
		list.style.removeProperty("height");
		list.style.removeProperty("max-height");
		return;
	}

	const nextHeight = `${height}px`;
	if (list.style.height === nextHeight && list.style.maxHeight === nextHeight) return;

	const maxBefore = getListMaxScroll(list);
	const scrollBefore = list.scrollTop;

	list.style.height = nextHeight;
	list.style.maxHeight = nextHeight;
	restoreScrollRatio(list, scrollBefore, maxBefore);
}
