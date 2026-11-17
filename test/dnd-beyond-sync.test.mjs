import { describe, expect, it, vi } from "vitest";
import { installFoundry, makeActor } from "./helpers.mjs";
import { MessageDeduplicator } from "../src/dnd-beyond-sync/dedupe.mjs";
import { MessageDispatcher } from "../src/dnd-beyond-sync/dispatcher.mjs";
import { applyBeyondSheet as applySheetHitPoints } from "../src/dnd-beyond-sync/read.mjs";
import { characterIdOf, hitPointsFromSheet, hpFromRemoved, isHealthUpdate, messageKey } from "../src/dnd-beyond-sync/message.mjs";
import { syncHolderId } from "../src/dnd-beyond-sync/manager.mjs";
import {
  actorIdFor,
  characterIdForActor,
  linkConflicts,
  linkedCharacterIds,
  playerTokenChoices
} from "../src/dnd-beyond-sync/character-mapper.mjs";
import { gameLogUrl, missingConnectionFields } from "../src/dnd-beyond-sync/settings.mjs";
import { beyondDebug, beyondLogText, clearBeyondLog } from "../src/dnd-beyond-sync/debug.mjs";
import { noteFoundryHitPoints } from "../src/dnd-beyond-sync/foundry-hp.mjs";
import { BeyondSyncManager } from "../src/dnd-beyond-sync/manager.mjs";
import { writeTarget, pullRegisteredCharacters } from "../src/dnd-beyond-sync/index.mjs";
import { BeyondSocket } from "../src/dnd-beyond-sync/websocket.mjs";
import { RelayError, describeFetchFailure } from "../src/dnd-beyond-sync/fetch.mjs";
import { BEYOND_AUTH_URL, exchangeCobalt, writeBeyondCalls } from "../src/dnd-beyond-sync/beyond-api.mjs";
import { flushBeyondWrite, rememberView } from "../src/dnd-beyond-sync/writeback.mjs";
import { beyondState } from "../src/dnd-beyond-sync/state.mjs";

const LINK = "flags.illusive-dnd-5e.beyond";

const sheetUpdate = {
  eventType: "character-sheet/character-update/fulfilled",
  id: "msg-1",
  characterId: "103508287"
};

