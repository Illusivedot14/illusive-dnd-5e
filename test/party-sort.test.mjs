import { describe, it, expect } from "vitest";
import { installFoundry } from "./helpers.mjs";
import { sortPartyTokens } from "../src/application/party-sort.mjs";

const OWNER = 3;

const tok = (id, name, actorOverrides = {}, tokenOverrides = {}) => {
	const actorId = actorOverrides.id ?? `a-${id}`;
	return {
		id,
		name,
		actorId,
		document: { actorId },
		actor: {
			id: actorId,
			name,
			type: "character",
			getUserLevel(user) {
				const ownership = this.ownership ?? {};
				if (typeof ownership[user.id] === "number") return ownership[user.id];
				return typeof ownership.default === "number" ? ownership.default : 0;
			},
			...actorOverrides
		},
		...tokenOverrides
	};
};

function visualNames(tokens) {
	return sortPartyTokens(tokens).map((t) => t.name);
}

describe("sortPartyTokens", () => {
	it("pins only the linked User Character, even when the player owns every PC", () => {
		installFoundry({ isGM: false });
		game.user.id = "user1";
		const bucky = tok("t2", "Bucky", {
			id: "actor-bucky",
			isOwner: true,
			ownership: { user1: OWNER }
		});
		game.user.character = bucky.actor;
		const tokens = [
			tok("t1", "Zara", { id: "a1", isOwner: true, ownership: { user1: OWNER } }),
			bucky,
			tok("t3", "Alan", { id: "a3", isOwner: true, ownership: { user1: OWNER } }),
			tok("t4", "Mirena", { id: "a4", isOwner: true, ownership: { user1: OWNER } }),
			tok("t5", "Pip", { id: "a5", isOwner: true, ownership: { user1: OWNER } })
		];
		expect(visualNames(tokens)).toEqual(["Bucky", "Alan", "Mirena", "Pip", "Zara"]);
	});

	it("pins linked character via token.actorId for synthetic token actors", () => {
		installFoundry({ isGM: false });
		game.user.id = "user1";
		const baseId = "actor-bucky";
		game.user.character = { id: baseId, type: "character", name: "Bucky" };
		const tokens = [
			tok("t1", "Zara", { id: "a1", isOwner: true, ownership: { user1: OWNER } }),
			tok(
				"t2",
				"Bucky",
				{ id: "synthetic-bucky", isOwner: true, ownership: { user1: OWNER } },
				{ actorId: baseId, document: { actorId: baseId } }
			),
			tok("t3", "Bob", { id: "a3", isOwner: true, ownership: { user1: OWNER } })
		];
		expect(visualNames(tokens)).toEqual(["Bucky", "Bob", "Zara"]);
	});

	it("falls back to a single explicitly-owned PC when no character is linked", () => {
		installFoundry({ isGM: false });
		game.user.id = "user1";
		game.user.character = null;
		const tokens = [
			tok("t1", "Zara", { ownership: {}, isOwner: false }),
			tok("t2", "Alan", { ownership: { user1: OWNER }, isOwner: true }),
			tok("t3", "Bob", { ownership: {}, isOwner: false })
		];
		expect(visualNames(tokens)).toEqual(["Alan", "Bob", "Zara"]);
	});

	it("sorts everyone A→Z when nothing is linked or uniquely owned", () => {
		installFoundry({ isGM: true });
		game.user.id = "gm1";
		game.user.character = null;
		const tokens = [
			tok("t1", "Zara", { isOwner: true, ownership: {} }),
			tok("t2", "Alan", { isOwner: true, ownership: {} }),
			tok("t3", "Bob", { isOwner: true, ownership: {} })
		];
		expect(visualNames(tokens)).toEqual(["Alan", "Bob", "Zara"]);
	});

	it("does not mutate the input array", () => {
		installFoundry({ isGM: false });
		game.user.id = "user1";
		const bucky = tok("t2", "Alan", { id: "a2", ownership: { user1: OWNER }, isOwner: true });
		game.user.character = bucky.actor;
		const tokens = [
			tok("t1", "Zara", { id: "a1", ownership: {}, isOwner: false }),
			bucky
		];
		sortPartyTokens(tokens);
		expect(tokens.map((t) => t.id)).toEqual(["t1", "t2"]);
	});
});
