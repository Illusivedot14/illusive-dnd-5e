import { describe, it, expect } from "vitest";
import {
  actorFields,
  changeTouches,
  isActorInspirationChange,
  isActorMovementChange,
  isTokenMovementChange
} from "../src/foundry/document-change.mjs";

describe("document change scope", () => {
  it("treats a step as movement and nothing else", () => {
    const step = { x: 140, y: 0, _movementHistory: [{ x: 0 }, { x: 140, cost: 5 }] };
    expect(isTokenMovementChange(step)).toBe(true);
    expect(changeTouches(step, "name")).toBe(false);
    expect(changeTouches(step, "texture")).toBe(false);
  });

  it("keeps light, name, and aura flags out of movement", () => {
    expect(isTokenMovementChange({ x: 1, light: { dim: 20 } })).toBe(false);
    expect(isTokenMovementChange({ flags: { auras: [] } })).toBe(false);
    expect(changeTouches({ texture: { src: "a.webp" } }, "texture")).toBe(true);
  });

  it("treats only the movement attribute as an actor movement write", () => {
    const movement = { system: { attributes: { movement: { walk: 25 } } } };
    expect(isActorMovementChange(movement)).toBe(true);
    expect(changeTouches(movement, "system.attributes.hp")).toBe(false);

    const hp = { system: { attributes: { hp: { value: 8 } } } };
    expect(isActorMovementChange(hp)).toBe(false);
    expect(changeTouches(hp, "system.attributes.hp")).toBe(true);
  });

  it("treats inspiration as its own change, not a sheet-wide one", () => {
    const inspiration = { system: { attributes: { inspiration: true } } };
    expect(isActorInspirationChange(inspiration)).toBe(true);
    expect(isActorMovementChange(inspiration)).toBe(false);
    expect(isActorInspirationChange({
      system: { attributes: { inspiration: false, hp: { value: 1 } } }
    })).toBe(false);
  });

  it("names each field so one change does not look like the whole actor", () => {
    expect([...actorFields({ system: { attributes: { hp: { value: 4 } } } })]).toEqual(["hp"]);
    expect([...actorFields({ system: { attributes: { ac: { value: 16 } } } })]).toEqual(["ac"]);
    expect(actorFields({
      system: { attributes: { hp: { value: 4 }, inspiration: true } }
    })).toEqual(new Set(["hp", "inspiration"]));
    expect(actorFields({ system: { details: { biography: { value: "x" } } } }).has("unknown")).toBe(true);
  });
});
