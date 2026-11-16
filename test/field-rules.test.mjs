import { describe, expect, it } from "vitest";
import {
  barrierBlocks,
  spellBlocked,
  slotRestoreKey,
  teleportBeside,
  lightHides,
  bypassTypes
} from "../src/domain/combat/field.mjs";

describe("field rules", () => {
  it("blocks entering, leaving, or either, and lets the source through a shell", () => {
    expect(barrierBlocks({ fromInside: false, toInside: true, blocks: "enter" })).toBe(true);
    expect(barrierBlocks({ fromInside: true, toInside: false, blocks: "enter" })).toBe(false);
    expect(barrierBlocks({ fromInside: true, toInside: false, blocks: "both" })).toBe(true);
    expect(barrierBlocks({
      fromInside: false,
      toInside: true,
      blocks: "enter",
      exceptSource: true,
      isSource: true
    })).toBe(false);
  });

  it("stops a caster in antimagic and a leveled spell against a globe", () => {
    expect(spellBlocked({ casterInsideSuppress: true, spellLevel: 3 })).toBe("suppress");
    expect(spellBlocked({ targetInsideWard: true, spellLevel: 5, wardLevel: 5 })).toBe("ward");
    expect(spellBlocked({ targetInsideWard: true, spellLevel: 6, wardLevel: 5 })).toBe(null);
    expect(spellBlocked({ targetInsideWard: true, spellLevel: 0, wardLevel: 5 })).toBe(null);
  });

  it("restores the highest expended slot at or under the cap", () => {
    const spells = {
      spell1: { value: 2, max: 4 },
      spell3: { value: 1, max: 2 },
      spell5: { value: 0, max: 1 }
    };
    expect(slotRestoreKey(spells, 4)).toBe("spell3");
    expect(slotRestoreKey(spells, 9)).toBe("spell5");
    expect(slotRestoreKey({ spell1: { value: 2, max: 2 }, pact: { level: 2, value: 0, max: 2 } }, 4)).toBe("pact");
  });

  it("stops beside the target only when the space is in range", () => {
    const grid = { size: 100, distance: 5 };
    const beside = teleportBeside({ x: 0, y: 0 }, { x: 400, y: 0 }, 30, grid);
    expect(beside.x).toBeCloseTo(300);
    expect(teleportBeside({ x: 0, y: 0 }, { x: 1000, y: 0 }, 30, grid)).toBe(null);
  });

  it("hides in dim or dark light and bypasses only the matching source", () => {
    expect(lightHides("dim")).toBe(true);
    expect(lightHides("bright")).toBe(false);
    const entries = [{ type: "fire", spells: true }, { type: "piercing", attacks: true }];
    expect(bypassTypes(entries, { spell: true })).toEqual(["fire"]);
    expect(bypassTypes(entries, { attack: true })).toEqual(["piercing"]);
  });
});
