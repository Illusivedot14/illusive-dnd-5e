import { describe, it, expect } from "vitest";
import {
  leftReach,
  evaluateOpportunityAttack,
  collectOpportunityCandidates,
  resolveReachFeet
} from "../src/domain/combat/opportunity-attack.mjs";
import {
  coverLevelFromBlockedFraction,
  evaluateCover,
  applyCoverToDefenses,
  bakeCoverIntoAc,
  bakeCoverIntoDexSave,
  isCoverAmbiguous,
  coverResultForLevel,
  COVER_LEVELS
} from "../src/domain/combat/cover.mjs";
import { evaluateAttackTargets } from "../src/domain/combat/attack-outcome.mjs";
import { advanceAction } from "../src/domain/combat/advance-action.mjs";
import { createActionResolution } from "../src/domain/combat/action-state.mjs";
import { levelFeatures } from "../src/application/levels.mjs";
import { getRule } from "../src/rules/catalog.mjs";

describe("opportunity attack domain", () => {
  it("detects leave-reach", () => {
    expect(leftReach({ fromFeet: 5, toFeet: 10, reachFeet: 5 })).toBe(true);
    expect(leftReach({ fromFeet: 5, toFeet: 5, reachFeet: 5 })).toBe(false);
    expect(leftReach({ fromFeet: 10, toFeet: 15, reachFeet: 5 })).toBe(false);
    expect(resolveReachFeet({ weaponReachFeet: 10 })).toBe(10);
  });

  it("provokes when hostile leaves reach with reaction available", () => {
    const result = evaluateOpportunityAttack({
      edition: "2024",
      moverHostile: true,
      observerCanSee: true,
      observerHasReaction: true,
      observerIncapacitated: false,
      moverDisengaging: false,
      fromFeet: 5,
      toFeet: 10,
      reachFeet: 5
    });
    expect(result.provokes).toBe(true);
    expect(result.rule).toBe("combat.opportunity-attack.2024");
  });

  it("does not provoke for Disengage, teleport, or forced movement", () => {
    const base = {
      edition: "2014",
      moverHostile: true,
      observerCanSee: true,
      observerHasReaction: true,
      observerIncapacitated: false,
      fromFeet: 5,
      toFeet: 10,
      reachFeet: 5
    };
    expect(evaluateOpportunityAttack({ ...base, moverDisengaging: true }).reason).toBe("disengage");
    expect(evaluateOpportunityAttack({ ...base, teleport: true }).reason).toBe("teleport");
    expect(evaluateOpportunityAttack({ ...base, forcedMovement: true }).reason).toBe("forced-movement");
    expect(evaluateOpportunityAttack({ ...base, observerCanSee: false }).reason).toBe("cannot-see");
  });

  it("collects only provoking observers", () => {
    const candidates = collectOpportunityCandidates({
      moverUuid: "M",
      edition: "2024",
      moverDisengaging: false,
      observers: [
        {
          uuid: "O1",
          moverHostile: true,
          canSee: true,
          hasReaction: true,
          incapacitated: false,
          fromFeet: 5,
          toFeet: 15,
          reachFeet: 5
        },
        {
          uuid: "O2",
          moverHostile: true,
          canSee: true,
          hasReaction: false,
          incapacitated: false,
          fromFeet: 5,
          toFeet: 15,
          reachFeet: 5
        }
      ]
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].observerUuid).toBe("O1");
  });
});

describe("cover domain", () => {
  it("maps blocked fractions to cover levels", () => {
    expect(coverLevelFromBlockedFraction(0.2)).toBe("none");
    expect(coverLevelFromBlockedFraction(0.5)).toBe("half");
    expect(coverLevelFromBlockedFraction(0.75)).toBe("three-quarters");
    expect(coverLevelFromBlockedFraction(1)).toBe("total");
    expect(coverLevelFromBlockedFraction(0.1, { totalCover: true })).toBe("total");
    expect(COVER_LEVELS).toContain("three-quarters");
  });

  it("flags soft half/three-quarters band as ambiguous", () => {
    expect(isCoverAmbiguous(0.5)).toBe(true);
    expect(isCoverAmbiguous(0.74)).toBe(true);
    expect(isCoverAmbiguous(0.75)).toBe(false);
    expect(isCoverAmbiguous(0.4)).toBe(false);
    expect(isCoverAmbiguous(0.6, { totalCover: true })).toBe(false);
    const half = evaluateCover({ blockedFraction: 0.5 });
    expect(half.ambiguous).toBe(true);
    expect(coverResultForLevel("three-quarters").acBonus).toBe(5);
  });

  it("applies AC and Dex save bonuses", () => {
    const half = evaluateCover({ blockedFraction: 0.5, edition: "2024" });
    expect(half.level).toBe("half");
    expect(half.acBonus).toBe(2);
    expect(half.canTarget).toBe(true);

    const total = evaluateCover({ totalCover: true, edition: "2014" });
    expect(total.level).toBe("total");
    expect(total.canTarget).toBe(false);
    expect(total.rule).toBe("combat.cover.2014");

    const preview = applyCoverToDefenses({ ac: 15, dexSave: 12 }, half);
    expect(preview.ac).toBe(17);
    expect(preview.dexSave).toBe(14);
  });

  it("treats same-square as no cover", () => {
    expect(evaluateCover({ blockedFraction: 0.9, sameSquare: true }).level).toBe("none");
  });

  it("bakes half / three-quarters into AC for the attack hit check", () => {
    const half = evaluateCover({ blockedFraction: 0.5 });
    const threeQ = evaluateCover({ blockedFraction: 0.8 });
    expect(bakeCoverIntoAc(15, half)).toEqual({
      ac: 17,
      acBonus: 2,
      level: "half",
      canTarget: true
    });
    expect(bakeCoverIntoAc(15, threeQ).ac).toBe(20);

    const outcomes = evaluateAttackTargets(
      [{ uuid: "T1", ac: bakeCoverIntoAc(15, half).ac, name: "Covered" }],
      { attackTotal: 16 }
    );
    expect(outcomes[0].hit).toBe(false);
    expect(evaluateAttackTargets(
      [{ uuid: "T1", ac: 15 }],
      { attackTotal: 16 }
    )[0].hit).toBe(true);
  });

  it("bakes cover into Dex saves only", () => {
    const half = evaluateCover({ blockedFraction: 0.5 });
    expect(bakeCoverIntoDexSave("dex", half)).toBe(2);
    expect(bakeCoverIntoDexSave("wis", half)).toBe(0);
    expect(bakeCoverIntoDexSave("dex", evaluateCover({ blockedFraction: 0 }))).toBe(0);
  });
});

describe("reaction pause from created", () => {
  it("allows awaitReaction from created phase", () => {
    const state = createActionResolution({ id: "oa1", phase: "created", actorUuid: "Actor.O" });
    const result = advanceAction(state, {
      type: "awaitReaction",
      actorUuid: "Actor.O",
      trigger: "opportunity",
      timeoutMs: 5000
    });
    expect(result.state.phase).toBe("awaiting-reaction");
    expect(result.state.pendingDecision?.type).toBe("reaction");
  });
});

describe("OA + cover catalog and levels", () => {
  it("registers rule entries", () => {
    expect(getRule("combat.opportunity-attack.2024").automation).toBe("full");
    expect(getRule("combat.cover.2024").edition).toBe("2024");
    expect(getRule("combat.opportunity-attack.2014").edition).toBe("2014");
  });

  it("keeps OA and cover on under full automation", () => {
    expect(levelFeatures().opportunityAttacks).toBe(true);
    expect(levelFeatures().coverMatrix).toBe(true);
  });
});
