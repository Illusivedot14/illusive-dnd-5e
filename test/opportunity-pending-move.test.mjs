import { describe, it, expect, beforeEach, vi } from "vitest";
import { installFoundry, makeToken, makeActor } from "./helpers.mjs";
import {
  stashPendingMove,
  getPendingMove,
  applyPendingMove,
  discardPendingMove
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

  it("discard clears without updating", () => {
    stashPendingMove({ id: "t2", uuid: "Token.t2" }, { x: 1 }, {});
    expect(discardPendingMove("t2")).toBe(true);
    expect(getPendingMove("t2")).toBe(null);
  });
});
