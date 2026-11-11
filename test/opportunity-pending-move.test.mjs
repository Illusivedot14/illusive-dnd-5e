import { describe, it, expect, beforeEach, vi } from "vitest";
import { installFoundry, makeToken, makeActor } from "./helpers.mjs";
import {
  stashPendingMove,
  getPendingMove,
  applyPendingMove,
  discardPendingMove,
  promptOpportunityReactions
} from "../src/application/opportunity-attack.mjs";

describe("opportunity pending move", () => {
  beforeEach(() => installFoundry());

  it("stashes and applies a held leave-reach move", async () => {
    const actor = makeActor({ id: "a1" });
    const token = makeToken({ id: "t1", actor });
    token.document = {
      id: "t1",
      uuid: "Token.t1",
      update: vi.fn(async () => {})
    };
    token.id = "t1";
    canvas.tokens.get = (id) => (id === "t1" ? token : null);

    stashPendingMove(token.document, { x: 200, y: 100 }, {});
    expect(getPendingMove("t1").changes).toEqual({ x: 200, y: 100 });

    await applyPendingMove("t1");
    expect(token.document.update).toHaveBeenCalledWith(
      { x: 200, y: 100 },
      expect.objectContaining({ illusiveSkipOA: true, illusiveApplyPending: true })
    );
    expect(getPendingMove("t1")).toBe(null);
  });

  it("releases the held move without Foundry's original movement id", async () => {
    const actor = makeActor({ id: "a1" });
    const token = makeToken({ id: "t1", name: "Buckamillion (Bucky)", actor });
    token.document = {
      id: "t1",
      uuid: "Token.t1",
      update: vi.fn(async (_changes, options) => {
        if (options.movement) throw new TypeError("Cannot redefine property: fUqLf8WMUU1oSnTk");
      })
    };
    token.id = "t1";
    canvas.tokens.get = (id) => (id === "t1" ? token : null);

    stashPendingMove(token.document, { x: 1820, y: 1120 }, {
      action: "move",
      movement: { fUqLf8WMUU1oSnTk: { x: 1820, y: 1120 } },
      diff: true
    });

    await applyPendingMove("t1");
    expect(token.document.update).toHaveBeenCalledWith(
      { x: 1820, y: 1120 },
      { illusiveSkipOA: true, illusiveApplyPending: true }
    );
    expect(getPendingMove("t1")).toBe(null);
  });

  it("asks the GM to resolve a monster's opportunity attack, then releases the move", async () => {
    const query = vi.fn(async () => ({ used: false }));
    const gm = { id: "gm", active: true, isGM: true, isSelf: false, query };
    globalThis.game.user.isGM = false;
    globalThis.game.user.id = "player2";
    globalThis.game.users = [{ id: "player2", active: true, isGM: false }, gm];
    globalThis.game.users.activeGM = gm;

    const sword = {
      id: "sword",
      type: "weapon",
      system: {
        activities: [{ id: "atk", type: "attack", range: { units: "ft", reach: 5 }, attack: { type: { value: "melee" } } }]
      }
    };
    const goblin = makeActor({ id: "gob", name: "Goblin", items: [sword] });
    goblin.uuid = "Actor.gob";
    goblin.isOwner = false;
    goblin.testUserPermission = () => false;
    const mover = makeToken({ id: "hero", name: "Balrus", actor: makeActor({ id: "hero", name: "Balrus" }) });
    mover.document.id = "hero";
    mover.document.uuid = "Token.hero";
    mover.document.update = vi.fn(async () => {});
    canvas.tokens.get = (id) => (id === "hero" ? mover : null);
    stashPendingMove(mover.document, { x: 300, y: 100 }, {});

    const observer = {
      uuid: "Token.gob",
      token: { id: "goblin", name: "Goblin", actor: goblin, document: { uuid: "Token.gob" } }
    };
    await promptOpportunityReactions({
      candidates: [{ observerUuid: "Token.gob", rule: "oa" }],
      observers: [observer],
      token: mover
    });

    expect(query).toHaveBeenCalledWith(
      "illusive-dnd-5e.opportunityAttack",
      expect.objectContaining({
        moverName: "Balrus",
        groups: [expect.objectContaining({ actorName: "Goblin" })]
      }),
      expect.any(Object)
    );
    expect(mover.document.update).toHaveBeenCalledWith(
      { x: 300, y: 100 },
      expect.objectContaining({ illusiveSkipOA: true })
    );
    expect(getPendingMove("hero")).toBe(null);
  });

  it("discard clears without updating", () => {
    stashPendingMove({ id: "t2", uuid: "Token.t2" }, { x: 1 }, {});
    expect(discardPendingMove("t2")).toBe(true);
    expect(getPendingMove("t2")).toBe(null);
  });
});
