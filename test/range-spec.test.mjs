import { describe, it, expect, beforeEach } from "vitest";
import { installFoundry, makeToken } from "./helpers.mjs";
import { rangeIssue, tooClose, combinePlanarVertical } from "../src/domain/spatial/range.mjs";
import {
  resolveRangeSpec,
  checkAbilityRange,
  measureTokenDistance,
  evaluateTargetRange
} from "../src/application/range.mjs";

describe("rangeIssue", () => {
  it("returns null within normal range", () => {
    expect(rangeIssue({ value: 30 }, { value: 30, long: 120 })).toBeNull();
  });

  it("returns longRange between normal and long", () => {
    expect(rangeIssue({ value: 80 }, { value: 30, long: 120 })).toBe("longRange");
  });

  it("returns outOfRange beyond long", () => {
    expect(rangeIssue({ value: 130 }, { value: 30, long: 120 })).toBe("outOfRange");
  });

  it("treats melee (no long) as hard cutoff", () => {
    expect(rangeIssue({ value: 10 }, { value: 5 })).toBe("outOfRange");
  });
});

describe("tooClose / elevation combine", () => {
  it("flags minimum range", () => {
    expect(tooClose({ value: 60 }, { value: 60 })).toBe(true);
    expect(tooClose({ value: 61 }, { value: 60 })).toBe(false);
  });

  it("combines planar and vertical with Chebyshev", () => {
    expect(combinePlanarVertical(5, 10)).toBe(10);
    expect(combinePlanarVertical(15, 5)).toBe(15);
  });
});

describe("resolveRangeSpec", () => {
  it("uses reach only for melee weapons (ignores long)", () => {
    const item = {
      type: "weapon",
      system: {
        actionType: "mwak",
        type: { value: "simpleM" },
        range: { value: 20, long: 60, reach: 5, units: "ft" },
        properties: { has: (k) => k === "thr" }
      }
    };
    // Without attack mode on throwable: max(reach, value) with long kept for thrown option.
    const unknown = resolveRangeSpec({ type: "attack", attack: { type: { value: "melee" } } }, item);
    expect(unknown.value).toBe(20);
    expect(unknown.long).toBe(60);

    const meleeMode = resolveRangeSpec(
      { type: "attack", attack: { type: { value: "melee" } } },
      item,
      { attackMode: "oneHanded" }
    );
    expect(meleeMode).toMatchObject({ kind: "melee", value: 5, long: null });

    const thrownMode = resolveRangeSpec(
      { type: "attack", attack: { type: { value: "melee" } } },
      item,
      { attackMode: "thrown" }
    );
    expect(thrownMode).toMatchObject({ kind: "ranged", value: 20, long: 60 });
  });

  it("uses value+long for ranged weapons", () => {
    const item = {
      type: "weapon",
      system: {
        actionType: "rwak",
        range: { value: 80, long: 320, units: "ft" }
      }
    };
    const activity = { type: "attack", attack: { type: { value: "ranged" } }, range: { value: 80, long: 320, units: "ft" } };
    expect(resolveRangeSpec(activity, item)).toMatchObject({
      kind: "ranged",
      value: 80,
      long: 320
    });
  });

  it("defaults melee reach to 5", () => {
    const activity = { type: "attack", attack: { type: { value: "melee" } }, range: {} };
    expect(resolveRangeSpec(activity, { type: "weapon", system: { actionType: "mwak", range: {} } }).value).toBe(5);
  });

  it("maps touch to 5 ft (or weapon reach)", () => {
    expect(resolveRangeSpec({ range: { units: "touch" } }, null).value).toBe(5);
    expect(resolveRangeSpec(
      { range: { units: "touch" } },
      { system: { range: { reach: 10 } } }
    ).value).toBe(10);
  });
});

describe("checkAbilityRange bands", () => {
  beforeEach(() => {
    installFoundry({
      scene: { id: "scene1", grid: { size: 100, distance: 5 } },
      targets: []
    });
    canvas.scene = { id: "scene1", grid: { size: 100, distance: 5, units: "ft" } };
  });

  function place(id, x, y, size = 1) {
    const token = makeToken({ id });
    token.document.x = x;
    token.document.y = y;
    token.document.width = size;
    token.document.height = size;
    token.document.elevation = 0;
    token.x = x;
    token.y = y;
    return token;
  }

  it("allows long-range band without failing the gate", () => {
    const origin = place("a", 0, 0);
    const target = place("b", 1600, 0); // 80 ft (16 squares)
    installFoundry({
      scene: { id: "scene1", grid: { size: 100, distance: 5 } },
      targets: [target]
    });
    canvas.scene = { id: "scene1", grid: { size: 100, distance: 5, units: "ft" } };

    const activity = {
      type: "attack",
      attack: { type: { value: "ranged" } },
      range: { value: 30, long: 120, units: "ft" }
    };
    const result = checkAbilityRange(origin, { type: "weapon", system: { actionType: "rwak", range: { value: 30, long: 120 } } }, activity);
    expect(result.inRange).toBe(true);
    expect(result.result).toBe("long");
    expect(result.reason).toBe("longRange");
  });

  it("fails beyond long range", () => {
    const origin = place("a", 0, 0);
    const target = place("b", 3000, 0); // 150 ft
    installFoundry({
      scene: { id: "scene1", grid: { size: 100, distance: 5 } },
      targets: [target]
    });
    canvas.scene = { id: "scene1", grid: { size: 100, distance: 5, units: "ft" } };
    const activity = {
      type: "attack",
      attack: { type: { value: "ranged" } },
      range: { value: 30, long: 120, units: "ft" }
    };
    const result = checkAbilityRange(origin, null, activity);
    expect(result.inRange).toBe(false);
    expect(result.reason).toBe("outOfRange");
  });

  it("counts elevation so flying foes are not adjacent", () => {
    const origin = place("a", 0, 0);
    const flyer = place("b", 100, 0); // adjacent on XY
    flyer.document.elevation = 60;
    // Ground medium occupies elev 0–5; flyer feet at 60 → vertical gap 55.
    const measured = measureTokenDistance(origin.document, flyer.document, canvas.scene);
    expect(measured.value).toBe(55);

    const melee = evaluateTargetRange(origin.document, flyer.document, {
      type: "attack",
      attack: { type: { value: "melee" } },
      range: { reach: 5, units: "ft" }
    }, { type: "weapon", system: { actionType: "mwak", range: { reach: 5 } } }, { scene: canvas.scene });
    expect(melee.inRange).toBe(false);
  });
});
