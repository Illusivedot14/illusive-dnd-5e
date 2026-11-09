import { describe, it, expect } from "vitest";
import {
  pointInTemplateShape,
  shapePolygonPoints,
  directionToPoint,
  feetBetweenPoints,
  templateShapeForArea,
  shapesForAreaTarget,
  regionShapeData
} from "../src/domain/combat/template-shape.mjs";

const grid = { gridSize: 100, gridDistance: 5 };

describe("template shape", () => {
  it("measures feet between points", () => {
    expect(feetBetweenPoints({ x: 0, y: 0 }, { x: 200, y: 0 }, grid)).toBe(10);
  });

  it("circle contains points inside radius", () => {
    const shape = { t: "circle", x: 0, y: 0, distance: 20, direction: 0 };
    expect(pointInTemplateShape(shape, { x: 100, y: 0 }, grid)).toBe(true); // 5 ft
    expect(pointInTemplateShape(shape, { x: 500, y: 0 }, grid)).toBe(false); // 25 ft
  });

  it("cone is directional", () => {
    const shape = { t: "cone", x: 0, y: 0, distance: 30, direction: 0, angle: 53.13 };
    expect(pointInTemplateShape(shape, { x: 200, y: 0 }, grid)).toBe(true);
    expect(pointInTemplateShape(shape, { x: -200, y: 0 }, grid)).toBe(false);
  });

  it("builds polygon points for preview", () => {
    const circle = shapePolygonPoints({ t: "circle", distance: 15, direction: 0 }, grid);
    expect(circle.length).toBeGreaterThan(8);
    const cone = shapePolygonPoints({ t: "cone", distance: 15, direction: 90, angle: 53 }, grid);
    expect(cone[0]).toEqual([0, 0]);
  });

  it("directionToPoint is 0 along +x", () => {
    expect(directionToPoint({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(0, 5);
  });

  it("cubes are squares from their top-left corner", () => {
    const cube = { t: "rect", x: 0, y: 0, distance: 15 };
    expect(pointInTemplateShape(cube, { x: 290, y: 290 }, grid)).toBe(true);
    expect(pointInTemplateShape(cube, { x: 310, y: 50 }, grid)).toBe(false);
    expect(pointInTemplateShape(cube, { x: -10, y: 50 }, grid)).toBe(false);
  });

  it("emanations extend from the token edge, not its centre", () => {
    const aura = { t: "emanation", x: 50, y: 50, distance: 10, baseWidth: 100, baseHeight: 100 };
    expect(pointInTemplateShape(aura, { x: 50 + 50 + 190, y: 50 }, grid)).toBe(true); // 9.5 ft past the edge
    expect(pointInTemplateShape(aura, { x: 50 + 50 + 210, y: 50 }, grid)).toBe(false);
    expect(shapePolygonPoints(aura, grid).length).toBeGreaterThan(40);
  });
});

describe("dnd5e 6 area targets", () => {
  it("maps dnd5e area types to preview shapes", () => {
    expect(templateShapeForArea("sphere")).toBe("circle");
    expect(templateShapeForArea("cube")).toBe("rect");
    expect(templateShapeForArea("line")).toBe("ray");
    expect(templateShapeForArea("radius")).toBe("emanation");
    expect(templateShapeForArea("nonsense")).toBe(null);
  });

  it("builds one shape per template count with line width and cone angle", () => {
    const lines = shapesForAreaTarget({ type: "line", size: 100, width: 5, count: 2 }, { gridDistance: 5 });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ t: "ray", distance: 100, width: 5 });
    expect(shapesForAreaTarget({ type: "cone", size: 15 }, { coneAngle: 60 })[0].angle).toBe(60);
    expect(shapesForAreaTarget({ type: "" })).toEqual([]);
  });

  it("converts feet shapes to Region shape data in pixels", () => {
    expect(regionShapeData({ t: "circle", x: 10, y: 20, distance: 20 }, grid))
      .toEqual({ type: "circle", x: 10, y: 20, radius: 400 });
    expect(regionShapeData({ t: "ray", x: 0, y: 0, distance: 60, width: 5, direction: 90 }, grid))
      .toEqual({ type: "line", x: 0, y: 0, length: 1200, width: 100, rotation: 90 });
    expect(regionShapeData({ t: "cone", x: 0, y: 0, distance: 15, angle: 53.13, direction: 45 }, grid))
      .toMatchObject({ type: "cone", radius: 300, angle: 53.13, rotation: 45 });
    expect(regionShapeData({ t: "rect", x: 100, y: 200, distance: 15 }, grid))
      .toEqual({ type: "rectangle", x: 100, y: 200, width: 300, height: 300, rotation: 0 });
  });

  it("emanations wrap the caster token, or fall back to a circle without one", () => {
    const shape = { t: "emanation", x: 150, y: 150, distance: 15, baseWidth: 100, baseHeight: 100 };
    expect(regionShapeData(shape, grid, { x: 100, y: 100, width: 1, height: 1, shape: 4 })).toEqual({
      type: "emanation",
      radius: 300,
      base: { type: "token", x: 100, y: 100, width: 1, height: 1, shape: 4 }
    });
    expect(regionShapeData(shape, grid)).toEqual({ type: "circle", x: 150, y: 150, radius: 350 });
  });
});
