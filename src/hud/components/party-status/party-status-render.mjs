import { MODULE_PATH, illusiveDndRenderTemplate } from "../../../constants.mjs";
import { applyActorPortrait } from "../../lib/portrait-thumb.mjs";
import { getPartyLayout } from "./party-status-layout.mjs";
import { getPartyTokens } from "./party-status-tokens.mjs";
import { updatePartyScrollSlider } from "./party-status-scroll.mjs";
import { applyPartyRailMinimized, syncPartyRailFrameMetrics } from "./party-status-minimize.mjs";
import { getHudFocusToken, isTouchTableClient } from "../../lib/hooks/touch-table.mjs";

/** Swap full-res portrait imgs for Foundry ImageHelper thumbs. */
function applyPartyPortraitThumbs(track, members) {
	const byId = new Map(members.map((member) => [member.id, member]));
	for (const card of track.querySelectorAll(":scope > .illusive-dnd-portrait-card")) {
		const member = byId.get(card.dataset.tokenId);
		const img = card.querySelector(".illusive-dnd-portrait-img");
		if (!(img instanceof HTMLImageElement)) continue;
		const token = canvas.tokens?.get(member.id);
		applyActorPortrait(img, token?.actor, {
			alt: member?.name || img.alt || "",
			fallbackSrc: member?.img || img.getAttribute("src") || ""
		});
	}
}

let renderTicket = 0;

async function rebuildPartyList(list, layout, ticket) {
	const track = list.querySelector("#illusive-dnd-party-list-track") ?? list;
	const maxBefore = Math.max(0, list.scrollHeight - list.clientHeight);
	if (maxBefore > 0) {
		list.dataset.partyScrollRatio = String(list.scrollTop / maxBefore);
	} else if (list.dataset.partyScrollAnchor === "1") {
		list.dataset.partyScrollRestore = "top";
	} else {
		delete list.dataset.partyScrollAnchor;
	}

	const html = await illusiveDndRenderTemplate(
		`${MODULE_PATH}/src/hud/components/party-status/party-status.hbs`,
		layout
	);
	if (ticket !== renderTicket) return false;

	track.innerHTML = html;
	applyPartyPortraitThumbs(track, layout.members ?? []);
	return true;
}

/** Full re-template every paint — party is small (≤8 cards) and must stay consistent. */
export async function renderPartyStatus(root) {
	const ticket = ++renderTicket;
	const list = root.querySelector("#illusive-dnd-party-list");
	if (!list) return;

	const selectedId = canvas?.tokens?.controlled?.[0]?.id
		?? (isTouchTableClient() ? getHudFocusToken()?.id : null)
		?? null;
	const tokens = getPartyTokens();
	const layout = getPartyLayout(tokens, selectedId);

	// No player characters on the scene → hide the whole rail (no empty box / chevron).
	if (!layout.members.length) {
		root.hidden = true;
		root.setAttribute("aria-hidden", "true");
		const track = list.querySelector("#illusive-dnd-party-list-track") ?? list;
		track.innerHTML = "";
		return;
	}

	root.hidden = false;
	root.removeAttribute("aria-hidden");
	root.removeAttribute("hidden");

	if (!await rebuildPartyList(list, layout, ticket)) return;

	requestAnimationFrame(() => {
		if (ticket !== renderTicket) return;
		updatePartyScrollSlider(root);
		syncPartyRailFrameMetrics(root);
		applyPartyRailMinimized(root);
	});
}
