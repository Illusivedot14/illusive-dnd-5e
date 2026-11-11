import { describe, it, expect, vi, beforeEach } from "vitest";
import { installFoundry } from "./helpers.mjs";
import { rollVisible, rollAsOwner, bindOwnerRolls } from "../src/application/dice.mjs";

class FakeRoll {
  constructor(formula, data) {
    this.formula = formula;
    this.data = data;
    this.dice = /d\d/.test(formula) ? [{ faces: 6 }] : [];
  }
  async evaluate() {
    this.total = 4;
    return this;
  }
  toMessage = vi.fn(async () => ({}));
  static fromData(data) {
    return Object.assign(new FakeRoll(data.formula), { total: data.total });
  }
}

function playerOwnedActor() {
  return {
    uuid: "Actor.pc",
    testUserPermission: (u) => u.id === "player2",
    rollSavingThrow: vi.fn(async () => [{ total: 7 }])
  };
}

describe("dice", () => {
  beforeEach(() => {
    installFoundry();
    globalThis.Roll = FakeRoll;
    globalThis.ChatMessage = { getSpeaker: ({ actor }) => ({ actor: actor.uuid }) };
  });

  it("posts dice rolls to chat with the actor as speaker", async () => {
    const actor = { uuid: "Actor.a", getRollData: () => ({}) };
    const roll = await rollVisible("1d8", { actor, flavor: "Colossus Slayer" });
    expect(roll.total).toBe(4);
    expect(roll.toMessage).toHaveBeenCalledWith({ speaker: { actor: "Actor.a" }, flavor: "Colossus Slayer" });
  });

  it("does not post flat numbers", async () => {
    const roll = await rollVisible("3", { data: {} });
    expect(roll.toMessage).not.toHaveBeenCalled();
  });

  it("rolls a save on the owning player's client", async () => {
    globalThis.game.settings._store.set("playerSaveRolls", { player2: "automated" });
    const query = vi.fn(async () => ({ formula: "1d20+2", total: 15 }));
    globalThis.game.users = [{ id: "player2", active: true, isGM: false, query }];
    const actor = playerOwnedActor();

    const roll = await rollAsOwner(actor, "save", { ability: "dex", target: 14, event: {} });

    expect(roll.total).toBe(15);
    expect(actor.rollSavingThrow).not.toHaveBeenCalled();
    const [name, data] = query.mock.calls[0];
    expect(name).toBe("illusive-dnd-5e.ownerRoll");
    expect(data).toEqual({ actorUuid: "Actor.pc", kind: "save", config: { ability: "dex", target: 14 } });
  });

  it("rolls here when the owner does not answer", async () => {
    globalThis.game.settings._store.set("playerSaveRolls", { player2: "automated" });
    const query = vi.fn(async () => { throw new Error("timeout"); });
    globalThis.game.users = [{ id: "player2", active: true, isGM: false, query }];
    const actor = playerOwnedActor();

    const roll = await rollAsOwner(actor, "save", { ability: "dex", target: 14 });

    expect(roll.total).toBe(7);
    expect(actor.rollSavingThrow).toHaveBeenCalledWith({ ability: "dex", target: 14 }, { configure: false }, {});
  });

  it("rolls here when this client owns the creature", async () => {
    globalThis.game.users = [];
    const actor = playerOwnedActor();
    const roll = await rollAsOwner(actor, "save", { ability: "con", target: 10 });
    expect(roll.total).toBe(7);
  });

  it("asks the GM whether a physical player save passed", async () => {
    globalThis.game.user.isGM = true;
    globalThis.game.users = [{ id: "player2", active: true, isGM: false }];
    const wait = vi.fn(async () => true);
    globalThis.foundry.applications.api.DialogV2.wait = wait;
    const actor = { ...playerOwnedActor(), name: "Hero" };
    const roll = await rollAsOwner(actor, "save", { ability: "dex", target: 15 });
    expect(actor.rollSavingThrow).not.toHaveBeenCalled();
    expect(wait).toHaveBeenCalledOnce();
    expect(roll).toMatchObject({ physical: true, success: true, total: 15 });
  });

  it("counts a closed physical-save prompt as a failure", async () => {
    globalThis.game.user.isGM = true;
    globalThis.game.users = [{ id: "player2", active: true, isGM: false }];
    globalThis.foundry.applications.api.DialogV2.wait = vi.fn(async () => null);
    const actor = playerOwnedActor();
    const roll = await rollAsOwner(actor, "save", { ability: "wis", target: 13 });
    expect(actor.rollSavingThrow).not.toHaveBeenCalled();
    expect(roll).toMatchObject({ physical: true, success: false, total: 12 });
  });

  it("asks the GM from a player's client", async () => {
    const query = vi.fn(async () => true);
    const gm = { id: "gm", active: true, isGM: true, isSelf: false, query };
    globalThis.game.users = [{ id: "player2", active: true, isGM: false }, gm];
    globalThis.game.users.activeGM = gm;
    const actor = playerOwnedActor();
    const roll = await rollAsOwner(actor, "save", { ability: "con", target: 10 });
    expect(actor.rollSavingThrow).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith(
      "illusive-dnd-5e.physicalSave",
      expect.objectContaining({ ability: "con", dc: 10 }),
      { timeout: 60000 }
    );
    expect(roll).toMatchObject({ physical: true, success: true, total: 10 });
  });

  it("rolls NPC saves on the GM without a dialog", async () => {
    globalThis.game.user.isGM = true;
    globalThis.game.users = [];
    const actor = { ...playerOwnedActor(), isOwner: true };
    await rollAsOwner(actor, "save", { ability: "dex", target: 12 });
    expect(actor.rollSavingThrow).toHaveBeenCalledWith({ ability: "dex", target: 12 }, { configure: false }, {});
  });

  it("rolls a player's save immediately when player saves are automated", async () => {
    globalThis.game.users = [];
    globalThis.game.settings._store.set("playerSaveRolls", { user1: "automated" });
    const actor = { ...playerOwnedActor(), isOwner: true };
    await rollAsOwner(actor, "save", { ability: "wis", target: 13 });
    expect(actor.rollSavingThrow).toHaveBeenCalledWith({ ability: "wis", target: 13 }, { configure: false }, {});
  });

  it("keeps each player's save setting separate", async () => {
    globalThis.game.users = [
      { id: "player2", active: true, isGM: false },
      { id: "player3", active: true, isGM: false }
    ];
    globalThis.game.settings._store.set("playerSaveRolls", {
      player2: "manual",
      player3: "automated"
    });
    const manual = playerOwnedActor();
    const automated = {
      uuid: "Actor.other",
      testUserPermission: (user) => user.id === "player3",
      rollSavingThrow: vi.fn(async () => [{ total: 16 }])
    };
    await rollAsOwner(manual, "save", { ability: "wis", target: 13 });
    await rollAsOwner(automated, "save", { ability: "dex", target: 12 });
    expect(manual.rollSavingThrow).toHaveBeenCalledWith({ ability: "wis", target: 13 }, { configure: true }, {});
    expect(automated.rollSavingThrow).toHaveBeenCalledWith({ ability: "dex", target: 12 }, { configure: false }, {});
  });

  it("shows a player the roll dialog when player saves are manual", async () => {
    globalThis.game.users = [];
    globalThis.game.settings._store.set("playerSaveRolls", { user1: "manual" });
    const actor = { ...playerOwnedActor(), isOwner: true };
    await rollAsOwner(actor, "save", { ability: "wis", target: 13 });
    expect(actor.rollSavingThrow).toHaveBeenCalledWith({ ability: "wis", target: 13 }, { configure: true }, {});
  });

  it("asks the GM for an NPC save when GM saves are physical", async () => {
    globalThis.game.user.isGM = true;
    globalThis.game.users = [];
    globalThis.game.settings._store.set("gmSaveRolls", "physical");
    globalThis.foundry.applications.api.DialogV2.wait = vi.fn(async () => true);
    const actor = { uuid: "Actor.npc", name: "Goblin", isOwner: true, rollSavingThrow: vi.fn() };
    const roll = await rollAsOwner(actor, "save", { ability: "dex", target: 14 });
    expect(actor.rollSavingThrow).not.toHaveBeenCalled();
    expect(roll).toMatchObject({ physical: true, success: true, total: 14 });
  });

  it("shows the GM a save dialog when GM saves are manual", async () => {
    globalThis.game.user.isGM = true;
    globalThis.game.users = [];
    globalThis.game.settings._store.set("gmSaveRolls", "manual");
    const actor = { ...playerOwnedActor(), isOwner: true };
    await rollAsOwner(actor, "save", { ability: "dex", target: 12 });
    expect(actor.rollSavingThrow).toHaveBeenCalledWith({ ability: "dex", target: 12 }, { configure: true }, {});
  });

  it("still lets a player click an ability check when saves are automated", async () => {
    globalThis.game.users = [];
    globalThis.game.settings._store.set("playerSaveRolls", { user1: "automated" });
    const actor = { ...playerOwnedActor(), isOwner: true, rollAbilityCheck: vi.fn(async () => [{ total: 11 }]) };
    await rollAsOwner(actor, "check", { ability: "int", target: 15 });
    expect(actor.rollAbilityCheck).toHaveBeenCalledWith({ ability: "int", target: 15 }, { configure: true }, {});
  });

  it("answers an owner-roll query with the roll's data", async () => {
    globalThis.CONFIG.queries = {};
    const actor = { rollAbilityCheck: vi.fn(async () => [{ total: 12, formula: "1d20+3" }]) };
    globalThis.fromUuid = vi.fn(async () => actor);
    bindOwnerRolls();

    const out = await globalThis.CONFIG.queries["illusive-dnd-5e.ownerRoll"]({
      actorUuid: "Actor.w", kind: "check", config: { ability: "int", target: 15 }
    });

    expect(out).toEqual({ total: 12, formula: "1d20+3" });
    expect(actor.rollAbilityCheck).toHaveBeenCalledWith({ ability: "int", target: 15 }, { configure: false }, {});
  });
});
