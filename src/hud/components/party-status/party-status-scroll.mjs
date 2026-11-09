import { settingOn } from "../../lib/hud-settings.mjs";
import { queryTrack } from "./party-scroll-dom.mjs";
import {
	bindSliderDrag,
	bindSliderScroll,
	syncSliderFromList,
	updatePartyScrollSlider
} from "./party-scroll-slider.mjs";
import { applyPartyWheelDelta, resolvePartyWheelPixels } from "./party-scroll-wheel.mjs";

export {
	applyPartyListViewport,
	getPartyMaxVisible,
	measurePartyViewportHeight
} from "./party-scroll-viewport.mjs";
export {
	scrollFromSlider,
	sliderFromScroll,
	updatePartyScrollSlider
} from "./party-scroll-slider.mjs";
export { applyPartyWheelDelta, resolvePartyWheelPixels } from "./party-scroll-wheel.mjs";

function bindListWheel(root, list, slider) {
	const zone = root.querySelector(".illusive-dnd-party-body") ?? root;
	const onWheel = (event) => {
		if (!settingOn("partyScroll")) return;
		if (!zone.contains(event.target)) return;
		event.preventDefault();
		event.stopPropagation();
		if (!applyPartyWheelDelta(list, resolvePartyWheelPixels(list, event))) return;
		syncSliderFromList(list, slider);
	};

	zone.addEventListener("wheel", onWheel, { passive: false, capture: true });
}

function bindListResize(root, list) {
	if (typeof ResizeObserver === "undefined") return;

	const track = queryTrack(list) ?? list;
	let frame = 0;
	const observer = new ResizeObserver(() => {
		if (list.dataset.sliderDragging === "1") return;
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => updatePartyScrollSlider(root));
	});

	const watchCards = () => {
		for (const card of track.querySelectorAll(".illusive-dnd-portrait-card")) {
			if (card.dataset.partyResizeWatched === "1") continue;
			card.dataset.partyResizeWatched = "1";
			observer.observe(card);
		}
	};

	watchCards();
	new MutationObserver(watchCards).observe(track, { childList: true });
}

/** Wire the scroll slider beside the portrait list (once per root). */
export function bindPartyScroll(root) {
	if (root.dataset.partyScrollBound) return;
	root.dataset.partyScrollBound = "1";

	const list = root.querySelector("#illusive-dnd-party-list");
	const slider = root.querySelector(".illusive-dnd-party-scroll-slider");
	if (!list || !slider) return;

	bindSliderDrag(list, slider);
	bindSliderScroll(list, slider);
	bindListWheel(root, list, slider);
	bindListResize(root, list);
}
