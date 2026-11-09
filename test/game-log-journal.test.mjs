import { describe, it, expect } from "vitest";
import {
  applyLogOp,
  collectUndoCascade,
  findEntryForEffect,
  findEntryBy,
  turnListId
} from "../src/domain/combat/game-log.mjs";

const stamp = (round, turnIndex, combatantId) => ({ round, turnIndex, combatantId });

function push(turns, s, entry) {
  return applyLogOp(turns, { type: "push", stamp: s, entry });
}

describe("game-log journal ops", () => {
  it("push is idempotent by entry id (a replayed op never duplicates a row)", () => {
    let turns = push([], stamp(1, 0, "c1"), { id: "log:a:1", label: "Attack" });
    turns = push(turns, stamp(1, 0, "c1"), { id: "log:a:1", label: "Attack" });
    expect(turns).toHaveLength(1);
    expect(turns[0].id).toBe(turnListId(1, 0, "c1"));
    expect(turns[0].actions).toHaveLength(1);
  });

  it("amend, remove and popTurn replay cleanly", () => {
    let turns = push([], stamp(1, 0, "c1"), { id: "e1", label: "Cast" });
    turns = push(turns, stamp(1, 1, "c2"), { id: "e2", label: "Move" });
    turns = applyLogOp(turns, { type: "amend", entryId: "e1", patch: { label: "Cast Hex" } });
    expect(turns[0].actions[0].label).toBe("Cast Hex");
    const removed = applyLogOp(turns, { type: "remove", entryIds: ["e2"] });
    expect(applyLogOp(removed, { type: "remove", entryIds: ["e2"] })).toEqual(removed);
    const popped = applyLogOp(turns, { type: "popTurn", turnId: turnListId(1, 1, "c2") });
    expect(popped).toHaveLength(1);
    expect(applyLogOp(turns, { type: "clear" })).toEqual([]);
  });

  it("undo cascades across turns through dependsOn, newest first, target last", () => {
    let turns = push([], stamp(1, 0, "wiz"), {
      id: "cast",
      resolutionId: "res-cast",
      at: 1,
      appliedChanges: [{ type: "effect", actorUuid: "Actor.w", effectUuids: ["Actor.w.ActiveEffect.aoa"] }]
    });
    turns = push(turns, stamp(1, 0, "wiz"), { id: "shield", kind: "reaction", parentResolutionId: "res-cast", at: 2 });
    turns = push(turns, stamp(1, 1, "orc"), { id: "orc-attack", at: 3 });
    turns = push(turns, stamp(1, 1, "orc"), { id: "aoa-hit", kind: "system", dependsOn: ["cast"], at: 4 });
    turns = push(turns, stamp(2, 0, "wiz"), { id: "tick", kind: "system", dependsOn: ["aoa-hit"], at: 5 });

    expect(findEntryForEffect(turns, "Actor.w.ActiveEffect.aoa")?.id).toBe("cast");
    expect(findEntryBy(turns, { resolutionId: "res-cast" })?.id).toBe("cast");
    expect(collectUndoCascade(turns, "cast").map((e) => e.id)).toEqual(["tick", "aoa-hit", "shield", "cast"]);
    expect(collectUndoCascade(turns, "orc-attack").map((e) => e.id)).toEqual(["orc-attack"]);
  });
});
