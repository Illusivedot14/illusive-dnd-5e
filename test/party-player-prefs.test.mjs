import { describe, it, expect, beforeEach } from "vitest";
import { installFoundry, makeActor, makeToken } from "./helpers.mjs";
import {
	applyMyCardDisplayOverrides,
	getEffectivePartyRailLayout,
	getGmPartyDefaults,
	isMyPartyToken,
	isPartyRailMinimizedEffective,
	migrateStalePartyPlayerPrefs,
	readPartyPlayerPrefs,
	updatePartyPlayerPrefs
} from "../src/hud/lib/party-player-prefs.mjs";

function ownedPcToken(overrides = {}) {
	const actor = makeActor({ isOwner: true });
	actor.type = "character";
	return makeToken({ id: "t1", name: "Hero", actor, isOwner: true, ...overrides });
}

describe("party player prefs", () => {
	beforeEach(() => {
		installFoundry({
			settings: {
				partyOffsetX: 10,
				partyOffsetY: -5,
				partyScale: 110,
				partyPlayerPrefs: {}
			}
		});
	});

	it("reads GM defaults from world settings", () => {
		expect(getGmPartyDefaults()).toMatchObject({
			offsetX: 10,
			offsetY: -5,
			scale: 110
		});
	});

	it("merges rail overrides on top of GM defaults", async () => {
		await updatePartyPlayerPrefs({ rail: { offsetX: 40, scale: 90 } });
		expect(getEffectivePartyRailLayout()).toEqual({
			partyOffsetX: 40,
			partyOffsetY: -5,
			partyScale: 0.9
		});
	});

	it("stores minimized state per player", async () => {
		expect(isPartyRailMinimizedEffective()).toBe(false);
		await updatePartyPlayerPrefs({ rail: { minimized: true } });
		expect(isPartyRailMinimizedEffective()).toBe(true);
	});

	it("keeps portrait names off for the linked player character", () => {
		const token = ownedPcToken();
		game.user.character = token.actor;
		expect(isMyPartyToken(token)).toBe(true);
		expect(applyMyCardDisplayOverrides({ showName: true }, token)).toMatchObject({
			showName: false
		});
	});

	it("persists prefs in the client setting store", async () => {
		await updatePartyPlayerPrefs({ rail: { offsetY: 22 } });
		expect(readPartyPlayerPrefs().rail.offsetY).toBe(22);
	});

	it("drops legacy my-card fields on migration", async () => {
		await updatePartyPlayerPrefs({
			myCard: { hpDisplay: "gradient", style: "standard", showName: false, showCombatState: false }
		});
		await migrateStalePartyPlayerPrefs();
		expect(readPartyPlayerPrefs().myCard.hpDisplay).toBeUndefined();
		expect(readPartyPlayerPrefs().myCard.style).toBeUndefined();
		expect(readPartyPlayerPrefs().myCard.showName).toBeUndefined();
		expect(readPartyPlayerPrefs().myCard.showCombatState).toBeUndefined();
	});
});
