import { describe, it, expect } from "vitest";
import { isSuitcaseEntry } from "../src/foundry/item-interactions.mjs";

describe("isSuitcaseEntry", () => {
  it("treats consumables and tools as interactions", () => {
    expect(isSuitcaseEntry({ type: "consumable" }, null, "action")).toBe(true);
    expect(isSuitcaseEntry({ type: "tool" }, null, "bonus")).toBe(true);
  });

  it("treats special activation and utilize activities as interactions", () => {
    expect(isSuitcaseEntry({ type: "equipment" }, { type: "utilize" }, "action")).toBe(true);
    expect(isSuitcaseEntry({ type: "weapon" }, null, "special")).toBe(true);
  });

  it("keeps weapon attacks in the action section", () => {
    expect(isSuitcaseEntry({ type: "weapon" }, { type: "attack" }, "action")).toBe(false);
    expect(isSuitcaseEntry({ type: "spell" }, { type: "cast" }, "action")).toBe(false);
  });
});
