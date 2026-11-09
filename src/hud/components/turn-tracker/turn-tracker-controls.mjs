import { getViewedCombat, getSceneCombats } from "../../../foundry/combat.mjs";
import { openAddEventDialog } from "./add-event.mjs";
import { toggleTurnTrackerMinimized } from "./turn-tracker-minimize.mjs";
import {
  undoGameLogCurrentTurn,
  undoGameLogCurrentRound,
  recordTurnSkipped,
  recordRoundSkipped
} from "../../../application/combat-game-log.mjs";
import { openGameLogPopup } from "../action-bar/action-bar-game-log-popup.mjs";

async function confirmResetInitiative() {
	return foundry.applications.api.DialogV2.confirm({
		window: { title: "COMBAT.InitiativeReset" },
		content: "<p>Reset initiative for all combatants?</p>",
		rejectClose: false
	});
}

function switchEncounter(combat, direction) {
	const combats = getSceneCombats();
	if (combats.length < 2) return;

	const index = combats.findIndex((entry) => entry.id === combat.id);
	const target = combats[(index + direction + combats.length) % combats.length];
	return target?.activate?.();
}

/** Combatants (and event placeholders) that still need an initiative roll. */
export function getUnrolledInitiativeIds(combat) {
	return [...(combat?.combatants ?? [])]
		.filter((combatant) => combatant?.initiative == null)
		.map((combatant) => combatant.id)
		.filter(Boolean);
}

/** True when every combatant already has an initiative value. */
export function everyoneHasRolledInitiative(combat) {
	const combatants = [...(combat?.combatants ?? [])];
	if (!combatants.length) return false;
	return getUnrolledInitiativeIds(combat).length === 0;
}

/** Roll any missing initiatives, then begin combat. */
async function startCombatRollingUnrolled(combat, event) {
	const unrolled = getUnrolledInitiativeIds(combat);
	if (unrolled.length) {
		if (typeof combat.rollInitiative === "function") {
			await combat.rollInitiative(unrolled, { event });
		} else {
			await combat.rollAll({ event });
		}
	}
	return combat.startCombat();
}

/** Roll initiative only for combatants who have not rolled yet. */
async function rollRemainingInitiative(combat, event) {
	const unrolled = getUnrolledInitiativeIds(combat);
	if (!unrolled.length) return null;
	if (typeof combat.rollInitiative === "function") {
		return combat.rollInitiative(unrolled, { event });
	}
	if (typeof combat.rollAll === "function") return combat.rollAll({ event });
	return null;
}

/**
 * GM toolbar button actions on the turn tracker dock.
 * @param {string} action
 * @param {PointerEvent} event
 */
export async function handleTurnTrackerAction(action, event) {
	if (action === "toggle-minimize") {
		return toggleTurnTrackerMinimized();
	}

	const combat = getViewedCombat();
	if (!combat) return;

	switch (action) {
		case "previous-turn":
			await undoGameLogCurrentTurn(combat);
			return combat.previousTurn();
		case "next-turn":
			if (!combat.started) return startCombatRollingUnrolled(combat, event);
			recordTurnSkipped(combat);
			return combat.nextTurn();
		case "previous-round":
			await undoGameLogCurrentRound(combat);
			return combat.previousRound();
		case "next-round":
			if (combat.started) recordRoundSkipped(combat);
			return combat.nextRound();
		case "end-combat":
			return combat.endCombat();
		case "game-log":
			return openGameLogPopup({ scope: "all" });
		case "roll-all":
		case "roll-npc":
			return rollRemainingInitiative(combat, event);
		case "reset":
			if (await confirmResetInitiative()) return combat.resetAll();
			return;
		case "configure":
			return new foundry.applications.apps.CombatTrackerConfig().render(true);
		case "add-event":
			return openAddEventDialog(combat);
		case "start-combat":
			return startCombatRollingUnrolled(combat, event);
		case "previous-encounter":
			return switchEncounter(combat, -1);
		case "next-encounter":
			return switchEncounter(combat, 1);
		default:
			break;
	}
}
