import { describe, it, expect } from "vitest";
import {
  damageFactorOnSave,
  evaluateSaveVsDc,
  scaleDamageTotal,
  shouldApplyEffectOnSave
} from "../src/domain/combat/save-outcome.mjs";
import { selectActivityEffectProfiles } from "../src/application/effect-apply.mjs";

describe("evaluateSaveVsDc", () => {
  it("succeeds when total meets DC", () => {
    expect(evaluateSaveVsDc({ total: 15, dc: 15 })).toEqual({
      success: true,
      reason: "saved"
    });
  });

  it("fails below DC", () => {
    expect(evaluateSaveVsDc({ total: 14, dc: 15 })).toEqual({
      success: false,
      reason: "failed"
    });
  });

  it("honors auto-fail / auto-success", () => {
    expect(evaluateSaveVsDc({ autoFail: true, total: 99, dc: 1 }).success).toBe(false);
    expect(evaluateSaveVsDc({ autoSuccess: true, total: 1, dc: 99 }).success).toBe(true);
  });
});

describe("damageFactorOnSave", () => {
  it("applies full damage on failure", () => {
    expect(damageFactorOnSave({ saved: false, onSave: "none" })).toBe(1);
  });

  it("scales by onSave on success", () => {
    expect(damageFactorOnSave({ saved: true, onSave: "none" })).toBe(0);
    expect(damageFactorOnSave({ saved: true, onSave: "half" })).toBe(0.5);
    expect(damageFactorOnSave({ saved: true, onSave: "full" })).toBe(1);
  });
});

describe("scaleDamageTotal", () => {
  it("rounds half down", () => {
    expect(scaleDamageTotal(7, 0.5)).toBe(3);
    expect(scaleDamageTotal(8, 0.5)).toBe(4);
  });

  it("returns 0 for none", () => {
    expect(scaleDamageTotal(12, 0)).toBe(0);
  });
});

describe("shouldApplyEffectOnSave", () => {
  it("always applies on failed save", () => {
    expect(shouldApplyEffectOnSave({ saved: false, effectOnSave: false })).toBe(true);
  });

  it("applies on success only when effectOnSave", () => {
    expect(shouldApplyEffectOnSave({ saved: true, effectOnSave: false })).toBe(false);
    expect(shouldApplyEffectOnSave({ saved: true, effectOnSave: true })).toBe(true);
  });
});

describe("selectActivityEffectProfiles", () => {
  const effect = { id: "eff1", toObject: () => ({ name: "Stunned" }) };

  it("skips failed-save-only profiles when saved", () => {
    const activity = {
      type: "save",
      relevantLevel: 1,
      effects: [{ effect, onSave: false, level: {} }]
    };
    expect(selectActivityEffectProfiles(activity, true)).toHaveLength(0);
    expect(selectActivityEffectProfiles(activity, false)).toHaveLength(1);
  });

  it("keeps onSave profiles after a success", () => {
    const activity = {
      type: "save",
      relevantLevel: 1,
      effects: [{ effect, onSave: true, level: {} }]
    };
    expect(selectActivityEffectProfiles(activity, true)).toHaveLength(1);
  });

  it("still applies Always Apply (onSave:true) profiles on a failed save", () => {
    const activity = {
      type: "save",
      relevantLevel: 1,
      effects: [{ effect, onSave: true, level: {} }]
    };
    expect(selectActivityEffectProfiles(activity, false)).toHaveLength(1);
  });

  it("applies attack activity effects without save gating", () => {
    const activity = {
      type: "attack",
      relevantLevel: 1,
      effects: [{ effect, onSave: false, level: {} }]
    };
    expect(selectActivityEffectProfiles(activity, true)).toHaveLength(1);
  });

  it("skips enchantment profiles", () => {
    const activity = {
      type: "save",
      relevantLevel: 1,
      effects: [{ effect: { ...effect, type: "enchantment" }, onSave: false, level: {} }]
    };
    expect(selectActivityEffectProfiles(activity, false)).toHaveLength(0);
  });
});
