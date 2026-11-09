import { MODULE_ID } from "../../constants.mjs";

const EMPTY_PREFS = { rail: {}, myCard: {} };
const STALE_MY_CARD_KEYS = ["hpDisplay", "style", "showName", "showCombatState"];
const STALE_RAIL_KEYS = ["myActorId"];

export function readPartyPlayerPrefs() {
	const stored = game.settings.get(MODULE_ID, "partyPlayerPrefs") ?? {};
	return {
		rail: { ...EMPTY_PREFS.rail, ...(stored.rail ?? {}) },
		myCard: { ...EMPTY_PREFS.myCard, ...(stored.myCard ?? {}) }
	};
}

export async function updatePartyPlayerPrefs(patch) {
	const current = readPartyPlayerPrefs();
	await game.settings.set(MODULE_ID, "partyPlayerPrefs", {
		rail: patch.rail !== undefined ? patch.rail : current.rail,
		myCard: patch.myCard !== undefined ? patch.myCard : current.myCard
	});
}

/** Drop legacy pref fields that no longer affect rendering. */
export async function migrateStalePartyPlayerPrefs() {
	const prefs = readPartyPlayerPrefs();
	const myCard = { ...(prefs.myCard ?? {}) };
	const rail = { ...(prefs.rail ?? {}) };
	let changed = false;
	for (const key of STALE_MY_CARD_KEYS) {
		if (key in myCard) {
			delete myCard[key];
			changed = true;
		}
	}
	for (const key of STALE_RAIL_KEYS) {
		if (key in rail) {
			delete rail[key];
			changed = true;
		}
	}
	if (!changed) return;
	await updatePartyPlayerPrefs({ myCard, rail });
}

export async function resetPartyPlayerPrefs(scope = "all") {
	const current = readPartyPlayerPrefs();
	if (scope === "all") {
		await game.settings.set(MODULE_ID, "partyPlayerPrefs", { rail: {}, myCard: {} });
		return;
	}
	if (scope === "rail") {
		await game.settings.set(MODULE_ID, "partyPlayerPrefs", { ...current, rail: {} });
		return;
	}
	await game.settings.set(MODULE_ID, "partyPlayerPrefs", { ...current, myCard: {} });
}

/** GM/table defaults (world settings). */
export function getGmPartyDefaults() {
	return {
		offsetX: game.settings.get(MODULE_ID, "partyOffsetX") ?? 0,
		offsetY: game.settings.get(MODULE_ID, "partyOffsetY") ?? 0,
		scale: game.settings.get(MODULE_ID, "partyScale") ?? 100
	};
}

/** World actor id for a party token (handles unlinked synthetics). */
export function getPartyActorId(token) {
	return token?.document?.actorId ?? token?.actorId ?? token?.actor?.id ?? null;
}

export function getLinkedCharacterId(user = game.user) {
	if (!user) return null;
	const linked = user.character;
	if (linked?.id) return String(linked.id);
	if (typeof linked === "string" && linked) return linked;
	const raw = user._source?.character ?? null;
	return typeof raw === "string" && raw ? raw : null;
}

/** True when this token is the user's assigned Player Character. */
export function isLinkedPartyToken(token, user = game.user) {
	const charId = getLinkedCharacterId(user);
	if (!charId || !token) return false;
	const actorId = getPartyActorId(token);
	if (actorId != null && String(actorId) === charId) return true;
	const actor = token.actor;
	if (actor?.id != null && String(actor.id) === charId) return true;
	if (user.character && (user.character === actor)) return true;
	return false;
}

/**
 * "My" party card = the assigned User Character only.
 * Owning every PC (common at shared tables) must NOT pin the whole rail.
 */
export function isMyPartyToken(token) {
	const actor = token?.actor;
	if (!actor || actor.type !== "character") return false;
	return isLinkedPartyToken(token);
}

export function getEffectivePartyRailLayout() {
	const gm = getGmPartyDefaults();
	const rail = readPartyPlayerPrefs().rail ?? {};
	return {
		partyOffsetX: rail.offsetX ?? gm.offsetX,
		partyOffsetY: rail.offsetY ?? gm.offsetY,
		partyScale: (rail.scale ?? gm.scale) / 100
	};
}

export function isPartyRailMinimizedEffective() {
	const rail = readPartyPlayerPrefs().rail ?? {};
	if ("minimized" in rail) return rail.minimized === true;
	return game.settings.get(MODULE_ID, "partyMinimized") === true;
}

/** Merge GM defaults with this player's overrides for their owned PC card. */
export function applyMyCardDisplayOverrides(baseOptions, token) {
	if (!isMyPartyToken(token)) return { ...baseOptions };
	return {
		...baseOptions,
		showName: false
	};
}
