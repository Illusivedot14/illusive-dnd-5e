import { describe, it, expect } from "vitest";
import { installFoundry } from "./helpers.mjs";
import {
  abilityRangeFeet,
  tokenDistanceFeet,
  listTargetsInRange
} from "../src/application/targeting.mjs";

function scene(size = 100, distance = 5) {
  return { id: "scene1", grid: { size, distance } };
}

function tokenDoc(id, { x = 0, y = 0, width = 1, height = 1, name = id, hidden = false } = {}) {
  return { id, x, y, width, height, name, hidden, actorId: id };
}

describe("abilityRangeFeet", () => {
  it("reads feet from the activity, then the item", () => {
    expect(abilityRangeFeet({ system: { range: { value: 60, units: "ft" } } }, null)).toBe(60);
    expect(abilityRangeFeet(
      { system: { range: { value: 5, units: "ft" } } },
      { range: { value: 120, units: "ft" } }
    )).toBe(120);
  });

  it("treats touch as 5 and unknown as unlimited", () => {
    expect(abilityRangeFeet({ system: { range: { units: "touch" } } }, null)).toBe(5);
    expect(abilityRangeFeet({}, null)).toBe(Infinity);
  });
});

describe("tokenDistanceFeet", () => {
  it("measures center-to-center on the scene grid", () => {
    const map = scene();
    const a = tokenDoc("a", { x: 0, y: 0 });
    const b = tokenDoc("b", { x: 100, y: 0 });
    expect(tokenDistanceFeet(a, b, map)).toBe(5);
  });
});

describe("listTargetsInRange", () => {
  it("skips the caster, hidden tokens, and anyone past the reach", () => {
    installFoundry();
    const map = scene();
    const caster = tokenDoc("me", { x: 0, y: 0, name: "Caster" });
    const near = tokenDoc("near", { x: 100, y: 0, name: "Goblin" });
    const far = tokenDoc("far", { x: 2000, y: 0, name: "Dragon" });
    const hidden = tokenDoc("hid", { x: 100, y: 0, name: "Sneak", hidden: true });
    map.tokens = [caster, near, far, hidden];

    const rows = listTargetsInRange(caster, { system: { range: { value: 5, units: "ft" } } }, null, map);
    expect(rows.map((row) => row.id)).toEqual(["near"]);
    expect(rows[0].feet).toBe(5);
  });
});
