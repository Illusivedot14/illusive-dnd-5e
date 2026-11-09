import { describe, it, expect, beforeEach } from "vitest";
import { MODULE_ID, installFoundry, makeEffect } from "./helpers.mjs";
import { getEffectDisposition } from "../src/foundry/effect-disposition.mjs";
import { getTimedBadgeText, hasTimedDuration } from "../src/foundry/effect-duration.mjs";

describe("effect disposition", () => {
  it("marks common conditions as debuffs", () => {
    expect(getEffectDisposition(makeEffect({ name: "Poisoned", statuses: ["poisoned"] }))).toBe("debuff");
    expect(getEffectDisposition(makeEffect({ name: "Frightened", statuses: ["frightened"] }))).toBe("debuff");
  });

  it("marks common buffs as beneficial", () => {
    expect(getEffectDisposition(makeEffect({ name: "Blessed", statuses: ["blessed"] }))).toBe("buff");
  });

  it("falls back to name heuristics", () => {
    expect(getEffectDisposition(makeEffect({ name: "Hex Curse" }))).toBe("debuff");
    expect(getEffectDisposition(makeEffect({ name: "Heroism" }))).toBe("buff");
    expect(getEffectDisposition(makeEffect({ name: "Custom Aura" }))).toBe("neutral");
  });
});

describe("timed status badges", () => {
  beforeEach(() => {
    installFoundry();
    globalThis.game.release = { generation: 14 };
    globalThis.game.combat = { id: "c1", started: true, round: 2, turn: 0, combatants: [] };
  });

  it("shows round countdown badges only for Set Duration effects", () => {
    const managed = {
      ...makeEffect({ duration: { units: "rounds", label: "3 rounds" } }),
      flags: { [MODULE_ID]: { roundTotal: 3, startRound: 1, combatId: "c1" } },
      getFlag(ns, key) {
        return this.flags?.[ns]?.[key];
      },
      system: { duration: { units: "rounds", value: 3 } },
      _source: { duration: { units: "rounds", value: 3, combat: "c1", startRound: 1 } }
    };
    expect(hasTimedDuration(managed)).toBe(true);
    expect(getTimedBadgeText(managed)).toBe("2");

    const native = {
      ...makeEffect({ duration: { units: "rounds", label: "3 rounds" } }),
      system: { duration: { units: "rounds", value: 3 } },
      _source: { duration: { units: "rounds", value: 3, combat: "c1", startRound: 1 } }
    };
    expect(hasTimedDuration(native)).toBe(false);
    expect(getTimedBadgeText(native)).toBeNull();

    const labelled = makeEffect({ duration: { label: "1 minute" } });
    expect(hasTimedDuration(labelled)).toBe(true);
    expect(getTimedBadgeText(labelled)).toBe("1m");
  });

  it("ignores permanent effects", () => {
    const effect = makeEffect({ duration: { label: "Permanent" } });
    expect(hasTimedDuration(effect)).toBe(false);
  });
});
