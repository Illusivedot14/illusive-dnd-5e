import { describe, it, expect, beforeEach, vi } from "vitest";
import { installFoundry } from "./helpers.mjs";
import {
  updateDoc,
  setDocFlag,
  applyActorDamage,
  serialize,
  restorePayload,
  bindWriteGateway,
  _resetWriteQueues
} from "../src/foundry/write-gateway.mjs";
import { isPrimaryWriter } from "../src/foundry/gm-query.mjs";

function makeDoc({ uuid = "Actor.a", isOwner = true, source = {} } = {}) {
  const flags = {};
  return {
    uuid,
    isOwner,
    _source: source,
    update: vi.fn(async () => {}),
    getFlag: (_s, k) => flags[k],
    setFlag: vi.fn(async (_s, k, v) => { flags[k] = v; }),
    unsetFlag: vi.fn(async (_s, k) => { delete flags[k]; })
  };
}

describe("write gateway", () => {
  beforeEach(() => {
    installFoundry();
    globalThis.CONFIG.queries = {};
    _resetWriteQueues();
  });

  it("writes an owned document locally and records prior / next", async () => {
    const doc = makeDoc({ source: { system: { uses: { spent: 1 } } } });
    const result = await updateDoc(doc, { "system.uses.spent": 2 });
    expect(result.via).toBe("local");
    expect(doc.update).toHaveBeenCalled();
    expect(result.undo[0]).toEqual({
      type: "doc-update",
      uuid: "Actor.a",
      prior: { "system.uses.spent": 1 },
      next: { "system.uses.spent": 2 }
    });
  });

  it("sends a non-owned write to the active GM as plain uuids", async () => {
    const query = vi.fn(async () => ({ ok: true, undo: [{ type: "flag" }] }));
    globalThis.game.users = { activeGM: { isSelf: false, query } };
    const doc = makeDoc({ isOwner: false });
    globalThis.fromUuidSync = (uuid) => (uuid === doc.uuid ? doc : null);
    const result = await setDocFlag(doc, "illusive-dnd-5e", "k", 1);
    expect(result.via).toBe("gm");
    expect(doc.setFlag).not.toHaveBeenCalled();
    const [name, payload] = query.mock.calls[0];
    expect(name).toBe("illusive-dnd-5e.write");
    expect(payload.op).toMatchObject({ type: "setFlag", uuid: "Actor.a", key: "k", value: 1 });
    delete globalThis.fromUuidSync;
  });

  it("the GM handler executes the op and refuses on a player client", async () => {
    bindWriteGateway();
    const handler = globalThis.CONFIG.queries["illusive-dnd-5e.write"];
    expect(typeof handler).toBe("function");
    const doc = makeDoc();
    globalThis.fromUuidSync = () => doc;
    expect(await handler({ op: { type: "setFlag", uuid: doc.uuid, scope: "s", key: "k", value: 2 } }))
      .toMatchObject({ ok: false, reason: "not-gm" });
    globalThis.game.user.isGM = true;
    const ok = await handler({ op: { type: "setFlag", uuid: doc.uuid, scope: "s", key: "k", value: 2 } });
    expect(ok.ok).toBe(true);
    expect(doc.setFlag).toHaveBeenCalledWith("s", "k", 2);
    delete globalThis.fromUuidSync;
  });

  it("damage records prior and next HP", async () => {
    const hp = { value: 10, max: 10, temp: 0 };
    const actor = {
      uuid: "Actor.hp",
      system: { attributes: { hp } },
      applyDamage: vi.fn(async (damages) => { hp.value -= damages[0].value; })
    };
    const result = await applyActorDamage(actor, [{ value: 4, type: "fire" }]);
    expect(result.prior.value).toBe(10);
    expect(result.next.value).toBe(6);
    expect(result.undo[0]).toMatchObject({ type: "actor-hp", actorUuid: "Actor.hp" });
  });

  it("serializes writes to the same document", async () => {
    const order = [];
    const slow = serialize("doc", async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push("first");
    });
    const fast = serialize("doc", async () => { order.push("second"); });
    await Promise.all([slow, fast]);
    expect(order).toEqual(["first", "second"]);
  });

  it("restorePayload deletes keys that did not exist", () => {
    expect(restorePayload({ "flags.x.a": 1, "flags.x.b": undefined }))
      .toEqual({ "flags.x.a": 1, "flags.x.-=b": null });
  });

  it("one primary writer: the active GM, else the lowest active user id", () => {
    globalThis.game.users = { activeGM: { isSelf: false } };
    expect(isPrimaryWriter()).toBe(false);
    globalThis.game.users = Object.assign(
      [{ id: "user1", active: true }, { id: "user0", active: true }],
      { activeGM: null }
    );
    expect(isPrimaryWriter()).toBe(false);
    globalThis.game.user.id = "user0";
    expect(isPrimaryWriter()).toBe(true);
  });
});
