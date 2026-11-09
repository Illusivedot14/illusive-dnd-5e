// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { turnDirection } from "../src/hud/components/turn-tracker/turn-tracker.mjs";

const combat = (round, turn, started = true) => ({ round, turn, started });

describe("turnDirection", () => {
  it("returns 0 with no previous key", () => {
    expect(turnDirection(undefined, combat(1, 0))).toBe(0);
    expect(turnDirection("", combat(1, 0))).toBe(0);
  });

  it("returns 0 before combat has started", () => {
    expect(turnDirection("1:0", combat(1, 1, false))).toBe(0);
  });

  it("advances forward when the round increases", () => {
    expect(turnDirection("1:2", combat(2, 0))).toBe(1);
  });

  it("goes backward when the round decreases", () => {
    expect(turnDirection("3:0", combat(2, 5))).toBe(-1);
  });

  it("advances forward when the turn increases within a round", () => {
    expect(turnDirection("2:1", combat(2, 2))).toBe(1);
  });

  it("goes backward when the turn decreases within a round", () => {
    expect(turnDirection("2:3", combat(2, 1))).toBe(-1);
  });

  it("returns 0 when nothing changed", () => {
    expect(turnDirection("2:2", combat(2, 2))).toBe(0);
  });
});
