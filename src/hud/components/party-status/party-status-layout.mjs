import { buildMemberData } from "../../../foundry/actor-data.mjs";
import { buildVitalityIcon, isPartyDeathSaving, isPartyDefeated, isPartyStabilized } from "../../../application/party-combat.mjs";
import { sortPartyTokens } from "../../../application/party-sort.mjs";
import { getDamageWashCssPct } from "../../../foundry/actor-stats.mjs";
import { illusiveDnd } from "../../../i18n/index.mjs";
import { applyMyCardDisplayOverrides } from "../../lib/party-player-prefs.mjs";
import { getViewedCombat } from "../../../foundry/combat.mjs";

function readPartyDisplayOptions() {
	return {
		inCombat: Boolean(getViewedCombat()?.started)
	};
}

/** View-model for one party portrait card (portrait, name, vitality). */
export function buildPartyMember(token, options, selectedId = null) {
	const cardOptions = applyMyCardDisplayOverrides(options, token);
	const data = buildMemberData(token);
	data.selected = token.id === selectedId;

	data.isDefeated = isPartyDefeated(token);
	data.isDeathSaving = isPartyDeathSaving(token);
	data.isStabilized = isPartyStabilized(token);
	data.vitalityIcon = buildVitalityIcon(data);
	data.vitalityHidden = Boolean(data.vitalityIcon);

	if (cardOptions.inCombat) {
		data.combat = { isTurn: Boolean(data.isMyTurn) };
	} else {
		data.combat = null;
	}

	const washPct = data.vitalityIcon
		? null
		: getDamageWashCssPct(data.hp?.totalPercent ?? data.hp?.basePercent ?? data.hp?.percent);
	data.showDamageWash = washPct != null;
	data.hpPctCss = washPct != null ? `${washPct}%` : "100%";
	data.showName = false;
	data.tooltip = data.displayName || data.name;

	return data;
}

/** Handlebars layout object for the party rail. */
export function getPartyLayout(tokens, selectedId = null) {
	const options = readPartyDisplayOptions();
	const members = sortPartyTokens(tokens)
		.map((token) => buildPartyMember(token, options, selectedId));

	return {
		members,
		memberIds: members.map((member) => member.id),
		emptyPartyText: illusiveDnd.empty("noParty")
	};
}
