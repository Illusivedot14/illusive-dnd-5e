// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { installFoundry } from "./helpers.mjs";
import { TURN_TRACKER_SHELL } from "../src/hud/components/turn-tracker/turn-tracker-shell.mjs";
import {
	applyTurnTrackerMinimized,
	isTurnTrackerMinimized,
	toggleTurnTrackerMinimized
} from "../src/hud/components/turn-tracker/turn-tracker-minimize.mjs";
import { handleTurnTrackerAction } from "../src/hud/components/turn-tracker/turn-tracker-controls.mjs";

function mountTracker() {
	const root = document.createElement("div");
	root.id = "illusive-dnd-turn-tracker";
	root.innerHTML = TURN_TRACKER_SHELL;
	document.body.appendChild(root);
	return root;
}

describe("turn tracker minimize", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
		installFoundry({ settings: { turnTrackerMinimized: false } });
	});

	it("starts expanded by default", () => {
		const root = mountTracker();
		applyTurnTrackerMinimized(root);
		expect(isTurnTrackerMinimized()).toBe(false);
		expect(root.classList.contains("illusive-dnd-turn-minimized")).toBe(false);
		expect(root.querySelector(".illusive-dnd-turn-minimize i").className).toContain("fa-chevron-up");
	});

	it("collapses the dock and swaps the control icon", async () => {
		const root = mountTracker();
		await toggleTurnTrackerMinimized(root);

		expect(isTurnTrackerMinimized()).toBe(true);
		expect(root.classList.contains("illusive-dnd-turn-minimized")).toBe(true);
		expect(root.querySelector(".illusive-dnd-turn-minimize i").className).toContain("fa-chevron-down");
	});

	it("handles the toolbar action without requiring combat", async () => {
		mountTracker();
		await handleTurnTrackerAction("toggle-minimize");
		expect(isTurnTrackerMinimized()).toBe(true);
	});
});
