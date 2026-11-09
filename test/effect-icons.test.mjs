import { describe, it, expect, beforeEach } from "vitest";
import { installFoundry, makeActor, makeEffect } from "./helpers.mjs";
import {
  getEffectImage,
  collectActiveEffects
} from "../src/foundry/effect-icons.mjs";

describe("getEffectImage", () => {
  beforeEach(() => installFoundry());

  it("prefers the effect's own image", () => {
    expect(getEffectImage(makeEffect({ img: "flame.png" }))).toBe("flame.png");
  });

  it("falls back to a matching status-effect config image", () => {
    globalThis.CONFIG.statusEffects = [{ id: "prone", img: "prone.png" }];
    const effect = makeEffect({ img: null, statuses: ["prone"] });
    expect(getEffectImage(effect)).toBe("prone.png");
  });

  it("falls back to a visible default when no image can be resolved", () => {
    expect(getEffectImage(makeEffect({ img: null, statuses: ["unknown"] }))).toBe("icons/svg/aura.svg");
  });
});

describe("collectActiveEffects", () => {
  beforeEach(() => installFoundry());

  it("returns [] for a missing actor", () => {
    expect(collectActiveEffects(null)).toEqual([]);
  });

  it("skips disabled, suppressed (non-status), and defeated effects", () => {
    const actor = makeActor({
      temporaryEffects: [
        makeEffect({ id: "ok", name: "Bless" }),
        makeEffect({ id: "off", disabled: true }),
        makeEffect({ id: "sup", isSuppressed: true }),
        makeEffect({ id: "noimg", img: null }),
        makeEffect({ id: "dead", statuses: ["dead"] })
      ]
    });
    const result = collectActiveEffects(actor);
    // Image-less rows still show (fallback art); defeated / disabled / suppressed do not.
    expect(result.map((e) => e.id)).toEqual(["ok", "noimg"]);
  });

  it("lists temporary effects before applied effects and de-dupes by id", () => {
    const actor = makeActor({
      temporaryEffects: [makeEffect({ id: "a", name: "Haste" })],
      appliedEffects: [makeEffect({ id: "a", name: "Haste dup" }), makeEffect({ id: "b", name: "Mage Armor" })]
    });
    expect(collectActiveEffects(actor).map((e) => e.id)).toEqual(["a", "b"]);
  });
});
