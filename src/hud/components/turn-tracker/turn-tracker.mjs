import { settingOn } from "../../lib/hud-settings.mjs";
import { desktopHudEnabled } from "../../lib/mobile-client.mjs";
import { definePanel } from "../../lib/render/define-panel.mjs";
import { TURN_TRACKER_SHELL } from "./turn-tracker-shell.mjs";
import { renderTurnTracker } from "./turn-tracker-render.mjs";
import { bindCarouselScroll } from "./turn-tracker-scroll.mjs";
import { positionTurnTracker } from "./turn-tracker-position.mjs";
import { onTurnTrackerClick, bindTurnTrackerMenu } from "./turn-tracker-menu.mjs";
import { applyTurnTrackerMinimized } from "./turn-tracker-minimize.mjs";

export { turnDirection } from "./turn-tracker-render.mjs";

export const turnTrackerPanel = definePanel({
	id: "illusive-dnd-turn-tracker",
	mask: "turn",
	shell: `<div id="illusive-dnd-turn-tracker" class="illusive-dnd-hidden">${TURN_TRACKER_SHELL}</div>`,
	enabled: () => settingOn("enableTurnTracker") && desktopHudEnabled(),
	onMount: (root) => {
		root.addEventListener("click", onTurnTrackerClick);
		bindTurnTrackerMenu(root);
		bindCarouselScroll(root);
		applyTurnTrackerMinimized(root);
	},
	position: positionTurnTracker,
	render: renderTurnTracker
});
