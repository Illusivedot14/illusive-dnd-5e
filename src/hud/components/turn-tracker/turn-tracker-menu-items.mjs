import { isEventCombatant } from "../../../foundry/actor-data.mjs";
import { panCanvasToToken } from "../../../foundry/token-actions.mjs";
import { illusiveDnd } from "../../../i18n/index.mjs";
import { openEditEventDialog } from "./add-event.mjs";
import {
	combatantToken,
	jumpToCombatantTurn,
	resolveCombatant
} from "./turn-tracker-combatant.mjs";

const isGM = () => game.user?.isGM === true;

async function setDefeated(combatant, isDefeated) {
	await combatant.update({ defeated: isDefeated });
	const statusId = CONFIG.specialStatusEffects?.DEFEATED ?? "dead";
	await combatant.actor?.toggleStatusEffect?.(statusId, { active: isDefeated, overlay: true });
}

function pingCombatant(combatant) {
	const token = combatantToken(combatant);
	if (!token) return;
	const center = token.center ?? { x: token.x, y: token.y };
	canvas.ping?.(center);
	panCanvasToToken(token);
}

function panToCombatant(combatant) {
	const token = combatantToken(combatant);
	if (!token) return;
	panCanvasToToken(token);
}

function targetList(list) {
	const tokens = list.map(combatantToken).filter(Boolean);
	if (!tokens.length) return;
	if (tokens.length === 1) {
		const token = tokens[0];
		const alreadyTargeted = token.targeted?.has?.(game.user) ?? false;
		token.setTarget(!alreadyTargeted, { releaseOthers: false });
		return;
	}
	tokens.forEach((token, index) => token.setTarget(true, { releaseOthers: index === 0 }));
}

async function promptInitiativeValue(current) {
	const value = await foundry.applications.api.DialogV2.prompt({
		window: { title: "Set Initiative", icon: "fas fa-dice-d20" },
		content: `<div class="form-group"><label>Initiative</label><div class="form-fields"><input type="number" name="initiative" value="${current ?? ""}" step="1" autofocus></div></div>`,
		rejectClose: false,
		ok: {
			label: "Set",
			callback: (_event, button) => button.form.elements.initiative.value
		}
	});

	if (value === null || value === undefined || value === "") return null;
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : null;
}

async function setListInitiative(resolved, value) {
	if (resolved.group) await resolved.group.update({ initiative: value }).catch(() => {});
	await Promise.all(resolved.list.map((combatant) => combatant.update({ initiative: value })));
}

async function setListHidden(list, hidden) {
	await Promise.all(list.map((combatant) => combatant.update({ hidden })));
}

async function setListDefeated(list, isDefeated) {
	await Promise.all(list.map((combatant) => setDefeated(combatant, isDefeated)));
}

