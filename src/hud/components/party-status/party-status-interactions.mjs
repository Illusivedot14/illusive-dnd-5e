import { openActorSheetFromEvent, selectToken } from "../../../foundry/token-actions.mjs";
import { handlePartyStatusAction } from "./party-status-controls.mjs";

function onPartyClick(event) {
	const minimize = event.target.closest(".illusive-dnd-party-minimize[data-action]");
	if (minimize) {
		event.preventDefault();
		event.stopPropagation();
		void handlePartyStatusAction(minimize.dataset.action);
		return;
	}

	const card = event.target.closest(".illusive-dnd-portrait-card[data-token-id]");
	if (!card) return;

	event.preventDefault();
	event.stopPropagation();
	void selectToken(canvas.tokens?.get(card.dataset.tokenId));
}

function onPartyDoubleClick(event) {
	const card = event.target.closest("[data-token-id]");
	if (!card) return;
	openActorSheetFromEvent(event);
}

/** Wire click-to-select and double-click-to-sheet on the party rail. */
export function bindPartyInteractions(root) {
	root.addEventListener("click", onPartyClick);
	root.addEventListener("dblclick", onPartyDoubleClick);
}
