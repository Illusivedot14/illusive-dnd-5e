import { describe, it, expect } from "vitest";
import {
  tokenBorderPoint,
  directionToward,
  templateAnchorMode
} from "../src/domain/combat/template-anchor.mjs";

describe("tokenBorderPoint", () => {
  const token = { center: { x: 100, y: 100 }, w: 100, h: 100 };

  it("hits the east edge when aiming right", () => {
    const p = tokenBorderPoint(token, 500, 100);
    expect(p.x).toBeCloseTo(150, 5);
    expect(p.y).toBeCloseTo(100, 5);
  });

  it("hits the north edge when aiming up", () => {
    const p = tokenBorderPoint(token, 100, -200);
    expect(p.x).toBeCloseTo(100, 5);
    expect(p.y).toBeCloseTo(50, 5);
  });

  it("defaults to east edge when target is center", () => {
    const p = tokenBorderPoint(token, 100, 100);
    expect(p.x).toBeCloseTo(150, 5);
  });
});

describe("directionToward", () => {
  it("is 0 along +x", () => {
    expect(directionToward({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(0, 5);
  });
});

describe("templateAnchorMode", () => {
  it("anchors self cones to edge", () => {
    expect(templateAnchorMode({
      range: { units: "self" },
      target: { template: { type: "cone", size: 15 } }
    })).toBe("edge");
  });

  it("anchors self lines to edge", () => {
    expect(templateAnchorMode({
      range: { units: "self" },
      target: { template: { type: "line", size: 100 } }
    }, { t: "ray" })).toBe("edge");
  });

  it("anchors self emanations to center", () => {
    expect(templateAnchorMode({
      range: { units: "self" },
      target: { template: { type: "radius", size: 15 } }
    })).toBe("center");
  });

  it("leaves ranged spheres free (Fireball)", () => {
    expect(templateAnchorMode({
      range: { units: "ft", value: 150 },
      target: { template: { type: "sphere", size: 20 } }
    }, { t: "circle" })).toBe(null);
  });
});
