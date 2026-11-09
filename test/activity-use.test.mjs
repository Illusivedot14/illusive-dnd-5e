import { describe, it, expect, beforeEach, vi } from "vitest";
import { installFoundry, makeToken } from "./helpers.mjs";
import {
  getEffectiveTargetType,
  resolveActivityTargetUuids,
  buildHudUseOptions,
  useActivityFromHud
} from "../src/application/activity.mjs";

describe("activity-use", () => {
  beforeEach(() => installFoundry({ settings: { configureDialog: false } }));

  it("resolves self targets to the acting token", () => {
    const token = makeToken({ id: "t1" });
    token.document.uuid = "Scene.1.Token.t1";
    const activity = { target: { affects: { type: "self" } } };
    expect(resolveActivityTargetUuids(token, activity)).toEqual(["Scene.1.Token.t1"]);
  });

  it("returns empty targets for template activities", () => {
    const token = makeToken({ id: "t1" });
    const activity = { target: { template: { type: "cone" } } };
    expect(resolveActivityTargetUuids(token, activity)).toEqual([]);
  });

  it("uses canvas targets for creature targeting", () => {
    const token = makeToken({ id: "t1" });
    const target = makeToken({ id: "t2" });
    target.document.uuid = "Scene.1.Token.t2";
    game.user.targets = new Set([target]);
    const activity = { target: { affects: { type: "creature" } } };
    expect(resolveActivityTargetUuids(token, activity)).toEqual(["Scene.1.Token.t2"]);
  });

  it("uses listed target UUIDs when canvas targets are empty", () => {
    const token = makeToken({ id: "t1" });
    const activity = { target: { affects: { type: "creature" } } };
    expect(resolveActivityTargetUuids(token, activity, {
      targetUuids: ["Scene.scene1.Token.tg"]
    })).toEqual(["Scene.scene1.Token.tg"]);
  });

  it("uses the trigger token for reaction targeting", () => {
    const token = makeToken({ id: "t1" });
    const activity = { target: { affects: { type: "creature" } } };
    const uuids = resolveActivityTargetUuids(token, activity, {
      triggerTokenUuid: "Scene.1.Token.attacker"
    }, "reaction");
    expect(uuids).toEqual(["Scene.1.Token.attacker"]);
  });

  it("builds reaction use options with configureDialog enabled", () => {
    const token = makeToken({ id: "t1" });
    token.document.uuid = "Scene.1.Token.t1";
    const activity = { target: { affects: { type: "creature" } } };
    const options = buildHudUseOptions(token, activity, "reaction", {
      triggerTokenUuid: "Scene.1.Token.attacker"
    });
    expect(options.configureDialog).toBe(true);
    expect(options.isReaction).toBe(true);
    expect(options.targetUuids).toEqual(["Scene.1.Token.attacker"]);
  });

  it("builds hud use options with fast defaults", () => {
    const token = makeToken({ id: "t1" });
    token.document.uuid = "Scene.1.Token.t1";
    const activity = { target: { affects: { type: "self" } } };
    const options = buildHudUseOptions(token, activity, "action", {});
    expect(options.configureDialog).toBe(false);
    expect(options.targetUuids).toEqual(["Scene.1.Token.t1"]);
  });

  it("calls activity.use through the application layer", async () => {
    const token = makeToken({ id: "t1" });
    token.document.uuid = "Scene.1.Token.t1";
    token.actor = { uuid: "Actor.1", isOwner: true };
    const activity = {
      id: "act1",
      target: { affects: { type: "self" } },
      use: vi.fn(async () => ({}))
    };
    const item = { id: "i1", uuid: "Actor.1.Item.i1" };

    await useActivityFromHud(token, item, activity, "action", {}, {});

    expect(activity.use).toHaveBeenCalledTimes(1);
  });

  it("clears canvas targets after a successful HUD use", async () => {
    const token = makeToken({ id: "t1" });
    token.document.uuid = "Scene.1.Token.t1";
    token.actor = { uuid: "Actor.1", isOwner: true };
    const target = makeToken({ id: "t2" });
    target.document.uuid = "Scene.1.Token.t2";
    const targets = new Set([target]);
    target.setTarget = vi.fn((_active, _opts) => {
      targets.delete(target);
    });
    game.user.targets = targets;

    const activity = {
      id: "act1",
      target: { affects: { type: "creature" } },
      use: vi.fn(async () => ({}))
    };

    await useActivityFromHud(token, { id: "i1", uuid: "Actor.1.Item.i1" }, activity, "action", {}, {});

    expect(activity.use).toHaveBeenCalledTimes(1);
    expect(target.setTarget).toHaveBeenCalledWith(false, expect.objectContaining({ releaseOthers: false }));
    expect(game.user.targets.size).toBe(0);
  });

  it("inherits spell targeting for cast activities", () => {
    const activity = {
      type: "cast",
      spell: { uuid: "Actor.1.Item.spell" },
      cachedSpell: {
        system: {
          activities: {
            contents: [{ target: { affects: { type: "self" } } }]
          }
        }
      }
    };
    expect(getEffectiveTargetType(activity)).toBe("self");
  });
});
