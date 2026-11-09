import { describe, it, expect, beforeEach } from "vitest";
import { installFoundry, makeActor, makeCombat, makeCombatant } from "./helpers.mjs";
import { buildUnitData } from "../src/foundry/actor-data.mjs";
import {
  getCarouselCombatants,
  getCarouselRoundDisplay,
  getCarouselLayout
} from "../src/hud/components/turn-tracker/carousel-layout.mjs";

/** Four solo combatants A(20) B(15) C(10) D(5). */
function fourCombatants() {
  return [
    makeCombatant({ id: "A", name: "A", initiative: 20, actor: makeActor() }),
    makeCombatant({ id: "B", name: "B", initiative: 15, actor: makeActor() }),
    makeCombatant({ id: "C", name: "C", initiative: 10, actor: makeActor() }),
    makeCombatant({ id: "D", name: "D", initiative: 5, actor: makeActor() })
  ];
}

describe("getCarouselCombatants (rotation)", () => {
  it("returns every unit in natural order when combat has not started", () => {
    installFoundry({ isGM: true });
    const combat = makeCombat({ started: false, combatants: fourCombatants() });
    expect(getCarouselCombatants(combat).map((u) => u.id)).toEqual(["A", "B", "C", "D"]);
  });

  it("rotates the ring so the active combatant is first (front slot)", () => {
    installFoundry({ isGM: true });
    const combat = makeCombat({ started: true, turn: 1, combatants: fourCombatants() });
    // Active is B (turn 1): B first, wrapping around to A last.
    expect(getCarouselCombatants(combat).map((u) => u.id)).toEqual(["B", "C", "D", "A"]);
  });
});

describe("getCarouselRoundDisplay", () => {
  it("shows the next round (separator sits at the tail)", () => {
    installFoundry({ isGM: true });
    const combat = makeCombat({ round: 3, turn: 0, combatants: fourCombatants() });
    expect(getCarouselRoundDisplay(combat)).toBe(4);
  });
});

describe("getCarouselLayout", () => {
  beforeEach(() => installFoundry({ isGM: true }));

  it("returns null for an empty combat", () => {
    const combat = makeCombat({ combatants: [] });
    expect(getCarouselLayout(combat, buildUnitData)).toBeNull();
  });

  it("builds ordered card data, a separator order, and a GM signature", () => {
    const combat = makeCombat({ turn: 0, combatants: fourCombatants() });
    const layout = getCarouselLayout(combat, buildUnitData);

    expect(layout.combatants).toHaveLength(4);
    const orderById = Object.fromEntries(layout.combatants.map((c) => [c.id, c.order]));
    expect(orderById).toEqual({ A: 0, B: 100, C: 200, D: 300 });

    // A is active (leftmost), so the round separator lands after D.
    expect(layout.separatorOrder).toBe(350);
    expect(layout.signature.startsWith("gm")).toBe(true);
    expect(layout.combatantIds).toEqual(["A", "B", "C", "D"]);
  });

  it("marks the fresh-turn combatant active even when combat.combatant lags", () => {
    const combatants = fourCombatants();
    const combat = makeCombat({ turn: 1, combatants, active: combatants[0] });
    const layout = getCarouselLayout(combat, buildUnitData);
    expect(layout.combatants.find((c) => c.isActive)?.id).toBe("B");
  });

  it("excludes GM-concealed combatants from a player's card set", () => {
    const combatants = [
      makeCombatant({ id: "A", initiative: 20, actor: makeActor() }),
      makeCombatant({ id: "H", initiative: 15, hidden: true, actor: makeActor() }),
      makeCombatant({ id: "C", initiative: 10, actor: makeActor() })
    ];
    const combat = makeCombat({ turn: 0, combatants });
    installFoundry({ isGM: false, combat });

    const layout = getCarouselLayout(combat, buildUnitData);
    expect(layout.combatantIds).toEqual(["A", "C"]);
    expect(layout.signature.startsWith("pc")).toBe(true);
  });

  it("returns null when no combatants are visible to the viewer", () => {
    const combatants = [
      makeCombatant({ id: "H1", initiative: 20, hidden: true, actor: makeActor() }),
      makeCombatant({ id: "H2", initiative: 10, hidden: true, actor: makeActor() })
    ];
    installFoundry({ isGM: false, combat: makeCombat({ started: true, combatants }) });
    expect(getCarouselLayout(makeCombat({ started: true, combatants }), buildUnitData)).toBeNull();
  });
});
