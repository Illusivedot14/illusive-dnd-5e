import { afterEach, describe, expect, it, vi } from "vitest";
import { installFoundry } from "./helpers.mjs";
import { rollDataFromBeyond, rollFlavor, showBeyondRoll, isRollFulfilled } from "../src/dnd-beyond-sync/roll.mjs";
import { BeyondSocket } from "../src/dnd-beyond-sync/websocket.mjs";

afterEach(() => {
  delete globalThis.ChatMessage;
});

const advantageAttack = {
  diceNotation: {
    constant: 5,
    set: [
      { count: 2, dieType: "d20", operation: 2, dice: [{ dieType: "d20", dieValue: 7 }, { dieType: "d20", dieValue: 16 }] },
      { count: 1, dieType: "d4", operation: 0, dice: [{ dieType: "d4", dieValue: 3 }] }
    ]
  },
  diceNotationStr: "2d20kh1+1d4+5",
  rollKind: "advantage",
  rollType: "to hit",
  result: { constant: 5, text: "(7,16)+3+5", total: 24, values: [7, 16, 3] }
};

function fakeRoll() {
  return { fromData: vi.fn((data) => ({ formula: data.formula, total: data.total, data })) };
}

describe("dnd beyond game-log rolls", () => {
  it("rebuilds Beyond's dice as Foundry roll data", () => {
    expect(rollDataFromBeyond(advantageAttack)).toEqual({
      class: "Roll",
      formula: "2d20kh1 + 1d4 + 5",
      terms: [
        {
          class: "Die",
          number: 2,
          faces: 20,
          modifiers: ["kh1"],
          results: [{ result: 7, active: false, discarded: true }, { result: 16, active: true }],
          evaluated: true
        },
        { class: "OperatorTerm", operator: "+", evaluated: true },
        { class: "Die", number: 1, faces: 4, modifiers: [], results: [{ result: 3, active: true }], evaluated: true },
        { class: "OperatorTerm", operator: "+", evaluated: true },
        { class: "NumericTerm", number: 5, evaluated: true }
      ],
      total: 24,
      evaluated: true
    });
  });

  it("keeps the lowest die on disadvantage and handles a negative modifier", () => {
    const data = rollDataFromBeyond({
      diceNotation: { constant: -1, set: [{ count: 2, dieType: "d20", operation: 1, dice: [{ dieValue: 12 }, { dieValue: 4 }] }] },
      result: { total: 3 }
    });
    expect(data.formula).toBe("2d20kl1 - 1");
    expect(data.terms[0].results).toEqual([{ result: 12, active: false, discarded: true }, { result: 4, active: true }]);
    expect(data.total).toBe(3);
    expect(rollDataFromBeyond({ ...advantageAttack, result: undefined }).total).toBe(24);
    expect(rollDataFromBeyond({ diceNotation: { constant: 0, set: [] } })).toBe(null);
  });

  it("names the roll like the game log", () => {
    expect(rollFlavor({ action: "Longsword", rolls: [advantageAttack] })).toBe("Longsword: To hit (advantage)");
    expect(rollFlavor({ action: "Stealth", rolls: [{ rollType: "check", rollKind: "" }] })).toBe("Stealth: Check");
    expect(rollFlavor({ action: "", rolls: [{ rollType: "roll" }] })).toBe("D&D Beyond roll");
  });

  it("posts a chat message as the linked actor with Beyond's results", async () => {
    installFoundry({ settings: {} });
    const actor = { id: "balrus", name: "Balrus" };
    globalThis.ChatMessage = { getSpeaker: vi.fn(({ actor: who }) => ({ actor: who.id, alias: who.name })) };
    const createMessage = vi.fn(async () => {});
    const result = await showBeyondRoll({
      message: { eventType: "dice/roll/fulfilled", characterId: "172287274", action: "Longsword", rollId: "r1", rolls: [advantageAttack], messageScope: "gameId" },
      enabled: true,
      mapping: { "172287274": "balrus" },
      actors: new Map([["balrus", actor]]),
      RollClass: fakeRoll(),
      createMessage
    });
    expect(result).toMatchObject({ ok: true, actor: "Balrus", formulas: ["2d20kh1 + 1d4 + 5"], totals: [24], private: false });
    const data = createMessage.mock.calls[0][0];
    expect(data.speaker).toEqual({ actor: "balrus", alias: "Balrus" });
    expect(data.flavor).toBe("Longsword: To hit (advantage)");
    expect(data.rolls).toHaveLength(1);
    expect(data.whisper).toBeUndefined();
  });

  it("posts a sheet roll in public chat so every client can throw it", async () => {
    installFoundry({ settings: {} });
    globalThis.ChatMessage = { getSpeaker: vi.fn(), getWhisperRecipients: vi.fn(() => [{ id: "gm1" }]) };
    const createMessage = vi.fn(async () => ({ id: "m1" }));
    const result = await showBeyondRoll({
      message: { eventType: "dice/roll/fulfilled", characterId: "9", context: { name: "Mira" }, rolls: [advantageAttack], messageScope: "userId" },
      enabled: true,
      mapping: {},
      actors: new Map(),
      RollClass: fakeRoll(),
      createMessage
    });
    const data = createMessage.mock.calls[0][0];
    expect(result.private).toBe(false);
    expect(data.speaker).toEqual({ alias: "Mira" });
    expect(data.whisper).toBeUndefined();
    expect(data.flags["dice-so-nice"]).toBeUndefined();
    expect(data.sound).toBeUndefined();
    expect(data.rolls).toHaveLength(1);
  });

  it("does nothing when turned off", async () => {
    const createMessage = vi.fn();
    await expect(showBeyondRoll({ message: { rolls: [advantageAttack] }, enabled: false, createMessage }))
      .resolves.toMatchObject({ ok: false, reason: "disabled" });
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("forwards finished rolls from the game log with their scope", async () => {
    installFoundry({ settings: {} });
    let ws = null;
    const socket = new BeyondSocket({ cobaltCookie: "c", campaignId: "1", userId: "2" }, {
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ token: "t", ttl: 1800 }) }),
      socketImpl: class { constructor() { ws = this; } }
    });
    const seen = [];
    socket.on("message", (detail) => seen.push(detail));
    await socket.connect();
    ws.onmessage({ data: JSON.stringify({ eventType: "dice/roll/pending", data: { rollId: "r1" } }) });
    ws.onmessage({
      data: JSON.stringify({
        eventType: "dice/roll/fulfilled",
        entityId: "172287274",
        entityType: "character",
        messageScope: "gameId",
        data: { action: "Longsword", rollId: "r1", rolls: [advantageAttack] }
      })
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ eventType: "dice/roll/fulfilled", id: "r1", characterId: "172287274", messageScope: "gameId", action: "Longsword" });
    expect(isRollFulfilled(seen[0])).toBe(true);
  });
});
