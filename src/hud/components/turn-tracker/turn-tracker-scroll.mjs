import { settingOn } from "../../lib/hud-settings.mjs";
import { SLIDER_STEPS, scrollFromSlider as mapScrollFromSlider, sliderFromScroll as mapSliderFromScroll } from "../../lib/viewport.mjs";

function queryTrack(root) {
	return root?.querySelector?.("#illusive-dnd-turn-tracker-track")
		?? document.getElementById("illusive-dnd-turn-tracker-track");
}

function querySlider(root) {
	return root?.querySelector?.(".illusive-dnd-turn-scroll-slider")
		?? document.querySelector("#illusive-dnd-turn-tracker .illusive-dnd-turn-scroll-slider");
}

function getTrackMaxScroll(track) {
	return Math.max(0, track.scrollWidth - track.clientWidth);
}

export function scrollFromSlider(track, slider) {
	return mapScrollFromSlider(track, slider, { maxScroll: getTrackMaxScroll(track) });
}

export function sliderFromScroll(track, slider) {
	return mapSliderFromScroll(track, slider, { maxScroll: getTrackMaxScroll(track) });
}

function hideSlider(root, slider) {
	slider.hidden = true;
	slider.value = "0";
	slider.dataset.maxScroll = "0";
	root?.classList?.toggle("illusive-dnd-turn-scrollable", false);
}

function showSlider(root, slider, track) {
	slider.hidden = false;
	root?.classList?.toggle("illusive-dnd-turn-scrollable", true);
	slider.min = "0";
	slider.max = String(SLIDER_STEPS);
	slider.step = "1";

	const maxScroll = getTrackMaxScroll(track);
	slider.dataset.maxScroll = String(maxScroll);
	if (document.activeElement !== slider) {
		slider.value = String(sliderFromScroll(track, slider));
	}
}

/** Remove leftover glow portals from earlier broken approaches. */
function clearLegacyGlowPortal() {
	document.querySelectorAll(".illusive-dnd-turn-active-glow").forEach((el) => el.remove());
}

/** Show or hide the scroll slider beneath the cards and sync it to the track. */
export function updateCarouselScrollSlider(root) {
	clearLegacyGlowPortal();
	const track = queryTrack(root);
	const slider = querySlider(root);
	if (!track || !slider) return;

	const maxScroll = getTrackMaxScroll(track);
	const scrollable = settingOn("turnTrackerScroll") && maxScroll > 1;

	if (!scrollable) {
		hideSlider(root, slider);
		return;
	}

	showSlider(root, slider, track);
}

function bindSliderDrag(track, slider) {
	const beginDrag = () => {
		track.dataset.sliderDragging = "1";
		track.style.scrollBehavior = "auto";
	};
	const endDrag = () => {
		delete track.dataset.sliderDragging;
		track.style.removeProperty("scroll-behavior");
		slider.value = String(sliderFromScroll(track, slider));
	};

	slider.addEventListener("pointerdown", beginDrag);
	slider.addEventListener("pointerup", endDrag);
	slider.addEventListener("pointercancel", endDrag);
}

function bindSliderScroll(track, slider) {
	slider.addEventListener("input", () => {
		track.scrollLeft = scrollFromSlider(track, slider);
	});

	track.addEventListener("scroll", () => {
		if (track.dataset.sliderDragging) return;
		slider.value = String(sliderFromScroll(track, slider));
	}, { passive: true });
}

/** Wire the scroll slider beneath the cards to the carousel track (once per root). */
export function bindCarouselScroll(root) {
	if (root.dataset.scrollBound) return;
	root.dataset.scrollBound = "1";

	const track = root.querySelector("#illusive-dnd-turn-tracker-track");
	const slider = root.querySelector(".illusive-dnd-turn-scroll-slider");
	if (!track || !slider) return;

	bindSliderDrag(track, slider);
	bindSliderScroll(track, slider);
}
