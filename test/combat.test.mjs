import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { installFoundry, makeActor, makeCombat, makeCombatant, makeGroup } from "./helpers.mjs";
import {
  getActiveCombatant,
  getSortedCombatants,
  getSceneCombats,
  getViewedCombat,
  getCombatUnits
} from "../src/foundry/combat.mjs";

/** Four solo combatants A(20) B(15) C(10) D(5). */
function fourCombatants() {
  return [
    makeCombatant({ id: "A", name: "A", initiative: 20, actor: makeActor() }),
    makeCombatant({ id: "B", name: "B", initiative: 15, actor: makeActor() }),
    makeCombatant({ id: "C", name: "C", initiative: 10, actor: makeActor() }),
    makeCombatant({ id: "D", name: "D", initiative: 5, actor: makeActor() })
  ];
}

describe("getActiveCombatant", () => {
  beforeEach(() => {
    installFoundry({ isGM: true });
  });

  it("reads the live turn pointer, ignoring a lagging combat.combatant", () => {
    const combatants = fourCombatants();
    // combat.combatant lags at A, but turns[1] is B — the pointer wins.
    const combat = makeCombat({ turn: 1, combatants, active: combatants[0] });
    expect(getActiveCombatant(combat).id).toBe("B");
  });

  it("resolves the combatant at the current turn index", () => {
    const combatants = fourCombatants();
    const combat = makeCombat({ turn: 2, combatants });
    expect(getActiveCombatant(combat).id).toBe("C");
  });

  it("falls back to combat.combatant before the turn pointer is set", () => {
    const combatants = fourCombatants();
    const combat = makeCombat({ turn: null, combatants, active: combatants[2] });
    expect(getActiveCombatant(combat).id).toBe("C");
  });
});

describe("getSortedCombatants", () => {
  it("sorts by initiative descending and shows hidden combatants to the GM", () => {
    const combat = makeCombat({
      combatants: [
        makeCombatant({ id: "A", initiative: 20 }),
        makeCombatant({ id: "H", initiative: 15, hidden: true }),
        makeCombatant({ id: "C", initiative: 10 })
      ]
    });
    installFoundry({ isGM: true, combat });
    expect(getSortedCombatants(combat).map((c) => c.id)).toEqual(["A", "H", "C"]);
  });

  it("hides GM-concealed combatants from players", () => {
    const combat = makeCombat({
      combatants: [
        makeCombatant({ id: "A", initiative: 20 }),
        makeCombatant({ id: "H", initiative: 15, hidden: true }),
        makeCombatant({ id: "C", initiative: 10 })
      ]
    });
    installFoundry({ isGM: false, combat });
    expect(getSortedCombatants(combat).map((c) => c.id)).toEqual(["A", "C"]);
  });
});

describe("getSceneCombats", () => {
  it("returns only combats belonging to the current scene", () => {
    const c1 = makeCombat({ id: "c1", sceneId: "scene1" });
    const c2 = makeCombat({ id: "c2", sceneId: "scene2" });
    installFoundry({ combats: [c1, c2], scene: { id: "scene1" } });
    expect(getSceneCombats().map((c) => c.id)).toEqual(["c1"]);
  });

  it("falls back to all combats when none match the scene", () => {
    const c1 = makeCombat({ id: "c1", sceneId: "sceneX" });
    const c2 = makeCombat({ id: "c2", sceneId: "sceneY" });
    installFoundry({ combats: [c1, c2], scene: { id: "scene1" } });
    expect(getSceneCombats().map((c) => c.id)).toEqual(["c1", "c2"]);
  });
});

describe("getViewedCombat", () => {
  it("prefers game.combat", () => {
    const combat = makeCombat({ id: "active" });
    installFoundry({ combat });
    expect(getViewedCombat()).toBe(combat);
  });

  it("falls back to game.combats.viewed", () => {
    const combat = makeCombat({ id: "viewed" });
    const handles = installFoundry({ combat: null, combats: [combat] });
    handles.game.combat = null;
    handles.game.combats.viewed = combat;
    expect(getViewedCombat()).toBe(combat);
  });

  it("resolves a scene combat when nothing is explicitly viewed", () => {
    const combat = makeCombat({ id: "scenebound", sceneId: "scene1" });
    installFoundry({ combat: null, combats: [], sceneCombats: [combat], scene: { id: "scene1" } });
    expect(getViewedCombat()).toBe(combat);
  });

  it("returns null when game.combat throws after the encounter was deleted", () => {
    const handles = installFoundry({ combat: null, combats: [] });
    Object.defineProperty(handles.game, "combat", {
      configurable: true,
      get() {
        throw new Error("The Combat PW6HsdgJhZZsWyKD does not exist in combats");
      }
    });
    expect(getViewedCombat()).toBeNull();
  });

  it("ignores a stale combat document that is no longer in the collection", () => {
    const stale = makeCombat({ id: "gone" });
    installFoundry({ combat: stale, combats: [] });
    expect(getViewedCombat()).toBeNull();
  });
});

describe("getCombatUnits", () => {
  beforeEach(() => installFoundry({ isGM: true }));

  it("wraps solo combatants as combatant units", () => {
    const combat = makeCombat({ combatants: fourCombatants() });
    const units = getCombatUnits(combat);
    expect(units.map((u) => u.id)).toEqual(["A", "B", "C", "D"]);
    expect(units.every((u) => u.kind === "combatant")).toBe(true);
    expect(units[0].memberIds).toEqual(["A"]);
  });

  it("collapses grouped combatants into a single group unit", () => {
    const b = makeCombatant({ id: "B", initiative: 15, groupId: "g1", actor: makeActor() });
    const c = makeCombatant({ id: "C", initiative: 10, groupId: "g1", actor: makeActor() });
    const group = makeGroup({ id: "g1", name: "Goblins", members: [b, c] });
    const combat = makeCombat({
      combatants: [makeCombatant({ id: "A", initiative: 20, actor: makeActor() }), b, c],
      groups: [group]
    });

    const units = getCombatUnits(combat);
    expect(units.map((u) => u.id)).toEqual(["A", "group:g1"]);
    const groupUnit = units[1];
    expect(groupUnit.kind).toBe("group");
    expect(groupUnit.memberIds).toEqual(["B", "C"]);
  });
});
