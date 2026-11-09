import { describe, it, expect, beforeEach, vi } from "vitest";
import { installFoundry, makeActor } from "./helpers.mjs";
import {
  challengeConcentrationAfterDamage,
  hasConcentration
} from "../src/application/combat-actions.mjs";

describe("concentration after damage", () => {
  beforeEach(() => installFoundry());

  it("skips when not concentrating or no damage", async () => {
    const actor = makeActor();
    expect(await challengeConcentrationAfterDamage(actor, 12)).toBe(null);
    expect(await challengeConcentrationAfterDamage({
      ...makeActor(),
      concentration: { effects: [{}] },
      effects: []
    }, 0)).toBe(null);
  });

  it("drops concentration on a failed manual con save", async () => {
    const endConcentration = vi.fn(async () => {});
    const actor = {
      ...makeActor({ id: "wiz", isOwner: true }),
      concentration: { effects: [{ id: "conc" }] },
      effects: [{ statuses: new Set(["concentrating"]) }],
      endConcentration,
      rollSavingThrow: vi.fn(async () => [{ total: 5 }])
    };

    expect(hasConcentration(actor)).toBe(true);
    const result = await challengeConcentrationAfterDamage(actor, 22);
    expect(result).toMatchObject({ checked: true, dropped: true, dc: 11 });
    expect(endConcentration).toHaveBeenCalled();
  });

  it("keeps concentration on a successful save", async () => {
    const endConcentration = vi.fn(async () => {});
    const actor = {
      ...makeActor({ id: "wiz" }),
      concentration: { effects: [{ id: "conc" }] },
      effects: [{ statuses: new Set(["concentrating"]) }],
      endConcentration,
      rollSavingThrow: vi.fn(async () => [{ total: 18 }])
    };

    const result = await challengeConcentrationAfterDamage(actor, 8);
    expect(result).toMatchObject({ checked: true, dropped: false, dc: 10 });
    expect(endConcentration).not.toHaveBeenCalled();
  });
});
