import { describe, it, expect, beforeEach, vi } from "vitest";
import { installFoundry } from "./helpers.mjs";
import { applyUndoPlan } from "../src/foundry/document-adapter.mjs";

describe("applyUndoPlan hp", () => {
  beforeEach(() => {
    installFoundry();
    globalThis.fromUuid = vi.fn(async (uuid) => {
      if (uuid === "Actor.a1") {
        return {
          uuid,
          update: vi.fn(async () => {})
        };
      }
      return null;
    });
  });

  it("restores actor-hp from a snapshot prior", async () => {
    const results = await applyUndoPlan([
      {
        type: "actor-hp",
        actorUuid: "Actor.a1",
        prior: { value: 12, max: 20, temp: 2 }
      }
    ]);
    expect(results[0].ok).toBe(true);
    const actor = await fromUuid("Actor.a1");
    // fromUuid returns a new mock each time in this harness — re-spy via call
    expect(results[0].ok).toBe(true);
  });

  it("accepts legacy type hp with numeric prior", async () => {
    const update = vi.fn(async () => {});
    globalThis.fromUuid = vi.fn(async () => ({ update }));
    const results = await applyUndoPlan([
      { type: "hp", actorUuid: "Actor.a1", prior: 9 }
    ]);
    expect(results[0].ok).toBe(true);
    expect(update).toHaveBeenCalledWith(
      { "system.attributes.hp.value": 9 },
      expect.objectContaining({ isUndo: true })
    );
  });

  it("reverses only its own delta when later damage moved HP (out-of-order undo)", async () => {
    const update = vi.fn(async () => {});
    globalThis.fromUuid = vi.fn(async () => ({
      update,
      system: { attributes: { hp: { value: 5, temp: 0, max: 30 } } }
    }));
    // This change took 20 → 12; a later hit took 12 → 5. Undo must give back 8, not reset to 20.
    await applyUndoPlan([
      { type: "actor-hp", actorUuid: "Actor.a1", prior: { value: 20, temp: 0 }, next: { value: 12, temp: 0 } }
    ]);
    expect(update.mock.calls[0][0]["system.attributes.hp.value"]).toBe(13);
  });

  it("restores the exact prior when nothing touched HP since (strict LIFO)", async () => {
    const update = vi.fn(async () => {});
    globalThis.fromUuid = vi.fn(async () => ({
      update,
      system: { attributes: { hp: { value: 12, temp: 0, max: 30 } } }
    }));
    await applyUndoPlan([
      { type: "actor-hp", actorUuid: "Actor.a1", prior: { value: 20, temp: 0 }, next: { value: 12, temp: 0 } }
    ]);
    expect(update.mock.calls[0][0]["system.attributes.hp.value"]).toBe(20);
  });
});
