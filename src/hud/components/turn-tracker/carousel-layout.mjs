import { getActiveCombatant, getCombatUnits } from "../../../foundry/combat.mjs";
import { settingOn } from "../../lib/hud-settings.mjs";

function unitHasCombatant(unit, combatantId) {
	return combatantId != null && unit.memberIds.includes(combatantId);
}

/** Rotate `units` so element `start` (taken mod N) becomes index 0. */
function rotate(units, start) {
	const n = units.length;
	const s = ((start % n) + n) % n;
	return s ? [...units.slice(s), ...units.slice(0, s)] : [...units];
}

/**
 * Units in display order: the initiative ring rotated so the active unit lands
 * on the front (left) slot.
 */
function getCarouselOrder(combat, units) {
	if (units.length <= 1 || !combat.started) return [...units];

	const currentId = getActiveCombatant(combat)?.id;
	const activeIndex = units.findIndex((unit) => unitHasCombatant(unit, currentId));
	if (activeIndex < 0) return [...units];

	return rotate(units, activeIndex);
}

/** Turn-order units in tracker display order for the given combat. */
export function getCarouselCombatants(combat) {
	return getCarouselOrder(combat, getCombatUnits(combat));
}

/** The round number shown on the tail separator (upcoming round). */
export function getCarouselRoundDisplay(combat) {
	return (combat.round ?? 1) + 1;
}

function buildLayoutSignature() {
	return [
		game.user?.isGM ? "gm" : "pc",
		settingOn("showTurnCardHpNumbers") ? 1 : 0
	].join(":");
}

function buildCombatantCards(units, ordered, buildUnitData, combat) {
	const orderIndex = new Map(ordered.map((unit, index) => [unit.id, index]));

	return units.map((unit) => {
		const data = buildUnitData(unit, combat);
		const index = orderIndex.get(unit.id) ?? -1;
		return {
			...data,
			order: index * 100,
			hidden: index < 0 || data.hidden
		};
	});
}

function separatorOrderAfter(units, ordered) {
	const orderIndex = new Map(ordered.map((unit, index) => [unit.id, index]));
	const separatorAfterIndex = orderIndex.get(units[units.length - 1].id) ?? ordered.length - 1;
	return separatorAfterIndex * 100 + 50;
}

/** Build the Handlebars layout object for the turn tracker. */
export function getCarouselLayout(combat, buildUnitData) {
	const units = getCombatUnits(combat);
	if (!units.length) return null;

	const ordered = getCarouselOrder(combat, units);
	const combatants = buildCombatantCards(units, ordered, buildUnitData, combat);
	const combatantIds = combatants.filter((data) => !data.hidden).map((data) => data.id);
	if (!combatantIds.length) return null;

	return {
		combatants,
		separatorOrder: separatorOrderAfter(units, ordered),
		round: getCarouselRoundDisplay(combat),
		showHpNumbers: settingOn("showTurnCardHpNumbers"),
		signature: buildLayoutSignature(),
		combatantIds
	};
}
