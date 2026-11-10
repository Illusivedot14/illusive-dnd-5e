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

  it("lets a player owner click their own save", async () => {
    globalThis.game.users = [];
    const actor = { ...playerOwnedActor(), isOwner: true };
    await rollAsOwner(actor, "save", { ability: "wis", target: 13 });
    expect(actor.rollSavingThrow).toHaveBeenCalledTimes(1);
    expect(actor.rollSavingThrow).toHaveBeenCalledWith({ ability: "wis", target: 13 }, { configure: true }, {});
  });

  it("rolls plainly when the player closes the dialog", async () => {
    globalThis.game.users = [];
    const rollSavingThrow = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce([{ total: 9 }]);
    const actor = { uuid: "Actor.pc", isOwner: true, rollSavingThrow };
    const roll = await rollAsOwner(actor, "save", { ability: "wis", target: 13 });
    expect(roll.total).toBe(9);
    expect(rollSavingThrow.mock.calls[1][1]).toEqual({ configure: false });
  });

  it("rolls NPC saves on the GM without a dialog", async () => {
    globalThis.game.user.isGM = true;
    globalThis.game.users = [];
    const actor = { ...playerOwnedActor(), isOwner: true };
    await rollAsOwner(actor, "save", { ability: "dex", target: 12 });
    expect(actor.rollSavingThrow).toHaveBeenCalledWith({ ability: "dex", target: 12 }, { configure: false }, {});
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
