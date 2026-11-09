import {
	DOM_DELTA_LINE,
	DOM_DELTA_PAGE,
	WHEEL_LINE_PX,
	WHEEL_NOTCHES_PER_CARD,
	clampListScroll,
	getCardStride,
	getListMaxScroll
} from "./party-scroll-dom.mjs";
import { getPartyMaxVisible } from "./party-scroll-viewport.mjs";

/** Convert a wheel event to pixel scroll distance. */
export function resolvePartyWheelPixels(list, event) {
	const notchPx = getCardStride(list) / WHEEL_NOTCHES_PER_CARD;
	let delta = event.deltaY;
	if (event.deltaMode === DOM_DELTA_LINE) {
		delta *= notchPx;
	} else if (event.deltaMode === DOM_DELTA_PAGE) {
		const page = list.clientHeight || getCardStride(list) * getPartyMaxVisible();
		delta *= page / 3;
	} else {
		// Pixel mode: normalize coarse mouse ticks (~100) and trackpad deltas alike.
		const lines = Math.abs(delta) >= 40 ? delta / 100 : delta / WHEEL_LINE_PX;
		delta = lines * notchPx;
	}
	return delta;
}

/** Apply a wheel delta to the list and return whether scrolling occurred. */
export function applyPartyWheelDelta(list, deltaY) {
	if (getListMaxScroll(list) <= 1) return false;
	list.scrollTop = clampListScroll(list, list.scrollTop + deltaY);
	return true;
}
