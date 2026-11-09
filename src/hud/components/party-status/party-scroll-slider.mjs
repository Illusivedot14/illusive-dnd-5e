import { settingOn } from "../../lib/hud-settings.mjs";
import { SLIDER_STEPS, scrollFromSlider as mapScrollFromSlider, sliderFromScroll as mapSliderFromScroll } from "../../lib/viewport.mjs";
import {
	getListMaxScroll,
	queryList,
	querySlider,
	queryTrack
} from "./party-scroll-dom.mjs";
import { applyPartyListViewport, getPartyMaxVisible } from "./party-scroll-viewport.mjs";

export function scrollFromSlider(list, slider) {
	return mapScrollFromSlider(list, slider, { axis: "top", maxScroll: getListMaxScroll(list) });
}

export function sliderFromScroll(list, slider) {
	return mapSliderFromScroll(list, slider, { axis: "top", maxScroll: getListMaxScroll(list) });
}

export function syncSliderFromList(list, slider) {
	if (!slider || slider.hidden) return;
	slider.value = String(sliderFromScroll(list, slider));
}

function hideSlider(root, slider) {
	slider.hidden = true;
	slider.value = "0";
	slider.dataset.maxScroll = "0";
	slider.style.removeProperty("height");
	root?.classList?.toggle("illusive-dnd-party-scrollable", false);
}

function restorePartyListScroll(list, maxScroll) {
	if (maxScroll <= 0) {
		list.scrollTop = 0;
		return;
	}

	const savedRatio = list.dataset.partyScrollRatio;
	if (savedRatio != null) {
		delete list.dataset.partyScrollRatio;
		const ratio = Number(savedRatio);
		if (Number.isFinite(ratio)) {
			list.scrollTop = ratio * maxScroll;
			return;
		}
	}

	if (list.dataset.partyScrollRestore === "top") {
		delete list.dataset.partyScrollRestore;
		list.scrollTop = 0;
		return;
	}

	if (list.dataset.partyScrollAnchor !== "1") {
		list.scrollTop = 0;
		list.dataset.partyScrollAnchor = "1";
	}
}

function showSlider(root, slider, list) {
	slider.hidden = false;
	root?.classList?.toggle("illusive-dnd-party-scrollable", true);
	slider.min = "0";
	slider.max = String(SLIDER_STEPS);
	slider.step = "1";
	slider.style.height = `${list.clientHeight}px`;

	const maxScroll = getListMaxScroll(list);
	slider.dataset.maxScroll = String(maxScroll);
	restorePartyListScroll(list, maxScroll);
	if (document.activeElement !== slider) {
		slider.value = String(sliderFromScroll(list, slider));
	}
}

/** Show or hide the scroll slider and cap list height when needed. */
export function updatePartyScrollSlider(root) {
	const list = queryList(root);
	const slider = querySlider(root);
	if (!list || !slider) return;

	if (list.dataset.sliderDragging === "1") return;

	const cards = (queryTrack(list) ?? list).querySelectorAll(".illusive-dnd-portrait-card");
	const maxVisible = getPartyMaxVisible();
	const wantsScroll = settingOn("partyScroll") && cards.length > maxVisible;

	root?.classList?.toggle("illusive-dnd-party-scrollable", wantsScroll);
	applyPartyListViewport(list);

	const maxScroll = getListMaxScroll(list);
	const scrollable = wantsScroll && maxScroll > 1;

	if (!scrollable) {
		hideSlider(root, slider);
		return;
	}

	showSlider(root, slider, list);
}

export function bindSliderDrag(list, slider) {
	const beginDrag = () => {
		list.dataset.sliderDragging = "1";
		list.style.scrollBehavior = "auto";
	};
	const endDrag = () => {
		delete list.dataset.sliderDragging;
		list.style.removeProperty("scroll-behavior");
		slider.value = String(sliderFromScroll(list, slider));
	};

	slider.addEventListener("pointerdown", beginDrag);
	slider.addEventListener("pointerup", endDrag);
	slider.addEventListener("pointercancel", endDrag);
	slider.addEventListener("blur", endDrag);
}

export function bindSliderScroll(list, slider) {
	slider.addEventListener("input", () => {
		list.scrollTop = scrollFromSlider(list, slider);
	});

	list.addEventListener("scroll", () => {
		if (list.dataset.sliderDragging === "1") return;
		syncSliderFromList(list, slider);
	}, { passive: true });
}