export function getTurnTrackerMenuItems() {
	return [
		{
			name: "Set as Current Turn",
			icon: '<i class="fas fa-flag"></i>',
			condition: (target) => {
				const { combat, list } = resolveCombatant(target);
				return Boolean(isGM() && combat?.started && list.length);
			},
			callback: (target) => {
				const { combat, list } = resolveCombatant(target);
				if (combat && list[0]) jumpToCombatantTurn(combat, list[0]);
			}
		},
		{
			name: "Reroll Initiative",
			icon: '<i class="fas fa-dice-d20"></i>',
			condition: (target) => {
				const { list } = resolveCombatant(target);
				return Boolean(isGM() && list.some((combatant) => combatant.actor));
			},
			callback: (target) => {
				const { combat, list } = resolveCombatant(target);
				if (combat && list.length) void combat.rollInitiative(list.map((combatant) => combatant.id));
			}
		},
		{
			name: "Set Initiative…",
			icon: '<i class="fas fa-pen"></i>',
			condition: (target) => Boolean(isGM() && resolveCombatant(target).list.length),
			callback: async (target) => {
				const resolved = resolveCombatant(target);
				const value = await promptInitiativeValue(resolved.list[0]?.initiative);
				if (value !== null) await setListInitiative(resolved, value);
			}
		},
		{
			name: "Clear Initiative",
			icon: '<i class="fas fa-arrow-rotate-left"></i>',
			condition: (target) => {
				const { list } = resolveCombatant(target);
				return Boolean(isGM() && list.some((combatant) => combatant.initiative != null));
			},
			callback: (target) => {
				void setListInitiative(resolveCombatant(target), null);
			}
		},
		{
			name: "Hide from Players",
			icon: '<i class="fas fa-eye-slash"></i>',
			condition: (target) => {
				const { list } = resolveCombatant(target);
				return Boolean(isGM() && list.some((combatant) => combatant.hidden === false));
			},
			callback: (target) => {
				void setListHidden(resolveCombatant(target).list, true);
			}
		},
		{
			name: "Reveal to Players",
			icon: '<i class="fas fa-eye"></i>',
			condition: (target) => {
				const { list } = resolveCombatant(target);
				return Boolean(isGM() && list.some((combatant) => combatant.hidden === true));
			},
			callback: (target) => {
				void setListHidden(resolveCombatant(target).list, false);
			}
		},
		{
			name: "Mark Defeated",
			icon: '<i class="fas fa-skull"></i>',
			condition: (target) => {
				const { list } = resolveCombatant(target);
				return Boolean(isGM() && list.some((combatant) => !(combatant.isDefeated ?? combatant.defeated)));
			},
			callback: (target) => {
				void setListDefeated(resolveCombatant(target).list, true);
			}
		},
		{
			name: "Unmark Defeated",
			icon: '<i class="fas fa-heart-pulse"></i>',
			condition: (target) => {
				const { list } = resolveCombatant(target);
				return Boolean(isGM() && list.some((combatant) => combatant.isDefeated ?? combatant.defeated));
			},
			callback: (target) => {
				void setListDefeated(resolveCombatant(target).list, false);
			}
		},
		{
			name: "Edit Event",
			icon: '<i class="fas fa-pen-to-square"></i>',
			condition: (target) => {
				const { combatant } = resolveCombatant(target);
				return Boolean(isGM() && combatant && isEventCombatant(combatant));
			},
			callback: (target) => {
				const { combat, combatant } = resolveCombatant(target);
				if (combat && combatant) void openEditEventDialog(combat, combatant);
			}
		},
		{
			name: "Target",
			icon: '<i class="fas fa-crosshairs"></i>',
			condition: (target) => resolveCombatant(target).list.some((combatant) => combatantToken(combatant)),
			callback: (target) => {
				targetList(resolveCombatant(target).list);
			}
		},
		{
			name: illusiveDnd.turnTracker("pan"),
			icon: '<i class="fas fa-location-crosshairs"></i>',
			condition: (target) => resolveCombatant(target).list.some((combatant) => combatantToken(combatant)),
			callback: (target) => {
				const { list } = resolveCombatant(target);
				const first = list.find((combatant) => combatantToken(combatant)) ?? list[0];
				if (first) panToCombatant(first);
			}
		},
		{
			name: "Ping",
			icon: '<i class="fas fa-bullseye"></i>',
			condition: (target) => resolveCombatant(target).list.some((combatant) => combatantToken(combatant)),
			callback: (target) => {
				const { list } = resolveCombatant(target);
				const first = list.find((combatant) => combatantToken(combatant)) ?? list[0];
				if (first) pingCombatant(first);
			}
		},
		{
			name: "Remove from Combat",
			icon: '<i class="fas fa-trash"></i>',
			condition: (target) => Boolean(isGM() && resolveCombatant(target).list.length),
			callback: (target) => {
				void Promise.all(resolveCombatant(target).list.map((combatant) => combatant.delete()));
			}
		}
	];
}
