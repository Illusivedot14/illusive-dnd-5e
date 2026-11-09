import { describe, it, expect } from "vitest";
import { installFoundry, makeActor } from "./helpers.mjs";
import { buildSpellSlotDiamonds } from "../src/hud/components/action-bar/action-bar-groups.mjs";

describe("buildSpellSlotDiamonds", () => {
  it("returns filled remaining then hollow used diamonds", () => {
    installFoundry();
    const actor = makeActor({
      spells: { spell1: { value: 2, max: 4 } }
    });
    expect(buildSpellSlotDiamonds(actor, 1)).toEqual([
      { filled: true },
      { filled: true },
      { filled: false },
      { filled: false }
    ]);
  });

  it("returns null for cantrips or missing slots", () => {
    installFoundry();
    const actor = makeActor({ spells: { spell1: { value: 1, max: 1 } } });
    expect(buildSpellSlotDiamonds(actor, 0)).toBeNull();
    expect(buildSpellSlotDiamonds(actor, 2)).toBeNull();
  });

  it("clamps remaining within max", () => {
    installFoundry();
    const actor = makeActor({
      spells: { spell3: { value: 9, max: 3 } }
    });
    expect(buildSpellSlotDiamonds(actor, 3)).toEqual([
      { filled: true },
      { filled: true },
      { filled: true }
    ]);
  });
});