describe("dnd beyond sync", () => {
  it("builds the same message key the old socket used", () => {
    expect(characterIdOf(sheetUpdate)).toBe("103508287");
    expect(characterIdOf({ entityId: "149697907", eventType: sheetUpdate.eventType })).toBe("149697907");
    expect(messageKey(sheetUpdate)).toBe("103508287-character-sheet/character-update/fulfilled-msg-1");
    expect(isHealthUpdate(sheetUpdate.eventType)).toBe(true);
    expect(isHealthUpdate("dice/roll/fulfilled")).toBe(false);
  });

  it("gives the health socket to the active GM with the lowest id", () => {
    expect(syncHolderId([
      { id: "b", active: true, isGM: true },
      { id: "a", active: true, isGM: true },
      { id: "c", active: false, isGM: true },
      { id: "d", active: true, isGM: false }
    ])).toBe("a");
    expect(syncHolderId([])).toBeNull();
  });

  it("turns removed hit points into current hit points", () => {
    expect(hpFromRemoved(28, 0)).toBe(28);
    expect(hpFromRemoved(28, 6)).toBe(22);
    expect(hpFromRemoved(10, 40)).toBe(0);
  });

  it("drops a replay of the same game-log message", async () => {
    const manager = new BeyondSyncManager();
    const seen = [];
    manager.dispatcher = new MessageDispatcher();
    manager.dispatcher.register({
      canHandle: () => true,
      handle: (message) => seen.push(message.id)
    });
    await manager.handleMessage(sheetUpdate);
    await manager.handleMessage(sheetUpdate);
    expect(seen).toEqual(["msg-1"]);

    const dedupe = new MessageDeduplicator(1);
    dedupe.markProcessed("a");
    dedupe.markProcessed("b");
    expect(dedupe.isProcessed("a")).toBe(false);
    expect(dedupe.isProcessed("b")).toBe(true);
  });

  it("copies Beyond hit points, temporary hit points, and the max modifier", async () => {
    const actor = makeActor({
      id: "paladin",
      name: "KwakuRastaDin",
      hp: { value: 28, max: 28, temp: 0, tempmax: 4 }
    });
    actor.update = vi.fn(async () => {});
    installFoundry({ actors: [actor] });

    const result = await applySheetHitPoints({
      message: sheetUpdate,
      config: { updateDamage: true },
      mapping: { "103508287": "paladin" },
      actors: game.actors,
      fetchCharacter: async () => ({
        success: true,
        ddb: {
          character: {
            baseHitPoints: 30,
            bonusHitPoints: 2,
            overrideHitPoints: null,
            removedHitPoints: 6,
            temporaryHitPoints: 5
          }
        }
      })
    });

    expect(result).toMatchObject({ ok: true, value: 26, temp: 5, max: 30, tempmax: 2 });
    expect(actor.update).toHaveBeenCalledWith({
      "system.attributes.hp.value": 26,
      "system.attributes.hp.temp": 5,
      "system.attributes.hp.max": 30,
      "system.attributes.hp.tempmax": 2,
      [LINK]: { characterId: "103508287", campaignId: "", modified: null, pulledAt: null, reimport: [] }
    }, { illusiveBeyond: "read" });
    expect(hitPointsFromSheet({
      baseHitPoints: 30,
      bonusHitPoints: 8,
      overrideHitPoints: 40,
      removedHitPoints: 3,
      temporaryHitPoints: 7
    })).toEqual({ max: 40, tempmax: 0, value: 37, temp: 7, overridden: true });
    expect(hitPointsFromSheet({
      baseHitPoints: 48,
      bonusHitPoints: -6,
      overrideHitPoints: null,
      removedHitPoints: 0,
      temporaryHitPoints: 0,
      stats: [{ id: 3, value: 15 }],
      classes: [{ level: 9 }],
      choices: { feat: [{ componentId: 1789140 }] },
      modifiers: {
        race: [{ type: "bonus", subType: "hit-points-per-level", value: 1, isGranted: true }],
        feat: [
          { type: "bonus", subType: "hit-points-per-level", value: 2, isGranted: true },
          { type: "bonus", subType: "constitution-score", value: 1, isGranted: false, componentId: 1789140 }
        ]
      }
    })).toEqual({ max: 102, tempmax: -6, value: 96, temp: 0, overridden: false });
    expect(hitPointsFromSheet({
      baseHitPoints: 48,
      removedHitPoints: 3,
      stats: [{ id: 3, value: 16 }],
      classes: [{ level: 9 }],
      inventory: [
        { id: 1101168698, equipped: false, definition: { id: 5133, name: "Potion of Healing (Greater)" } },
        { id: 900149065, equipped: false, definition: { id: 8960641, name: "Potion of Healing" } }
      ],
      modifiers: {
        item: [
          { type: "bonus", subType: "hit-points", value: null, fixedValue: 4, isGranted: true, componentId: 5133, dice: { diceCount: 4, diceString: "4d4 + 4" } },
          { type: "bonus", subType: "hit-points", value: null, fixedValue: 2, isGranted: true, componentId: 8960641, dice: { diceCount: 2, diceString: "2d4 + 2" } }
        ]
      }
    })).toEqual({ max: 75, tempmax: 0, value: 72, temp: 0, overridden: false });
    expect(hitPointsFromSheet({
      baseHitPoints: 48,
      stats: [{ id: 3, value: 16 }],
      classes: [{ level: 9 }],
      inventory: [{ id: 1, equipped: true, isAttuned: true, definition: { id: 99 } }],
      modifiers: {
        item: [{ type: "bonus", subType: "hit-points", value: 5, isGranted: true, componentId: 99, requiresAttunement: true }]
      }
    })).toMatchObject({ max: 80 });
    expect(hpFromRemoved(28, 6)).toBe(22);
    expect(actorIdFor({ "103508287": "paladin" }, 103508287)).toBe("paladin");
  });

  it("names the fields a connection still needs", () => {
    expect(missingConnectionFields({
      cobaltCookie: "",
      userId: "",
      campaignId: "99"
    })).toEqual(["CobaltSession", "user id"]);
    expect(gameLogUrl(
      { campaignId: "99", userId: "7" },
      "token"
    )).toBe("wss://game-log-api-live.dndbeyond.com/v1?gameId=99&userId=7&stt=token");
  });

  it("lists player tokens and logs a Foundry hit point change", () => {
    const bucky = { id: "bucky", name: "Buckamillion (Bucky)", type: "character" };
    const tree = { id: "tree", name: "Tree", type: "npc" };
    expect(playerTokenChoices({
      tokens: [
        { actorId: "bucky", name: "Bucky", actor: bucky },
        { actorId: "tree", name: "Tree", actor: tree }
      ],
      actors: [bucky, tree, { id: "candi", name: "Candi", type: "character" }]
    })).toEqual([
      { id: "bucky", name: "Bucky" },
      { id: "candi", name: "Candi" }
    ]);
    expect(characterIdForActor({ "103508287": "bucky" }, "bucky")).toBe("103508287");

    const log = vi.fn();
    expect(noteFoundryHitPoints(bucky, { system: { attributes: { hp: { value: 22 } } } }, {
      enabled: true,
      mapping: { "103508287": "bucky" },
      log
    })).toMatchObject({ name: "Buckamillion (Bucky)", characterId: "103508287", value: 22 });
    expect(log).toHaveBeenCalledWith("foundry-hp", expect.objectContaining({ value: 22 }));

    expect(noteFoundryHitPoints(bucky, { system: { attributes: { hp: { value: 20 } } } }, {
      enabled: true,
      mapping: {},
      log
    })).toMatchObject({ reason: "not-linked" });
  });

  it("keeps a debug log and hides the cookie", () => {
    clearBeyondLog();
    beyondDebug("auth-rejected", { cobaltCookie: "super-secret", status: 401 });
    const text = beyondLogText();
    expect(text).toContain("auth-rejected");
    expect(text).toContain("***");
    expect(text).not.toContain("super-secret");

    clearBeyondLog();
    for (let i = 0; i < 85; i += 1) beyondDebug("tick", { i });
    expect(beyondLogText().split("\n")).toHaveLength(80);
    expect(beyondLogText()).not.toContain('"i":0');
    expect(beyondLogText()).toContain('"i":84');
  });

  it("gets the game-log token straight from D&D Beyond", async () => {
    const fetchImpl = vi.fn(async (url, options) => {
      expect(url).toBe(BEYOND_AUTH_URL);
      expect(options.headers.Cookie).toBe("CobaltSession=cookie");
      return { ok: true, status: 200, json: async () => ({ token: "session-token", ttl: 1800 }) };
    });
    const socket = new BeyondSocket(
      { cobaltCookie: "cookie", campaignId: "6846437", userId: "115120421" },
      { fetchImpl }
    );
    await expect(socket.fetchAccessToken()).resolves.toBe("session-token");
    expect(socket.tokenTtl).toBe(1800);
  });

  it("treats a null token as an expired cookie", async () => {
    const socket = new BeyondSocket(
      { cobaltCookie: "old", campaignId: "6846437", userId: "115120421" },
      { fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ token: null, ttl: 1800 }) }) }
    );
    const expired = vi.fn();
    socket.on("cookieExpired", expired);
    await expect(socket.fetchAccessToken()).resolves.toBe(null);
    expect(expired).toHaveBeenCalled();
  });

  it("names a relay failure", () => {
    expect(describeFetchFailure(new RelayError("socket closed", "wss://relay.test/"), BEYOND_AUTH_URL)).toEqual({
      reason: "relay-down",
      url: BEYOND_AUTH_URL,
      relay: "wss://relay.test/",
      detail: "The page could not reach D&D Beyond through the relay."
    });
    expect(describeFetchFailure(new Error("boom"), BEYOND_AUTH_URL)).toEqual({ reason: "boom", url: BEYOND_AUTH_URL });
  });

  it("exchanges a cobalt cookie for a token", async () => {
    const fetchImpl = vi.fn(async (_url, options) => {
      expect(options.headers.Cookie).toBe("CobaltSession=cookie-value");
      return { status: 200, ok: true, json: async () => ({ token: "jwt", ttl: 300 }) };
    });
    await expect(exchangeCobalt("cookie-value", fetchImpl)).resolves.toMatchObject({ token: "jwt", ttl: 300 });
  });

  it("leaves the maximum to dnd5e on an actor with a class item", async () => {
    const actor = makeActor({
      id: "balrus",
      name: "Balrus",
      hp: { value: 96, max: 102, temp: 0, tempmax: -6 },
      items: [{ id: "fighter", type: "class" }],
      flags: { "illusive-dnd-5e": { beyond: { characterId: "149697907", modified: "old" } } }
    });
    actor._source = { system: { attributes: { hp: { value: 96, max: 102, temp: 0, tempmax: -6 } } } };
    actor.update = vi.fn(async () => {});
    installFoundry({ actors: [actor] });
    const sheet = {
      baseHitPoints: 102,
      bonusHitPoints: -6,
      overrideHitPoints: null,
      removedHitPoints: 10,
      temporaryHitPoints: 0,
      dateModified: "2026-11-15T03:30:28.021Z"
    };
    const result = await applySheetHitPoints({
      message: { ...sheetUpdate, characterId: "149697907" },
      config: { updateDamage: true, campaignId: "6846437" },
      mapping: { "149697907": "balrus" },
      actors: game.actors,
      fetchCharacter: async () => ({ success: true, ddb: { character: sheet } }),
      now: 5
    });
    expect(result).toMatchObject({ ok: true, value: 86, max: 102, tempmax: -6 });
    expect(actor.update).toHaveBeenCalledWith({
      "system.attributes.hp.value": 86,
      "system.attributes.hp.max": null,
      [LINK]: { characterId: "149697907", campaignId: "6846437", modified: sheet.dateModified, pulledAt: 5, reimport: [] }
    }, { illusiveBeyond: "read" });

    actor._source.system.attributes.hp = { value: 86, max: null, temp: 0, tempmax: -6 };
    actor.flags["illusive-dnd-5e"].beyond.modified = sheet.dateModified;
    actor.update.mockClear();
    await expect(applySheetHitPoints({
      message: { ...sheetUpdate, characterId: "149697907" },
      config: { updateDamage: true },
      mapping: { "149697907": "balrus" },
      actors: game.actors,
      fetchCharacter: async () => ({ success: true, ddb: { character: sheet } })
    })).resolves.toMatchObject({ ok: true, unchanged: true });
    expect(actor.update).not.toHaveBeenCalled();
  });

  it("names a link that clashes with one already made", () => {
    const mapping = { "150019122": "stumps", "149697907": "balrus" };
    expect(linkedCharacterIds({ "149697907": "bucky", "": "skip", "103508287": "" })).toEqual(["149697907"]);
    expect(linkConflicts(mapping, "150019122", "stumps")).toEqual([]);
    expect(linkConflicts(mapping, "150019122", "tree")).toEqual([{ kind: "character", actorId: "stumps" }]);
    expect(linkConflicts(mapping, "999", "balrus")).toEqual([{ kind: "actor", characterId: "149697907" }]);
  });

  it("turns a Foundry hit point change into the Beyond fields that changed", async () => {
    const linked = { enabled: true, holding: true, updateDamage: true, mapping: { "149697907": "balrus" } };
    expect(writeTarget({ id: "balrus" }, {}, linked)).toBe("149697907");
    expect(writeTarget({ id: "balrus" }, { illusiveBeyond: "read" }, linked)).toBeNull();
    expect(writeTarget({ id: "balrus" }, {}, { ...linked, holding: false })).toBeNull();
    expect(writeTarget({ id: "candi" }, {}, linked)).toBeNull();

    const actor = { name: "Balrus", items: [], system: { attributes: { hp: { value: 80, temp: 0, tempmax: -6 } } } };
    const log = vi.fn();
    await expect(flushBeyondWrite(actor, "1", { config: {}, send: vi.fn(), log }))
      .resolves.toMatchObject({ ok: false, reason: "no-read-yet" });
    rememberView("149697907", beyondState({ baseHitPoints: 102, bonusHitPoints: -6, removedHitPoints: 0 }), {});
    const send = vi.fn(async () => ({ success: true, done: 1 }));
    await expect(flushBeyondWrite(actor, "149697907", { config: {}, send, log }))
      .resolves.toMatchObject({ ok: true, sent: ["life/hp/damage-taken"] });
    expect(send).toHaveBeenCalledWith("149697907", [
      { method: "PUT", path: "life/hp/damage-taken", body: { removedHitPoints: 16, temporaryHitPoints: 0 } }
    ], {});
    await expect(flushBeyondWrite(actor, "149697907", { config: {}, send, log }))
      .resolves.toMatchObject({ ok: true, unchanged: true });
    expect(send).toHaveBeenCalledTimes(1);

    actor.system.attributes.hp = { value: 70, temp: 3, tempmax: 0 };
    const partial = vi.fn(async () => ({ success: false, done: 1, reason: "PUT life/hp/bonus", status: 400 }));
    await expect(flushBeyondWrite(actor, "149697907", { config: {}, send: partial, log }))
      .resolves.toMatchObject({ ok: false, sent: ["life/hp/damage-taken"], failed: "life/hp/bonus" });
    const retry = vi.fn(async () => ({ success: true, done: 1 }));
    await flushBeyondWrite(actor, "149697907", { config: {}, send: retry, log });
    expect(retry.mock.calls[0][1]).toEqual([{ method: "PUT", path: "life/hp/bonus", body: { bonusHitPoints: 0 } }]);
  });

  it("sends calls the way the D&D Beyond sheet does and refuses other routes", async () => {
    const calls = [];
    const fetchImpl = vi.fn(async (url, options) => {
      if (url.includes("cobalt-token")) return { status: 200, ok: true, json: async () => ({ token: "jwt" }) };
      calls.push({ url, method: options.method, body: JSON.parse(options.body), auth: options.headers.Authorization });
      return { status: url.endsWith("attuned") ? 400 : 200, ok: !url.endsWith("attuned") };
    });
    await expect(writeBeyondCalls("cookie", {
      characterId: "149697907",
      calls: [
        { method: "PUT", path: "life/hp/damage-taken", body: { removedHitPoints: 16, temporaryHitPoints: 0 } },
        { method: "DELETE", path: "condition", body: { id: 12 } }
      ]
    }, fetchImpl)).resolves.toEqual({ success: true, done: 2 });
    expect(calls).toEqual([
      {
        url: "https://character-service.dndbeyond.com/character/v5/life/hp/damage-taken",
        method: "PUT",
        body: { characterId: 149697907, removedHitPoints: 16, temporaryHitPoints: 0 },
        auth: "Bearer jwt"
      },
      {
        url: "https://character-service.dndbeyond.com/character/v5/condition",
        method: "DELETE",
        body: { characterId: 149697907, id: 12 },
        auth: "Bearer jwt"
      }
    ]);
    await expect(writeBeyondCalls("cookie", {
      characterId: "149697907",
      calls: [
        { method: "PUT", path: "character/inspiration", body: { inspiration: true } },
        { method: "PUT", path: "inventory/item/attuned", body: { id: 5, value: true } },
        { method: "PUT", path: "life/death-saves", body: { failCount: 0, successCount: 0 } }
      ]
    }, fetchImpl)).resolves.toEqual({ success: false, reason: "PUT inventory/item/attuned", status: 400, done: 1 });
    await expect(writeBeyondCalls("cookie", { characterId: "149697907", calls: [{ method: "DELETE", path: "character" }] }, fetchImpl))
      .resolves.toMatchObject({ success: false, reason: "route", done: 0 });
    await expect(writeBeyondCalls("cookie", { characterId: "149697907" }, fetchImpl))
      .resolves.toEqual({ success: false, reason: "empty", done: 0 });
  });

  it("copies each added character when the world opens", async () => {
    const actor = makeActor({
      id: "balrus",
      name: "Balrus",
      hp: { value: 40, max: 46, temp: 0, tempmax: 0 }
    });
    actor.update = vi.fn(async () => {});
    installFoundry({ actors: [actor] });
    const results = await pullRegisteredCharacters({
      config: { enabled: true, updateDamage: true },
      mapping: { "149697907": "balrus" },
      actors: game.actors,
      fetchCharacter: async () => ({
        success: true,
        ddb: {
          character: {
            baseHitPoints: 40,
            bonusHitPoints: null,
            overrideHitPoints: null,
            removedHitPoints: 6,
            temporaryHitPoints: 0
          }
        }
      })
    });
    expect(results[0]).toMatchObject({ characterId: "149697907", ok: true, value: 34, max: 40 });
    expect(actor.update).toHaveBeenCalledWith({
      "system.attributes.hp.value": 34,
      "system.attributes.hp.max": 40,
      [LINK]: { characterId: "149697907", campaignId: "", modified: null, pulledAt: null, reimport: [] }
    }, { illusiveBeyond: "read" });
  });
});
