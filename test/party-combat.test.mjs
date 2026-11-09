import { describe, it, expect, beforeEach } from "vitest";
import { installFoundry, makeActor, makeCombat, makeCombatant, makeToken } from "./helpers.mjs";
import { isPartyDeathSaving, isPartyDefeated, isPartyStabilized, getDeathSaves } from "../src/application/party-combat.mjs";
import { buildPartyMember } from "../src/hud/components/party-status/party-status-layout.mjs";

describe("isPartyDeathSaving", () => {
	beforeEach(() => installFoundry());

	it("is true at 0 HP when not defeated", () => {
		const actor = makeActor({ hp: { value: 0, max: 20 } });
		actor.type = "character";
		const token = makeToken({ id: "t1", actor });
		const combat = makeCombat({
			started: true,
			combatants: [makeCombatant({ tokenId: "t1", defeated: false })]
		});
		installFoundry({ combat });

		expect(isPartyDeathSaving(token)).toBe(true);
	});

	it("is false when defeated", () => {
		const actor = makeActor({ hp: { value: 0, max: 20 } });
		const token = makeToken({ id: "t1", actor });
		const combat = makeCombat({
			started: true,
			combatants: [makeCombatant({ tokenId: "t1", defeated: true })]
		});
		installFoundry({ combat });

		expect(isPartyDeathSaving(token)).toBe(false);
	});

	it("is false above 0 HP", () => {
		const actor = makeActor({ hp: { value: 5, max: 20 } });
		const token = makeToken({ id: "t1", actor });
		expect(isPartyDeathSaving(token)).toBe(false);
	});

	it("is false after three failures", () => {
		const actor = makeActor({ hp: { value: 0, max: 20 } });
		actor.system.attributes.death = { success: 0, failure: 3 };
		const token = makeToken({ id: "t1", actor });
		expect(isPartyDeathSaving(token)).toBe(false);
		expect(isPartyDefeated(token)).toBe(true);
	});

	it("is false after three successes (stabilized)", () => {
		const actor = makeActor({ hp: { value: 0, max: 20 } });
		actor.system.attributes.death = { success: 3, failure: 0 };
		const token = makeToken({ id: "t1", actor });
		expect(isPartyDeathSaving(token)).toBe(false);
		expect(isPartyStabilized(token)).toBe(true);
	});

	it("is false when stable flag is set after dnd5e clears counters", () => {
		const actor = makeActor({
			hp: { value: 0, max: 20 },
			flags: { "illusive-dnd-5e": { stable: true } }
		});
		actor.system.attributes.death = { success: 0, failure: 0 };
		const token = makeToken({ id: "t1", actor });
		expect(isPartyDeathSaving(token)).toBe(false);
		expect(isPartyStabilized(token)).toBe(true);
	});
});

describe("isPartyStabilized", () => {
	beforeEach(() => installFoundry());

	it("is true at 0 HP with three successes", () => {
		const actor = makeActor({ hp: { value: 0, max: 20 } });
		actor.system.attributes.death = { success: 3, failure: 0 };
		const token = makeToken({ id: "t1", actor });
		expect(isPartyStabilized(token)).toBe(true);
	});

	it("is true at 0 HP with cleared counters and stable flag", () => {
		const actor = makeActor({
			hp: { value: 0, max: 20 },
			flags: { "illusive-dnd-5e": { stable: true } }
		});
		actor.system.attributes.death = { success: 0, failure: 0 };
		const token = makeToken({ id: "t1", actor });
		expect(isPartyStabilized(token)).toBe(true);
	});

	it("is false when death saves restart after stable", () => {
		const actor = makeActor({
			hp: { value: 0, max: 20 },
			flags: { "illusive-dnd-5e": { stable: true } }
		});
		actor.system.attributes.death = { success: 0, failure: 1 };
		const token = makeToken({ id: "t1", actor });
		expect(isPartyStabilized(token)).toBe(false);
		expect(isPartyDeathSaving(token)).toBe(true);
	});

	it("is false while still rolling death saves", () => {
		const actor = makeActor({ hp: { value: 0, max: 20 } });
		actor.system.attributes.death = { success: 2, failure: 1 };
		const token = makeToken({ id: "t1", actor });
		expect(isPartyStabilized(token)).toBe(false);
	});

	it("is false when defeated", () => {
		const actor = makeActor({ hp: { value: 0, max: 20 } });
		actor.system.attributes.death = { success: 3, failure: 3 };
		const token = makeToken({ id: "t1", actor });
		const combat = makeCombat({
			started: true,
			combatants: [makeCombatant({ tokenId: "t1", defeated: true })]
		});
		installFoundry({ combat });
		expect(isPartyStabilized(token)).toBe(false);
	});
});

