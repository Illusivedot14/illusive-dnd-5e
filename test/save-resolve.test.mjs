import { describe, it, expect, beforeEach, vi } from "vitest";
import { installFoundry, makeToken } from "./helpers.mjs";
import { resolveSaveActivity } from "../src/application/save-resolve.mjs";

function makeSaveActivity({ onSave = "half", parts = [{ number: 2, denomination: 6 }] } = {}) {
  return {
    type: "save",
    uuid: "Activity.save1",
    item: { uuid: "Item.fireball" },
    save: {
      ability: { first: () => "dex" },
      dc: { value: 15 }
    },
    damage: {
      onSave,
      parts
    },
    effects: [],
    relevantLevel: 3,
    rollDamage: vi.fn(async () => [
      { total: 10, options: { type: "fire" } }
    ])
  };
}

function wireToken(token, uuid) {
  token.uuid = uuid;
  token.document = { ...token.document, uuid };
  token.actor.applyDamage = token.actor.applyDamage ?? vi.fn(async () => ({}));
  return token;
}

describe("resolveSaveActivity", () => {
  beforeEach(() => {
    installFoundry();
    CONFIG.DND5E = {
      damageTypes: { fire: { label: "Fire" } },
      healingTypes: {}
    };
  });

  it("rolls saves, halves damage on success, full on fail", async () => {
    const failer = wireToken(
      makeToken({
        id: "t-fail",
        name: "Goblin",
        actor: {
          uuid: "Actor.fail",
          name: "Goblin",
          system: { attributes: { hp: { value: 20, max: 20 } } },
          rollSavingThrow: vi.fn(async () => [{ total: 10 }]),
          applyDamage: vi.fn(async () => ({}))
        }
      }),
      "Token.fail"
    );

    const saver = wireToken(
      makeToken({
        id: "t-save",
        name: "Hero",
        actor: {
          uuid: "Actor.save",
          name: "Hero",
          system: { attributes: { hp: { value: 30, max: 30 } } },
          rollSavingThrow: vi.fn(async () => [{ total: 18 }]),
          applyDamage: vi.fn(async () => ({}))
        }
      }),
      "Token.save"
    );

    const byUuid = {
      "Token.fail": failer,
      "Token.save": saver
    };
    globalThis.fromUuidSync = (uuid) => byUuid[uuid] ?? null;
    canvas.tokens.placeables = [failer, saver];

    const activity = makeSaveActivity({ onSave: "half" });
    const result = await resolveSaveActivity({
      activity,
      targetUuids: ["Token.fail", "Token.save"]
    });

    expect(result.saveOutcomes).toHaveLength(2);
    expect(result.saveOutcomes[0].success).toBe(false);
    expect(result.saveOutcomes[1].success).toBe(true);

    expect(failer.actor.applyDamage).toHaveBeenCalledWith(
      [expect.objectContaining({ value: 10, type: "fire" })],
      expect.objectContaining({ multiplier: 1, isDelta: true })
    );
    expect(saver.actor.applyDamage).toHaveBeenCalledWith(
      [expect.objectContaining({ value: 10, type: "fire" })],
      expect.objectContaining({ multiplier: 0.5, isDelta: true })
    );
  });

  it("skips damage when onSave is none and target saves", async () => {
    const saver = wireToken(
      makeToken({
        id: "t1",
        name: "Hero",
        actor: {
          uuid: "Actor.t1",
          name: "Hero",
          system: { attributes: { hp: { value: 10, max: 10 } } },
          rollSavingThrow: vi.fn(async () => [{ total: 20 }]),
          applyDamage: vi.fn(async () => ({}))
        }
      }),
      "Token.t1"
    );
    globalThis.fromUuidSync = () => saver;
    canvas.tokens.placeables = [saver];

    const activity = makeSaveActivity({ onSave: "none" });
    const result = await resolveSaveActivity({
      activity,
      targetUuids: ["Token.t1"]
    });

    expect(result.saveOutcomes[0].success).toBe(true);
    expect(saver.actor.applyDamage).not.toHaveBeenCalled();
    expect(result.applied).toHaveLength(0);
  });

  it("applies half damage when the GM marks a physical player save as passed", async () => {
    globalThis.game.user.isGM = true;
    globalThis.game.users = [{ id: "player2", active: true, isGM: false }];
    globalThis.foundry.applications.api.DialogV2.wait = vi.fn(async () => true);
    const saver = wireToken(
      makeToken({
        id: "t-save",
        name: "Hero",
        actor: {
          uuid: "Actor.save",
          name: "Hero",
          testUserPermission: (user) => user.id === "player2",
          system: { attributes: { hp: { value: 30, max: 30 } } },
          rollSavingThrow: vi.fn(async () => [{ total: 1 }]),
          applyDamage: vi.fn(async () => ({}))
        }
      }),
      "Token.save"
    );
    globalThis.fromUuidSync = () => saver;
    canvas.tokens.placeables = [saver];

    const activity = makeSaveActivity({ onSave: "half" });
    const result = await resolveSaveActivity({
      activity,
      targetUuids: ["Token.save"]
    });

    expect(saver.actor.rollSavingThrow).not.toHaveBeenCalled();
    expect(result.saveOutcomes[0].success).toBe(true);
    expect(saver.actor.applyDamage).toHaveBeenCalledWith(
      [expect.objectContaining({ value: 10, type: "fire" })],
      expect.objectContaining({ multiplier: 0.5, isDelta: true })
    );
  });
});
