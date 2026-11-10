import { describe, it, expect } from "vitest";
import {
  normalizeOverTime,
  listOverTimeEffects
} from "../src/domain/combat/overtime.mjs";
import {
  normalizeSpecialDurations,
  listEffectsExpiringOn,
  SPECIAL_DURATIONS
} from "../src/domain/combat/special-duration.mjs";
import { isFlanking, footprintsAdjacent } from "../src/domain/combat/flanking.mjs";
import { AURA_CATALOG, findAuraFeatures } from "../src/domain/combat/aura-effects.mjs";
import { CONTENT } from "../src/content/declarations.mjs";
import {
  collectToggleAttackModifiers,
  listPassiveHitRiders,
  hasRecklessAttack
} from "../src/application/feature-toggles.mjs";
import { collectAttackModifiers } from "../src/application/roll-modifiers.mjs";

describe("overTime", () => {
  it("lists Illusive overTime effects for a turn", () => {
    const actor = {
      effects: [{
        id: "1",
        name: "Burning",
        disabled: false,
        flags: {
          "illusive-dnd-5e": {
            overTime: { turn: "start", damageFormula: "1d4", damageType: "fire" }
          }
        }
      }]
    };
    expect(listOverTimeEffects(actor, "start")).toHaveLength(1);
    expect(listOverTimeEffects(actor, "end")).toHaveLength(0);
    expect(normalizeOverTime({ turn: "end", damageFormula: "1d6" }).turn).toBe("end");
  });
});

describe("special durations", () => {
  it("normalizes and finds expiring effects", () => {
    expect(normalizeSpecialDurations(["nextAttack", "bogus"])).toEqual(["nextAttack"]);
    expect(SPECIAL_DURATIONS).toContain("combatEnd");
    const actor = {
      effects: [{
        id: "a",
        disabled: false,
        flags: { "illusive-dnd-5e": { specialDuration: ["isAttacked", "turnStart"] } }
      }]
    };
    expect(listEffectsExpiringOn(actor, "isAttacked")).toHaveLength(1);
    expect(listEffectsExpiringOn(actor, "longRest")).toHaveLength(0);
  });

  it("expires source-turn durations only for effects from that source", () => {
    const effect = (id, origin) => ({
      id,
      disabled: false,
      origin,
      flags: { "illusive-dnd-5e": { specialDuration: ["turnStartSource"] } }
    });
    const target = {
      effects: [
        effect("mine", "Actor.cleric.Item.bolt"),
        effect("theirs", "Actor.wizard.Item.mockery")
      ]
    };
    const expiring = listEffectsExpiringOn(target, "turnStartSource", "illusive-dnd-5e", { sourceUuid: "Actor.cleric" });
    expect(expiring.map((e) => e.id)).toEqual(["mine"]);
    expect(listEffectsExpiringOn(target, "turnStartSource", "illusive-dnd-5e", { sourceUuid: "Actor.cler" })).toHaveLength(0);
  });
});

describe("flanking", () => {
  it("detects opposite-side allies", () => {
    expect(footprintsAdjacent(
      { col: 0, row: 0, width: 1, height: 1 },
      { col: 1, row: 0, width: 1, height: 1 }
    )).toBe(true);
    expect(isFlanking(
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      [{ x: 100, y: 0 }]
    )).toBe(true);
    expect(isFlanking(
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      [{ x: 10, y: 0 }]
    )).toBe(false);
  });
});

describe("expanded auras", () => {
  it("includes Spirit Guardians and finds it on an actor", () => {
    expect(AURA_CATALOG.some((a) => a.id === "spirit-guardians")).toBe(true);
    const actor = {
      items: [{ name: "Spirit Guardians", system: { identifier: "spirit-guardians" } }]
    };
    const found = findAuraFeatures(actor);
    expect(found[0].spec.damaging.turn).toBe("start");
  });
});

describe("reaction catalog", () => {
  it("registers defense and disrupt reactions", () => {
    const declared = new Set(CONTENT.flatMap((c) => c.declarations.map((d) => d.id)));
    for (const id of ["absorb-elements", "uncanny-dodge", "silvery-barbs", "cutting-words", "deflect"]) {
      expect(declared.has(id), id).toBe(true);
    }
  });
});

describe("feature toggles", () => {
  it("detects Reckless and applies GWM bonus when toggled", () => {
    const actor = {
      items: [
        { name: "Reckless Attack", system: { identifier: "reckless-attack" } },
        { name: "Great Weapon Master", system: { identifier: "great-weapon-master" } }
      ],
      getFlag: () => ({ reckless: true, greatWeaponMaster: true, sharpshooter: false })
    };
    expect(hasRecklessAttack(actor)).toBe(true);
    const mods = collectToggleAttackModifiers(actor, {
      system: { actionType: "mwak", properties: { has: (k) => k === "hvy" } }
    });
    expect(mods.advantage).toBe(true);
    expect(mods.attackBonus).toBe(-5);
    expect(mods.damageBonus).toBe(10);
  });

  it("lists Colossus Slayer", () => {
    const actor = {
      items: [{ name: "Colossus Slayer", system: { identifier: "colossus-slayer" } }],
      system: { details: { level: 5 } }
    };
    expect(listPassiveHitRiders(actor).map((r) => r.id)).toContain("colossus-slayer");
  });
});

describe("grant advantage", () => {
  it("gives advantage vs Faerie Fire", () => {
    const mods = collectAttackModifiers({
      attacker: { statuses: new Set() },
      defender: {
        statuses: new Set(),
        effects: [{ name: "Faerie Fire", disabled: false }]
      }
    });
    expect(mods.advantage).toBe(true);
    expect(mods.reasons).toContain("grant-advantage");
  });
});
