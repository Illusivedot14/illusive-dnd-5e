import { getViewedCombat } from "../../../foundry/combat.mjs";
import { jumpToCombatantTurn } from "../turn-tracker/turn-tracker-combatant.mjs";

export function resolvePartyCombatant(card) {
	const combat = getViewedCombat();
	const tokenId = card?.dataset?.tokenId;
	if (!combat || !tokenId) return { combat: null, combatant: null, token: null };

	const token = canvas.tokens?.get(tokenId) ?? null;
	const combatant = combat.combatants?.find((entry) => entry.tokenId === tokenId) ?? null;
	return { combat, combatant, token };
}

export function jumpToPartyTokenTurn(card) {
	const { combat, combatant } = resolvePartyCombatant(card);
	if (combat?.started && combatant) jumpToCombatantTurn(combat, combatant);
}
