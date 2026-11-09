import {
	getLinkedCharacterId,
	getPartyActorId,
	isLinkedPartyToken
} from "../hud/lib/party-player-prefs.mjs";

function tokenSortName(token) {
	return (token.name || token.actor?.name || "").trim();
}

/** Stable A→Z by name, then id (order never reshuffles for the same cast). */
function compareAlphabetical(a, b) {
	const byName = tokenSortName(a).localeCompare(
		tokenSortName(b),
		game.i18n?.lang ?? "en",
		{ sensitivity: "base" }
	);
	if (byName !== 0) return byName;
	return String(a.id ?? "").localeCompare(String(b.id ?? ""));
}

function hasExplicitOwner(token, user = game.user) {
	const actor = token?.actor;
	if (!actor || actor.type !== "character" || !user) return false;
	const ownerLevel = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
	if (typeof actor.getUserLevel === "function") {
		return (actor.getUserLevel(user) ?? 0) >= ownerLevel;
	}
	const personal = actor.ownership?.[user.id];
	return typeof personal === "number" && personal >= ownerLevel;
}

/**
 * Party rail order — visual top→bottom:
 * 1) this user's assigned Player Character
 * 2) everyone else A→Z (stable; selection / combat never reshuffle)
 *
 * Fallback when no User Character is assigned: a single explicitly-owned PC.
 */
export function sortPartyTokens(tokens) {
	const list = [...tokens];
	const charId = getLinkedCharacterId(game.user);

	let primary = list.filter((token) => isLinkedPartyToken(token));
	let others = list.filter((token) => !isLinkedPartyToken(token));

	// No linked character → pin exactly one explicitly-owned PC if unambiguous.
	if (!primary.length && !charId) {
		const owned = list.filter((token) => hasExplicitOwner(token));
		if (owned.length === 1) {
			primary = owned;
			others = list.filter((token) => token !== owned[0]);
		}
	}

	// Defensive: if link id is set but token actorId differed, still try match.
	if (!primary.length && charId) {
		primary = list.filter((token) => {
			const id = getPartyActorId(token);
			return id != null && String(id) === String(charId);
		});
		others = list.filter((token) => !primary.includes(token));
	}

	primary.sort(compareAlphabetical);
	others.sort(compareAlphabetical);
	return [...primary, ...others];
}
