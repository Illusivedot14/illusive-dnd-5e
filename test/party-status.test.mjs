// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { installFoundry, makeActor, makeCombat, makeCombatant, makeToken } from "./helpers.mjs";
import { buildPartyMember, getPartyLayout } from "../src/hud/components/party-status/party-status-layout.mjs";
import { PARTY_STATUS_SHELL } from "../src/hud/components/party-status/party-status-shell.mjs";
import { togglePartyRailMinimized } from "../src/hud/components/party-status/party-status-minimize.mjs";

function partyToken(overrides = {}) {
	const actor = makeActor({ hp: { value: 8, max: 10, temp: 2 } });
	return makeToken({
		name: "Hero",
		actor: { ...actor, type: "character", hasPlayerOwner: true },
		...overrides
	});
}

const cardOptions = {
	inCombat: false,
	showName: false
};

describe("buildPartyMember", () => {
	beforeEach(() => installFoundry());

	it("never shows portrait names", () => {
		const token = partyToken({ id: "t1" });
		const member = buildPartyMember(token, cardOptions, "t1");

		expect(member.selected).toBe(true);
		expect(member.showName).toBe(false);
		expect(member.vitalityIcon).toBeNull();
		expect(member.vitalityHidden).toBe(false);
		expect(member.showDamageWash).toBe(true);
		expect(member.hpPctCss).toBe("100%");
	});

	it("shows damage wash tracking remaining HP (party-style)", () => {
		const member = buildPartyMember(
			partyToken({ id: "t1", actor: makeActor({ hp: { value: 4, max: 10 } }) }),
			cardOptions
		);
		expect(member.showDamageWash).toBe(true);
		expect(member.hpPctCss).toBe("40%");
	});

	it("keeps damage wash above half HP", () => {
		const healthy = buildPartyMember(
			partyToken({ id: "t1", actor: makeActor({ hp: { value: 8, max: 10 } }) }),
			cardOptions
		);
		expect(healthy.showDamageWash).toBe(true);
		expect(healthy.hpPctCss).toBe("80%");
	});

	it("uses active combatant for turn highlight data", () => {
		const token = partyToken({ id: "t1" });
		const cmb = makeCombatant({ tokenId: "t1", initiative: 14 });
		const combat = makeCombat({ started: true, combatants: [cmb], active: cmb });
		installFoundry({ combat });

		const member = buildPartyMember(token, {
			...cardOptions,
			inCombat: true
		});

		expect(member.combat?.isTurn).toBe(true);
	});

	it("shows an unconscious icon while death saving", () => {
		const member = buildPartyMember(
			partyToken({ id: "t1", actor: makeActor({ hp: { value: 0, max: 10 } }) }),
			cardOptions
		);
		expect(member.isDeathSaving).toBe(true);
		expect(member.vitalityIcon?.kind).toBe("unconscious");
		expect(member.vitalityIcon?.icon).toBe("fa-dizzy");
		expect(member.vitalityHidden).toBe(true);
		expect(member.showDamageWash).toBe(false);
	});

	it("shows a skull when defeated", () => {
		const actor = makeActor({ hp: { value: 0, max: 10 } });
		const token = partyToken({ id: "t1", actor });
		const combat = makeCombat({
			started: true,
			combatants: [makeCombatant({ tokenId: "t1", defeated: true })]
		});
		installFoundry({ combat });

		const member = buildPartyMember(token, { ...cardOptions, inCombat: true });
		expect(member.isDefeated).toBe(true);
		expect(member.vitalityIcon?.kind).toBe("dead");
		expect(member.vitalityIcon?.icon).toBe("fa-skull");
	});

	it("shows a resting icon when stabilized", () => {
		const actor = makeActor({ hp: { value: 0, max: 10 } });
		actor.type = "character";
		actor.system.attributes.death = { success: 3, failure: 0 };
		const member = buildPartyMember(partyToken({ id: "t1", actor }), cardOptions);

		expect(member.isStabilized).toBe(true);
		expect(member.vitalityIcon?.kind).toBe("stabilized");
		expect(member.vitalityIcon?.icon).toBe("fa-bed");
	});
});

describe("getPartyLayout", () => {
	beforeEach(() => installFoundry());

	it("builds members without a layout signature", () => {
		const layout = getPartyLayout([partyToken({ id: "t1" })], "t1");
		expect(layout.members).toHaveLength(1);
		expect(layout.memberIds).toEqual(["t1"]);
		expect(layout.signature).toBeUndefined();
	});
});

describe("party minimize", () => {
	it("toggles minimized state", async () => {
		installFoundry({ settings: { partyPlayerPrefs: {} } });
		const root = document.createElement("aside");
		root.id = "illusive-dnd-party-status";
		root.innerHTML = PARTY_STATUS_SHELL;
		document.body.appendChild(root);

		await togglePartyRailMinimized(root);
		expect(root.classList.contains("illusive-dnd-party-minimized")).toBe(true);
	});
});
