import { describe, it, expect } from "vitest";
import { movementSpeed, primarySpeed, senseRange } from "../src/domain/combat/actor-paths.mjs";
import { spellSlotKeyForLevel } from "../src/foundry/dnd5e-adapter.mjs";

describe("dnd5e 6 actor paths", () => {
  it("reads speeds from movement.speeds with the flat shim as fallback", () => {
    expect(movementSpeed({ speeds: { walk: 30, fly: 60 } }, "fly")).toBe(60);
    expect(movementSpeed({ walk: 25 }, "walk")).toBe(25);
    expect(movementSpeed(null, "walk")).toBe(0);
    expect(primarySpeed({ speeds: { walk: 0, fly: 0, swim: 40 } })).toBe(40);
  });

  it("reads senses from senses.ranges with the flat shim as fallback", () => {
    expect(senseRange({ ranges: { darkvision: 60 } }, "darkvision")).toBe(60);
    expect(senseRange({ blindsight: 10 }, "blindsight")).toBe(10);
    expect(senseRange(undefined, "truesight")).toBe(0);
  });
});

describe("spell slot keys", () => {
  const actor = {
    system: {
      spells: {
        spell2: { value: 0, max: 3 },
        spell3: { value: 2, max: 3 },
        pact: { value: 1, max: 2, level: 2 }
      }
    }
  };

  it("maps a level to the dnd5e slot key", () => {
    expect(spellSlotKeyForLevel(actor, 3)).toBe("spell3");
  });

  it("uses the pact slot when regular slots of that level are spent", () => {
    expect(spellSlotKeyForLevel(actor, 2)).toBe("pact");
  });

  it("passes through explicit keys and ignores cantrip levels", () => {
    expect(spellSlotKeyForLevel(actor, "pact")).toBe("pact");
    expect(spellSlotKeyForLevel(actor, "4")).toBe("spell4");
    expect(spellSlotKeyForLevel(actor, 0)).toBe(null);
  });
});
