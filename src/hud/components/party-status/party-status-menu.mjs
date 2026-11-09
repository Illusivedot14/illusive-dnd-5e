import { getPartyMenuItems, getPartyRailMenuItems } from "./party-status-menu-items.mjs";

function showContextMenu(event, items) {
	if (!items.length) return;

	if (typeof ContextMenu !== "undefined" && ContextMenu.create) {
		ContextMenu.create(items, { event });
		return;
	}

	if (foundry.applications?.ux?.ContextMenu) {
		foundry.applications.ux.ContextMenu.event = event;
		new foundry.applications.ux.ContextMenu(event.target, [], items).render(event);
	}
}

function onPartyContextMenu(event) {
	const card = event.target.closest(".illusive-dnd-portrait-card");
	if (card) {
		event.preventDefault();
		event.stopPropagation();

		const token = canvas.tokens?.get(card.dataset.tokenId);
		if (!token) return;

		const items = getPartyMenuItems(token);
		showContextMenu(event, items);
		return;
	}

	const rail = event.target.closest("#illusive-dnd-party-status");
	if (!rail) return;

	event.preventDefault();
	event.stopPropagation();
	showContextMenu(event, getPartyRailMenuItems());
}

/** Attach the portrait context menu to the party rail (idempotent per mount). */
export function bindPartyMenu(root) {
	if (root.dataset.illusiveDndPartyMenuBound) return;
	root.dataset.illusiveDndPartyMenuBound = "1";
	root.addEventListener("contextmenu", onPartyContextMenu);
}
