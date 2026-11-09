import { updateCardElement } from "./turn-tracker-card-dom.mjs";
import { getSceneCombats } from "../../../foundry/combat.mjs";
import { everyoneHasRolledInitiative } from "./turn-tracker-controls.mjs";

function setInitiativeButtonMode(root, combat) {
	const button = root.querySelector("[data-illusive-dnd-initiative-btn]");
	if (!button) return;

	const allRolled = everyoneHasRolledInitiative(combat);
	const icon = button.querySelector("i");
	if (allRolled) {
		button.dataset.action = "reset";
		button.dataset.tooltip = "COMBAT.InitiativeReset";
		button.setAttribute("aria-label", game.i18n.localize("COMBAT.InitiativeReset"));
		if (icon) icon.className = "fas fa-undo";
	} else {
		button.dataset.action = "roll-all";
		button.dataset.tooltip = "Roll remaining initiative";
		button.setAttribute("aria-label", "Roll remaining initiative");
		if (icon) icon.className = "fas fa-dice-d20";
	}
}

function setCombatButtonVisibility(root, combat) {
	const startButton = root.querySelector('[data-action="start-combat"]');
	const endButton = root.querySelector('[data-action="end-combat"]');
	if (startButton) startButton.hidden = combat.started;
	if (endButton) endButton.hidden = !combat.started;

	const nextButton = root.querySelector('[data-action="next-turn"]');
	if (nextButton) {
		const label = combat.started ? "COMBAT.TurnNext" : "COMBAT.Begin";
		nextButton.dataset.tooltip = label;
		nextButton.setAttribute("aria-label", game.i18n.localize(label));
	}

	setInitiativeButtonMode(root, combat);
}

function setEncounterButtonVisibility(root) {
	const multipleEncounters = getSceneCombats().length > 1;
	root.querySelectorAll("[data-illusive-dnd-encounter]").forEach((button) => {
		button.hidden = !multipleEncounters;
	});
}

function setGmControlVisibility(root) {
	root.querySelectorAll('[data-illusive-dnd-controls="gm"]').forEach((group) => {
		group.hidden = !game.user.isGM;
	});
}

/** Show/hide GM controls and the start/end-combat buttons based on combat state. */
export function updateTurnTrackerControls(combat) {
	const root = document.getElementById("illusive-dnd-turn-tracker");
	if (!root || !combat) return;

	setCombatButtonVisibility(root, combat);
	setEncounterButtonVisibility(root);
	setGmControlVisibility(root);
}

/** True when the set/order of visible cards no longer matches the layout (needs re-template). */
export function needsFullRebuild(track, layout) {
	const visibleCards = [...track.querySelectorAll(".illusive-dnd-turn-card[data-combatant-id]")]
		.filter((card) => !card.hidden);
	if (visibleCards.length !== layout.combatantIds.length) return true;

	return visibleCards.some((card, index) => card.dataset.combatantId !== layout.combatantIds[index]);
}

function updateRoundSeparator(track, layout) {
	const separator = track.querySelector(".illusive-dnd-turn-separator");
	if (!separator) return;

	separator.style.order = layout.separatorOrder;
	const round = separator.querySelector(".illusive-dnd-turn-separator-round span:last-child");
	if (round) round.textContent = String(layout.round);
}

/** Patch existing cards + the round separator in place (no re-template). */
export function applyCarouselLayout(track, layout) {
	updateRoundSeparator(track, layout);

	for (const data of layout.combatants) {
		const card = track.querySelector(`[data-combatant-id="${data.id}"]`);
		if (card) updateCardElement(card, data);
	}
}
