import { describe, it, expect, vi } from "vitest";
import { installFoundry, makeActor, makeCollection } from "./helpers.mjs";
import {
  bindDdbPullSocket,
  canPullActorFromDdb,
  pullActorFromDdb,
  readDdbCharacterId
} from "../src/foundry/ddb-pull.mjs";

function linkedActor(overrides = {}) {
  return makeActor({
    isOwner: true,
    flags: { ddbimporter: { dndbeyond: { characterId: "12345" } } },
    ...overrides
  });
}

function enableImporter(importCharacter = vi.fn(async () => true)) {
  globalThis.game.modules = { get: () => ({ active: true, api: { importCharacter } }) };
  return importCharacter;
}

describe("ddb pull", () => {
  it("reads the Beyond id from the importer flag", () => {
    installFoundry();
    expect(readDdbCharacterId(linkedActor())).toBe("12345");
    expect(readDdbCharacterId(makeActor())).toBeNull();
  });

  it("reads flags even when getFlag rejects the importer namespace", () => {
    installFoundry();
    enableImporter();
    const actor = linkedActor();
    actor.getFlag = () => {
      throw new Error('Flag scope "ddbimporter" is not valid or not currently active');
    };
    expect(readDdbCharacterId(actor)).toBe("12345");
    expect(canPullActorFromDdb(actor)).toBe(true);
  });

  it("is off when the importer is missing or the actor is not linked", () => {
    installFoundry();
    globalThis.game.modules = { get: () => ({ active: false }) };
    expect(canPullActorFromDdb(linkedActor())).toBe(false);

    installFoundry();
    enableImporter();
    expect(canPullActorFromDdb(makeActor({ isOwner: true }))).toBe(false);
  });

  it("lets a GM pull through ddb-importer.importCharacter", async () => {
    const importCharacter = vi.fn(async () => true);
    installFoundry({ isGM: true });
    enableImporter(importCharacter);
    const actor = linkedActor();
    await expect(pullActorFromDdb(actor)).resolves.toEqual({ ok: true });
    expect(importCharacter).toHaveBeenCalledWith({ actor });
  });

  it("does not throw when the importer fails", async () => {
    installFoundry({ isGM: true });
    enableImporter(vi.fn(async () => { throw new Error("Forbidden"); }));
    await expect(pullActorFromDdb(linkedActor())).resolves.toEqual({ ok: false, reason: "failed" });
  });

  it("does not let a player import locally", async () => {
    const importCharacter = vi.fn(async () => true);
    installFoundry();
    enableImporter(importCharacter);
    globalThis.game.users = makeCollection([{ id: "user1", isGM: false, active: true }]);
    await expect(pullActorFromDdb(linkedActor())).resolves.toEqual({ ok: false, reason: "noGm" });
    expect(importCharacter).not.toHaveBeenCalled();
  });

  it("asks a connected GM to pull for a player", async () => {
    const importCharacter = vi.fn(async () => true);
    const actor = linkedActor({ id: "actor1" });
    actor.testUserPermission = (user) => user.id === "user1";
    installFoundry({ actors: [actor] });
    enableImporter(importCharacter);
    globalThis.game.users = makeCollection([
      { id: "gm1", isGM: true, active: true },
      { id: "user1", isGM: false, active: true }
    ]);

    let onMessage;
    globalThis.game.socket = {
      on: (_event, fn) => { onMessage = fn; },
      emit: vi.fn()
    };
    bindDdbPullSocket();
    globalThis.game.socket.emit.mockImplementation(async (_event, data) => {
      if (data.reply) {
        globalThis.game.user = { id: "user1", isGM: false };
        await onMessage(data);
        return;
      }
      globalThis.game.user = { id: "gm1", isGM: true };
      await onMessage(data);
    });

    await expect(pullActorFromDdb(actor)).resolves.toEqual({ ok: true });
    expect(importCharacter).toHaveBeenCalledWith({ actor });
  });
});
