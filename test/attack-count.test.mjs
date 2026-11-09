import { describe, it, expect, beforeEach } from "vitest";
import { installFoundry, makeActor } from "./helpers.mjs";
import {
  getCantripProjectileCount,
  getWeaponAttackCount,
  getAbilityAttackCount,
  remainingWeaponAttacks,
  padTargetUuids,
  isSingleUseMultiHit,
  isRepeatedWeaponAttack
} from "../src/domain/combat/attack-count.mjs";

describe("attack-count", () => {
  beforeEach(() => installFoundry());

  it("scales Eldritch Blast by character level", () => {
    const blast = { type: "spell", name: "Eldritch Blast", system: { level: 0, identifier: "eldritch-blast" } };
    expect(getCantripProjectileCount(makeActor({ system: { details: { level: 1 } } }), blast)).toBe(1);
    expect(getCantripProjectileCount(makeActor({ system: { details: { level: 5 } } }), blast)).toBe(2);
    expect(getCantripProjectileCount(makeActor({ system: { details: { level: 11 } } }), blast)).toBe(3);
    expect(getCantripProjectileCount(makeActor({ system: { details: { level: 17 } } }), blast)).toBe(4);
  });

  it("does not add beams to other cantrips", () => {
    const bolt = { type: "spell", name: "Fire Bolt", system: { level: 0 } };
    expect(getCantripProjectileCount(makeActor({ system: { details: { level: 17 } } }), bolt)).toBe(1);
  });

  it("counts Extra Attack on the actor", () => {
    expect(getWeaponAttackCount(makeActor())).toBe(1);
    expect(getWeaponAttackCount(makeActor({
      items: [{ name: "Extra Attack", type: "feat", system: { identifier: "extra-attack" } }]
    }))).toBe(2);
    expect(getWeaponAttackCount(makeActor({
      items: [{ name: "Extra Attack (2)", type: "feat" }]
    }))).toBe(3);
  });

  it("uses the activity count formula when it is more than one", () => {
    const actor = makeActor();
    expect(getAbilityAttackCount(actor, { type: "spell", system: { level: 2 } }, {
      target: { affects: { count: 3 } }
    })).toBe(3);
  });

  it("treats spells as one use and weapons as repeated swings", () => {
    expect(isSingleUseMultiHit({ type: "spell" }, { type: "attack" })).toBe(true);
    expect(isRepeatedWeaponAttack({ type: "weapon" }, { type: "attack" })).toBe(true);
    expect(isRepeatedWeaponAttack({ type: "spell" }, { type: "attack" })).toBe(false);
  });

  it("pads a single target uuid out to the beam count", () => {
    expect(padTargetUuids(["Token.1"], 3)).toEqual(["Token.1", "Token.1", "Token.1"]);
    expect(padTargetUuids(["A", "B"], 2)).toEqual(["A", "B"]);
  });

  it("tracks remaining weapon attacks from the HUD flag", () => {
    const actor = makeActor({
      items: [{ name: "Extra Attack", type: "feat" }],
      flags: { "illusive-dnd-5e": { weaponSwings: 1 } }
    });
    expect(remainingWeaponAttacks(actor)).toBe(1);
  });
});
