import { settingOn } from "../../lib/hud-settings.mjs";
import { desktopHudEnabled } from "../../lib/mobile-client.mjs";
import { definePanel } from "../../lib/render/define-panel.mjs";
import { PARTY_STATUS_SHELL } from "./party-status-shell.mjs";
import { renderPartyStatus } from "./party-status-render.mjs";
import { bindPartyInteractions } from "./party-status-interactions.mjs";
import { bindPartyMenu } from "./party-status-menu.mjs";
import { bindPartyScroll } from "./party-status-scroll.mjs";
import { applyPartyRailMinimized } from "./party-status-minimize.mjs";

export const partyStatusPanel = definePanel({
	id: "illusive-dnd-party-status",
	mask: "party",
	shell: `<aside id="illusive-dnd-party-status">${PARTY_STATUS_SHELL}</aside>`,
	enabled: () => settingOn("enablePartyStatus") && desktopHudEnabled(),
	onMount: (root) => {
		bindPartyInteractions(root);
		bindPartyMenu(root);
		bindPartyScroll(root);
		applyPartyRailMinimized(root);
	},
	render: renderPartyStatus
});
