export { SLIDER_STEPS } from "../../lib/viewport.mjs";

export const DOM_DELTA_LINE = 1;
export const DOM_DELTA_PAGE = 2;
export const WHEEL_LINE_PX = 16;
/** Wheel detents per portrait row — higher = smaller, smoother steps. */
export const WHEEL_NOTCHES_PER_CARD = 10;

export function queryList(root) {
	return root?.querySelector?.("#illusive-dnd-party-list") ?? document.getElementById("illusive-dnd-party-list");
}

export function queryTrack(root) {
	return queryList(root)?.querySelector?.("#illusive-dnd-party-list-track")
		?? document.getElementById("illusive-dnd-party-list-track");
}

export function querySlider(root) {
	return root?.querySelector?.(".illusive-dnd-party-scroll-slider")
		?? document.querySelector("#illusive-dnd-party-status .illusive-dnd-party-scroll-slider");
}

export function measureListGap(list) {
	const track = queryTrack(list) ?? list;
	const style = getComputedStyle(track);
	const rowGap = parseFloat(style.rowGap);
	if (Number.isFinite(rowGap) && rowGap >= 0) return rowGap;
	const gap = parseFloat(style.gap);
	return Number.isFinite(gap) && gap >= 0 ? gap : 8;
}

export function measureListPadding(list) {
	const style = getComputedStyle(list);
	const top = parseFloat(style.paddingTop);
	const bottom = parseFloat(style.paddingBottom);
	return (Number.isFinite(top) ? top : 0) + (Number.isFinite(bottom) ? bottom : 0);
}

function fallbackCardHeight(list) {
	const size = document.body.dataset.illusiveDndPartySize ?? "normal";
	if (size === "compact") return 66;
	if (size === "large") return 97;
	return 83;
}

export function measureCardHeight(card, list) {
	if (!card) return fallbackCardHeight(list);
	const measured = card.offsetHeight;
	if (measured > 0) return measured;
	const computed = parseFloat(getComputedStyle(card).height);
	if (Number.isFinite(computed) && computed > 0) return computed;
	return fallbackCardHeight(list);
}

export function getCardStride(list) {
	const track = queryTrack(list) ?? list;
	const card = track.querySelector(".illusive-dnd-portrait-card");
	return measureCardHeight(card, list) + measureListGap(list);
}

export function getListMaxScroll(list) {
	return Math.max(0, list.scrollHeight - list.clientHeight);
}

export function clampListScroll(list, scrollTop) {
	const maxScroll = getListMaxScroll(list);
	return Math.max(0, Math.min(maxScroll, scrollTop));
}
