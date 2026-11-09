import { describe, it, expect, beforeEach, vi } from "vitest";
import { installFoundry, makeToken, makeActor } from "./helpers.mjs";

describe("tokensInTemplate helper shape", () => {
  beforeEach(() => installFoundry());

  it("handleTemplateCreated no-ops without a save activity", async () => {
    const { handleTemplateCreated } = await import("../src/application/template-saves.mjs");
    const result = await handleTemplateCreated({
      flags: { dnd5e: {} },
      object: null,
      id: "tmpl1",
      x: 0,
      y: 0
    });
    expect(result).toBe(null);
  });

  it("footprint hit against placeable shape", async () => {
    const { isTokenInsideTemplate, tokensInTemplateDoc } = await import(
      "../src/application/template-saves.mjs"
    );
    const actor = makeActor({ id: "gob" });
    const token = makeToken({ id: "t1", actor, x: 100, y: 100 });
    token.document.width = 1;
    token.document.height = 1;
    token.document.x = 100;
    token.document.y = 100;
    token.x = 100;
    token.y = 100;
    canvas.grid = { size: 100, distance: 5 };
    canvas.scene = { grid: { size: 100, distance: 5 } };
    canvas.tokens.placeables = [token];

    const shape = {
      contains: (lx, ly) => Math.hypot(lx, ly) <= 150
    };
    const templateDoc = {
      id: "tmpl",
      t: "circle",
      x: 100,
      y: 100,
      distance: 20,
      direction: 0,
      object: { shape }
    };

    expect(isTokenInsideTemplate(templateDoc, token, { object: templateDoc.object })).toBe(true);
    expect(tokensInTemplateDoc(templateDoc, { object: templateDoc.object })).toHaveLength(1);
  });

  it("resolveSaveActivity rolls saves even when damage roll is empty", async () => {
    const { resolveSaveActivity } = await import("../src/application/save-resolve.mjs");
    const applyDamage = vi.fn(async () => ({}));
    const rollSavingThrow = vi.fn(async () => [{ total: 10 }]);
    const actor = {
      ...makeActor({ id: "gob" }),
      name: "Goblin",
      uuid: "Actor.gob",
      items: [],
      applyDamage,
      rollSavingThrow
    };
    const token = makeToken({ id: "t1", actor });
    token.document.uuid = "Scene.1.Token.t1";
    token.document.object = token;
    canvas.tokens.placeables = [token];
    globalThis.fromUuidSync = (uuid) => (uuid === token.document.uuid ? token.document : null);

    const activity = {
      type: "save",
      save: { ability: new Set(["dex"]), dc: { value: 15 } },
      damage: { parts: [], onSave: "half" },
      rollDamage: vi.fn(async () => []),
      effects: []
    };

    const result = await resolveSaveActivity({
      activity,
      targetUuids: [token.document.uuid]
    });
    expect(rollSavingThrow).toHaveBeenCalledOnce();
    expect(result.saveOutcomes).toHaveLength(1);
    expect(result.saveOutcomes[0].success).toBe(false);
    expect(applyDamage).not.toHaveBeenCalled();
  });

  it("resolveSaveActivity still scales with evasion", async () => {
    const { resolveSaveActivity } = await import("../src/application/save-resolve.mjs");
    const applyDamage = vi.fn(async () => ({}));
    const actor = {
      ...makeActor({ id: "rogue" }),
      name: "Rogue",
      uuid: "Actor.rogue",
      items: [{ name: "Evasion", system: { identifier: "evasion" } }],
      applyDamage,
      rollSavingThrow: vi.fn(async () => [{ total: 20 }])
    };
    const token = makeToken({ id: "t1", actor });
    token.document.uuid = "Scene.1.Token.t1";
    token.document.object = token;
    canvas.tokens.placeables = [token];
    globalThis.fromUuidSync = (uuid) => (uuid === token.document.uuid ? token.document : null);

    const activity = {
      type: "save",
      save: { ability: new Set(["dex"]), dc: { value: 15 } },
      damage: { parts: ["8d6"], onSave: "half" },
      rollDamage: vi.fn(async () => [{ total: 20, options: { type: "fire" } }]),
      effects: []
    };

    const result = await resolveSaveActivity({
      activity,
      targetUuids: [token.document.uuid]
    });
    expect(result.saveOutcomes[0].success).toBe(true);
    // Evasion + success → factor 0 → no damage applied
    expect(applyDamage).not.toHaveBeenCalled();
  });
});
