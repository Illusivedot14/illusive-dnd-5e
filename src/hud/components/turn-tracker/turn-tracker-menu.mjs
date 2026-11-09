import { getViewedCombat } from "../../../foundry/combat.mjs";
import { focusTokenOnCanvas } from "../../../foundry/token-actions.mjs";
import { handleTurnTrackerAction } from "./turn-tracker-controls.mjs";
import { cardMemberIds, combatantToken, focusGroupTokens } from "./turn-tracker-combatant.mjs";
import { getTurnTrackerMenuItems } from "./turn-tracker-menu-items.mjs";

function handleToolbarClick(event) {
	const button = event.target.closest(".illusive-dnd-turn-btn[data-action]");
	if (!button) return false;

	event.preventDefault();
	event.stopPropagation();
	handleTurnTrackerAction(button.dataset.action, event);
	return true;
}

function handleInitiativeRollClick(event) {
	const rollControl = event.target.closest('.illusive-dnd-turn-init-roll[data-action="roll-initiative"]');
	if (!rollControl) return false;

	event.preventDefault();
	event.stopPropagation();
	const combat = getViewedCombat();
	const ids = cardMemberIds(combat, rollControl.closest(".illusive-dnd-turn-card[data-combatant-id]"));
	if (combat && ids.length) void combat.rollInitiative(ids);
	return true;
}

function handleCardClick(event) {
	const card = event.target.closest(".illusive-dnd-turn-card[data-combatant-id]");
	if (!card) return false;

	event.preventDefault();
	event.stopPropagation();

	const combat = getViewedCombat();
	const groupId = card.dataset.groupId;
	if (groupId) {
		focusGroupTokens(combat?.groups?.get(groupId));
		return true;
	}

	const combatant = combat?.combatants.get(card.dataset.combatantId);
	const token = combatantToken(combatant);
	focusTokenOnCanvas(token);
	return true;
}

export function onTurnTrackerClick(event) {
	if (handleToolbarClick(event)) return;
	if (handleInitiativeRollClick(event)) return;
	handleCardClick(event);
}

/** Attach the per-combatant context menu to the card container (idempotent per mount). */
export function bindTurnTrackerMenu(root) {
	const container = root.querySelector("#illusive-dnd-turn-tracker-track") ?? root;
	const ContextMenuImpl = foundry.applications?.ux?.ContextMenu ?? globalThis.ContextMenu;
	if (!ContextMenuImpl) return null;

	return new ContextMenuImpl(container, ".illusive-dnd-turn-card[data-combatant-id]", getTurnTrackerMenuItems(), {
		eventName: "contextmenu",
		jQuery: false,
		fixed: true
	});
}