describe("isPartyDefeated", () => {
	beforeEach(() => installFoundry());

	it("is true when the combatant is marked defeated", () => {
		const actor = makeActor({ hp: { value: 0, max: 20 } });
		const token = makeToken({ id: "t1", actor });
		const combat = makeCombat({
			started: true,
			combatants: [makeCombatant({ tokenId: "t1", defeated: true })]
		});
		installFoundry({ combat });
		expect(isPartyDefeated(token)).toBe(true);
	});

	it("is true at three death save failures", () => {
		const actor = makeActor({ hp: { value: 0, max: 20 } });
		actor.system.attributes.death = { success: 1, failure: 3 };
		const token = makeToken({ id: "t1", actor });
		expect(isPartyDefeated(token)).toBe(true);
	});
});

describe("buildPartyMember vitality", () => {
	const options = {
		showCombatState: false,
		inCombat: false,
		showName: true
	};

	it("shows a skull when defeated, not while death saving", () => {
		installFoundry();
		const actor = makeActor({ hp: { value: 0, max: 20 } });
		actor.type = "character";
		const token = makeToken({ id: "t1", actor });
		const combat = makeCombat({
			started: true,
			combatants: [makeCombatant({ tokenId: "t1", defeated: true })]
		});
		installFoundry({ combat });

		const member = buildPartyMember(token, { ...options, inCombat: true });

		expect(member.isDowned).toBe(true);
		expect(member.isDefeated).toBe(true);
		expect(member.isDeathSaving).toBe(false);
		expect(member.vitalityIcon?.kind).toBe("dead");
		expect(member.vitalityIcon?.icon).toBe("fa-skull");
	});

	it("shows an unconscious icon while death saving", () => {
		installFoundry();
		const actor = makeActor({ hp: { value: 0, max: 20 } });
		actor.type = "character";
		actor.system.attributes.death = { success: 2, failure: 1 };
		const token = makeToken({ id: "t1", actor });

		const member = buildPartyMember(token, options);

		expect(member.isDeathSaving).toBe(true);
		expect(member.vitalityIcon?.kind).toBe("unconscious");
		expect(member.vitalityIcon?.icon).toBe("fa-dizzy");
		expect(member.vitalityHidden).toBe(true);
	});

	it("shows a resting icon when stabilized", () => {
		installFoundry();
		const actor = makeActor({ hp: { value: 0, max: 20 } });
		actor.type = "character";
		actor.system.attributes.death = { success: 3, failure: 0 };
		const token = makeToken({ id: "t1", actor });

		const member = buildPartyMember(token, options);

		expect(member.isStabilized).toBe(true);
		expect(member.isDeathSaving).toBe(false);
		expect(member.vitalityIcon?.kind).toBe("stabilized");
		expect(member.vitalityIcon?.icon).toBe("fa-bed");
	});
});

describe("getDeathSaves", () => {
	it("returns null above 0 HP", () => {
		const actor = makeActor({ hp: { value: 5, max: 20 } });
		expect(getDeathSaves(actor)).toBeNull();
	});

	it("reads success and failure counts at 0 HP", () => {
		const actor = makeActor({ hp: { value: 0, max: 20 } });
		actor.system.attributes.death = { success: 1, failure: 2 };
		expect(getDeathSaves(actor)).toEqual({ success: 1, failure: 2 });
	});
});
