/**
 * Hard tests: resolveSaveActivity must change actor HP via applyDamage.
 * Mocks Actor5e.applyDamage the way dnd5e does (sum values * multiplier).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { installFoundry, makeToken } from "./helpers.mjs";
import { damagesFromRolls, applyDamagesToActor } from "../src/application/damage-apply.mjs";
import { resolveSaveActivity } from "../src/application/save-resolve.mjs";

/** Minimal stand-in for Actor5e.applyDamage math (positive amount = HP loss). */
function makeHpActor({ id, hp = 40, saveTotal = 5 } = {}) {
  const actor = {
    uuid: `Actor.${id}`,
    name: id,
    items: [],
    system: {
      attributes: {
        hp: { value: hp, max: hp, temp: 0, tempmax: 0, damage: 0 }
      }
    },
    rollSavingThrow: vi.fn(async () => [{ total: saveTotal }]),
    applyDamage: vi.fn(async function applyDamage(damages, options = {}) {
      const multiplier = Number(options.multiplier ?? 1) || 1;
      let amount = 0;
      for (const d of damages) {
        amount += (Number(d.value) || 0) * multiplier;
      }
      amount = Math.trunc(amount);
      // dnd5e: positive amount reduces HP
      this.system.attributes.hp.value = Math.max(0, this.system.attributes.hp.value - amount);
      return this;
    })
  };
  return actor;
}

function wireToken(id, actor) {
  const token = makeToken({ id, name: id, actor });
  token.document.uuid = `Scene.1.Token.${id}`;
  token.document.object = token;
  token.uuid = token.document.uuid;
  return token;
}

describe("damagesFromRolls (dnd5e chat-card shape)", () => {
  beforeEach(() => {
    installFoundry();
    CONFIG.DND5E = {
      damageTypes: { fire: { label: "Fire" } },
      healingTypes: { healing: { label: "Healing" } }
    };
  });

  it("keeps fire damage totals (does not drop typed rolls)", () => {
    const damages = damagesFromRolls([
      { total: 28, options: { type: "fire", properties: [] } }
    ]);
    expect(damages).toHaveLength(1);
    expect(damages[0].value).toBe(28);
    expect(damages[0].type).toBe("fire");
    expect(damages[0].properties).toBeInstanceOf(Set);
  });

  it("does not call aggregateDamageRolls that would wipe plain roll stubs", () => {
    // If aggregate were forced on stubs without .terms, payloads would vanish.
    globalThis.dnd5e = {
      dice: {
        aggregateDamageRolls: () => []
      }
    };
    const damages = damagesFromRolls([{ total: 12, options: { type: "fire" } }]);
    expect(damages).toHaveLength(1);
    expect(damages[0].value).toBe(12);
  });
});

describe("applyDamagesToActor", () => {
  beforeEach(() => installFoundry());

  it("reduces HP by value * multiplier", async () => {
    const actor = makeHpActor({ id: "gob", hp: 30 });
    const ok = await applyDamagesToActor(
      actor,
      [{ value: 20, type: "fire", properties: new Set() }],
      { multiplier: 0.5 }
    );
    expect(ok).toMatchObject({ ok: true, prior: { value: 30 }, next: { value: 20 } });
    expect(actor.system.attributes.hp.value).toBe(20); // 30 - 10
    expect(actor.applyDamage).toHaveBeenCalledWith(
      [expect.objectContaining({ value: 20, type: "fire" })],
      expect.objectContaining({ multiplier: 0.5, isDelta: true })
    );
  });
});

describe("resolveSaveActivity HP mutation", () => {
  beforeEach(() => {
    installFoundry();
    CONFIG.DND5E = {
      damageTypes: { fire: { label: "Fire" } },
      healingTypes: {}
    };
  });

  it("applies full damage on failed save and half on success", async () => {
    const failActor = makeHpActor({ id: "fail", hp: 40, saveTotal: 5 });
    const saveActor = makeHpActor({ id: "save", hp: 40, saveTotal: 20 });
    const failTok = wireToken("fail", failActor);
    const saveTok = wireToken("save", saveActor);
    canvas.tokens.placeables = [failTok, saveTok];
    globalThis.fromUuidSync = (uuid) => {
      if (uuid === failTok.document.uuid) return failTok.document;
      if (uuid === saveTok.document.uuid) return saveTok.document;
      return null;
    };

    const activity = {
      type: "save",
      save: { ability: new Set(["dex"]), dc: { value: 15 } },
      damage: { onSave: "half", parts: [{}] },
      rollDamage: vi.fn(async () => [
        { total: 20, options: { type: "fire", properties: [] } }
      ]),
      effects: []
    };

    const result = await resolveSaveActivity({
      activity,
      targetUuids: [failTok.document.uuid, saveTok.document.uuid]
    });

    expect(result.saveOutcomes).toHaveLength(2);
    expect(failActor.applyDamage).toHaveBeenCalled();
    expect(saveActor.applyDamage).toHaveBeenCalled();
    expect(failActor.system.attributes.hp.value).toBe(20); // full 20
    expect(saveActor.system.attributes.hp.value).toBe(30); // half 10
    expect(result.applied).toHaveLength(2);
  });

  it("requires applyDamage to be invoked with a non-empty payload after a failed save", async () => {
    const actor = makeHpActor({ id: "victim", hp: 50, saveTotal: 1 });
    const token = wireToken("victim", actor);
    canvas.tokens.placeables = [token];
    globalThis.fromUuidSync = () => token.document;

    const activity = {
      type: "save",
      save: { ability: { first: () => "dex" }, dc: { value: 15 } },
      damage: { onSave: "half", parts: [{}] },
      rollDamage: vi.fn(async () => [{ total: 25, options: { type: "fire" } }]),
      effects: []
    };

    await resolveSaveActivity({
      activity,
      targetUuids: [token.document.uuid]
    });

    expect(activity.rollDamage).toHaveBeenCalled();
    expect(actor.applyDamage).toHaveBeenCalled();
    const [payload, opts] = actor.applyDamage.mock.calls[0];
    expect(payload[0].value).toBe(25);
    expect(opts.multiplier).toBe(1);
    expect(opts.isDelta).toBe(true);
    expect(actor.system.attributes.hp.value).toBe(25);
  });
});

