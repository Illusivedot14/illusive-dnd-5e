import { togglePartyRailMinimized } from "./party-status-minimize.mjs";

export async function handlePartyStatusAction(action) {
	if (action === "toggle-party-minimize") return togglePartyRailMinimized();
}
