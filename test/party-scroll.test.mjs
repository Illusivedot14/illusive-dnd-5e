// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { installFoundry } from "./helpers.mjs";
import {
	applyPartyListViewport,
	applyPartyWheelDelta,
	getPartyMaxVisible,
	measurePartyViewportHeight,
	resolvePartyWheelPixels,
	scrollFromSlider,
	sliderFromScroll,
	updatePartyScrollSlider
} from "../src/hud/components/party-status/party-status-scroll.mjs";
import { PARTY_STATUS_SHELL } from "../src/hud/components/party-status/party-status-shell.mjs";

function mountPartyList(cardCount = 6, cardHeight = 96) {
	const root = document.createElement("aside");
	root.id = "illusive-dnd-party-status";
	root.innerHTML = PARTY_STATUS_SHELL;
	const list = root.querySelector("#illusive-dnd-party-list");
	const track = root.querySelector("#illusive-dnd-party-list-track");
	for (let i = 0; i < cardCount; i += 1) {
		const card = document.createElement("button");
		card.className = "illusive-dnd-portrait-card";
		card.style.height = `${cardHeight}px`;
		Object.defineProperty(card, "offsetHeight", { value: cardHeight, configurable: true });
		track.appendChild(card);
	}
	document.body.appendChild(root);
	return root;
}

describe("party scroll", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("defaults max visible portraits to 4", () => {
		installFoundry();
		expect(getPartyMaxVisible()).toBe(4);
	});

	it("clamps max visible portraits between 1 and 8", () => {
		installFoundry({ settings: { partyMaxPortraits: 12 } });
		expect(getPartyMaxVisible()).toBe(8);
		installFoundry({ settings: { partyMaxPortraits: 0 } });
		expect(getPartyMaxVisible()).toBe(1);
	});

	it("caps list height to the configured max visible count", () => {
		installFoundry({ settings: { partyMaxPortraits: 4 } });
		const root = mountPartyList(6);
		const list = root.querySelector("#illusive-dnd-party-list");
		applyPartyListViewport(list);
		expect(list.style.height).toBe(`${4 * 96 + 3 * 8}px`);
		expect(list.style.maxHeight).toBe(`${4 * 96 + 3 * 8}px`);
	});

	it("uses the active party size when cards have not measured yet", () => {
		installFoundry({ settings: { partyMaxPortraits: 4 } });
		document.body.dataset.illusiveDndPartySize = "compact";
		const root = mountPartyList(6, 0);
		const list = root.querySelector("#illusive-dnd-party-list");
		expect(measurePartyViewportHeight(list)).toBe(4 * 66 + 3 * 8);
	});

	it("maps slider and scroll positions in both directions", () => {
		installFoundry();
		const root = mountPartyList(6);
		const list = root.querySelector("#illusive-dnd-party-list");
		const slider = root.querySelector(".illusive-dnd-party-scroll-slider");
		slider.dataset.maxScroll = "600";
		list.scrollTop = 0;
		expect(sliderFromScroll(list, slider)).toBe(0);
		list.scrollTop = 600;
		expect(sliderFromScroll(list, slider)).toBe(1000);
		slider.value = "250";
		expect(scrollFromSlider(list, slider)).toBe(150);
	});

	it("applies wheel delta in natural scroll direction", () => {
		installFoundry();
		const root = mountPartyList(6);
		const list = root.querySelector("#illusive-dnd-party-list");
		Object.defineProperty(list, "scrollHeight", { value: 1000, configurable: true });
		Object.defineProperty(list, "clientHeight", { value: 400, configurable: true });
		list.scrollTop = 300;
		expect(applyPartyWheelDelta(list, 120)).toBe(true);
		expect(list.scrollTop).toBe(420);
	});

	it("uses fractional card steps for line-mode wheel deltas", () => {
		installFoundry();
		const root = mountPartyList(6);
		const list = root.querySelector("#illusive-dnd-party-list");
		Object.defineProperty(list, "clientHeight", { value: 400, configurable: true });
		const pixels = resolvePartyWheelPixels(list, { deltaY: 3, deltaMode: 1 });
		expect(pixels).toBeCloseTo((104 / 10) * 3, 5);
	});

	it("normalizes coarse pixel-mode wheel ticks to similar step size", () => {
		installFoundry();
		const root = mountPartyList(6);
		const list = root.querySelector("#illusive-dnd-party-list");
		const pixels = resolvePartyWheelPixels(list, { deltaY: 100, deltaMode: 0 });
		expect(pixels).toBeCloseTo(104 / 10, 5);
	});

	it("includes scrollable list padding in the viewport height", () => {
		installFoundry({ settings: { partyMaxPortraits: 4 } });
		const root = mountPartyList(6);
		root.classList.add("illusive-dnd-party-scrollable");
		const list = root.querySelector("#illusive-dnd-party-list");
		list.style.paddingTop = "4px";
		list.style.paddingBottom = "4px";
		expect(measurePartyViewportHeight(list)).toBe(4 * 96 + 3 * 8 + 8);
	});

	it("preserves scroll ratio when the viewport height is reapplied", () => {
		installFoundry({ settings: { partyMaxPortraits: 4 } });
		const root = mountPartyList(10);
		const list = root.querySelector("#illusive-dnd-party-list");
		applyPartyListViewport(list);
		Object.defineProperty(list, "scrollHeight", { value: 1000, configurable: true });
		Object.defineProperty(list, "clientHeight", { value: 400, configurable: true });
		list.scrollTop = 300;
		applyPartyListViewport(list);
		expect(list.scrollTop).toBe(300);
	});

	it("shows a vertical scroll slider when overflow is scrollable", () => {
		installFoundry({ settings: { partyMaxPortraits: 4, partyScroll: true } });
		const root = mountPartyList(6);
		Object.defineProperty(root.querySelector("#illusive-dnd-party-list"), "scrollHeight", { value: 640, configurable: true });
		Object.defineProperty(root.querySelector("#illusive-dnd-party-list"), "clientHeight", { value: 416, configurable: true });

		updatePartyScrollSlider(root);

		const slider = root.querySelector(".illusive-dnd-party-scroll-slider");
		expect(root.classList.contains("illusive-dnd-party-scrollable")).toBe(true);
		expect(slider.hidden).toBe(false);
		expect(slider.style.height).toBe("416px");
	});

	it("hides the slider when scrolling is disabled", () => {
		installFoundry({ settings: { partyMaxPortraits: 4, partyScroll: false } });
		const root = mountPartyList(6);
		Object.defineProperty(root.querySelector("#illusive-dnd-party-list"), "scrollHeight", { value: 640, configurable: true });
		Object.defineProperty(root.querySelector("#illusive-dnd-party-list"), "clientHeight", { value: 416, configurable: true });

		updatePartyScrollSlider(root);

		expect(root.classList.contains("illusive-dnd-party-scrollable")).toBe(false);
		expect(root.querySelector(".illusive-dnd-party-scroll-slider").hidden).toBe(true);
	});
});
