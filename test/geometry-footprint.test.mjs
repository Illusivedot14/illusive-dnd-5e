import { describe, it, expect } from "vitest";
import {
  footprintCellsBetween,
  footprintFeetBetween
} from "../src/domain/spatial/geometry.mjs";

describe("footprintCellsBetween", () => {
  it("counts adjacent mediums as 1 cell", () => {
    const a = { x: 0, y: 0, width: 1, height: 1 };
    const b = { x: 100, y: 0, width: 1, height: 1 };
    expect(footprintCellsBetween(a, b, 100)).toBe(1);
  });

  it("counts large beside medium as 1 cell (not center-to-center)", () => {
    // Large 2x2 at (0,0) occupies cols 0–1; medium at x=200 is adjacent.
    const large = { x: 0, y: 0, width: 2, height: 2 };
    const medium = { x: 200, y: 0, width: 1, height: 1 };
    expect(footprintCellsBetween(large, medium, 100)).toBe(1);
    expect(footprintFeetBetween(large, medium, { gridSize: 100, gridDistance: 5 })).toBe(5);
  });

  it("counts one empty square between mediums as 2 cells / 10 ft", () => {
    const a = { x: 0, y: 0, width: 1, height: 1 };
    const b = { x: 200, y: 0, width: 1, height: 1 };
    expect(footprintCellsBetween(a, b, 100)).toBe(2);
    expect(footprintFeetBetween(a, b)).toBe(10);
  });

  it("returns 0 for overlapping footprints", () => {
    const a = { x: 0, y: 0, width: 2, height: 2 };
    const b = { x: 100, y: 100, width: 1, height: 1 };
    expect(footprintCellsBetween(a, b, 100)).toBe(0);
  });

  it("handles diagonal adjacency as 1 cell", () => {
    const a = { x: 0, y: 0, width: 1, height: 1 };
    const b = { x: 100, y: 100, width: 1, height: 1 };
    expect(footprintCellsBetween(a, b, 100)).toBe(1);
  });
});
