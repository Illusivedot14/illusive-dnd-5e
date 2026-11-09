import { settingOn } from "../../lib/hud-settings.mjs";
import { updateCarouselScrollSlider } from "./turn-tracker-scroll.mjs";

const SLIDE_CLASSES = ["illusive-dnd-turn-sliding-fwd", "illusive-dnd-turn-sliding-back"];

/**
 * Play a one-step directional slide on the carousel when the turn changes.
 * @param {number} direction >0 advanced (slide in from the right), <0 went back
 */
export function playTurnSlide(direction) {
	if (!direction || !settingOn("carouselTurnAnimation")) return;

	const track = document.getElementById("illusive-dnd-turn-tracker-track");
	if (!track) return;

	const next = direction > 0 ? "illusive-dnd-turn-sliding-fwd" : "illusive-dnd-turn-sliding-back";
	track.classList.remove(...SLIDE_CLASSES);
	void track.offsetWidth;
	track.classList.add(next);
	track.addEventListener("animationend", () => track.classList.remove(next), { once: true });
}

function scrollTrackToActive(track, smooth) {
	const behavior = smooth ? "smooth" : "instant";
	const active = track.querySelector(".illusive-dnd-turn-card.is-active");

	if (active) {
		active.scrollIntoView({ behavior, block: "nearest", inline: "start" });
		return;
	}

	track.scrollTo({ left: 0, behavior });
}

/** Scroll the carousel so the active combatant is anchored to the front (left). */
export function positionCarousel(smooth = true) {
	const track = document.getElementById("illusive-dnd-turn-tracker-track");
	if (!track) return;

	scrollTrackToActive(track, smooth);

	const root = document.getElementById("illusive-dnd-turn-tracker");
	if (root) requestAnimationFrame(() => updateCarouselScrollSlider(root));
}
