import { describe, it, expect, beforeEach, vi } from "vitest";
import { MODULE_ID, installFoundry, makeActor, makeEffect } from "./helpers.mjs";
import {
  buildRoundDurationUpdate,
  getRemainingRounds,
  isEffectDurationExpired,
  expireRoundBasedEffects
} from "../src/foundry/effect-duration.mjs";
import { collectActiveEffects } from "../src/foundry/effect-icons.mjs";

function makeTimedEffect(overrides = {}) {
  const roundTotal = overrides.flags?.[MODULE_ID]?.roundTotal ?? 2;
  const effect = {
    ...makeEffect(overrides),
    id: overrides.id ?? "bless",
    flags: {
      ...(overrides.flags ?? {}),
      [MODULE_ID]: {
        roundTotal,
        startRound: 1,
        combatId: "c1",
        ...(overrides.flags?.[MODULE_ID] ?? {})
      }
    },
    delete: overrides.delete ?? vi.fn(async () => {})
  };
  effect.getFlag = overrides.getFlag ?? vi.fn((ns, key) => effect.flags?.[ns]?.[key]);
  return effect;
}

describe("effect duration", () => {
  beforeEach(() => {
    installFoundry();
    globalThis.game.combat = { id: "c1", started: true, round: 3, turn: 0, combatants: [] };
  });

  it("counts remaining rounds from module flags and combat round", () => {
    globalThis.game.combat.round = 2;
    const effect = makeTimedEffect({
      flags: { [MODULE_ID]: { roundTotal: 3, startRound: 1, combatId: "c1" } }
    });
    expect(getRemainingRounds(effect)).toBe(2);
    expect(isEffectDurationExpired(effect)).toBe(false);
  });

  it("treats remaining=0 as expired for managed effects", () => {
    globalThis.game.combat.round = 3;
    const effect = makeTimedEffect({
      flags: { [MODULE_ID]: { roundTotal: 2, startRound: 1, combatId: "c1" } }
    });
    expect(getRemainingRounds(effect)).toBe(0);
    expect(isEffectDurationExpired(effect)).toBe(true);
  });

  it("ignores Foundry duration fields on managed effects", () => {
    globalThis.game.combat.round = 2;
    const effect = makeTimedEffect({
      flags: { [MODULE_ID]: { roundTotal: 5, startRound: 1, combatId: "c1" } },
      duration: { remaining: 0, expired: true }
    });
    expect(getRemainingRounds(effect)).toBe(4);
    expect(isEffectDurationExpired(effect)).toBe(false);
  });

  it("filters expired managed effects out of collectActiveEffects", () => {
    globalThis.game.combat.round = 3;
    const actor = makeActor({
      temporaryEffects: [
        makeTimedEffect({ id: "fly", flags: { [MODULE_ID]: { roundTotal: 2, startRound: 1, combatId: "c1" } } }),
        makeTimedEffect({ id: "bless", flags: { [MODULE_ID]: { roundTotal: 5, startRound: 1, combatId: "c1" } } })
      ]
    });
    expect(collectActiveEffects(actor).map((e) => e.id)).toEqual(["bless"]);
  });

  it("keeps non-managed effects visible", () => {
    const effect = makeEffect({ duration: { label: "1 minute" } });
    expect(isEffectDurationExpired(effect)).toBe(false);
  });

  it("does not expire immediately when only roundTotal flag uses current combat round", () => {
    globalThis.game.combat = { id: "c1", started: true, round: 5, turn: 0, combatants: [] };
    const effect = makeTimedEffect({
      flags: { [MODULE_ID]: { roundTotal: 3, combatId: "c1" } }
    });
    delete effect.flags[MODULE_ID].startRound;

    expect(getRemainingRounds(effect)).toBe(3);
    expect(collectActiveEffects(makeActor({ temporaryEffects: [effect] }))).toHaveLength(1);
  });

  it("buildRoundDurationUpdate writes only module flags", () => {
    globalThis.game.combat = { id: "c1", started: true, round: 2, turn: 0, combatants: [] };
    const update = buildRoundDurationUpdate(4);
    expect(update).toEqual({
      [`flags.${MODULE_ID}.roundTotal`]: 4,
      [`flags.${MODULE_ID}.combatId`]: "c1",
      [`flags.${MODULE_ID}.startRound`]: 2
    });
  });

  it("deletes expired managed effects when the GM advances a round", async () => {
    installFoundry({ isGM: true });

    const expired = makeTimedEffect({
      id: "fly",
      flags: { [MODULE_ID]: { roundTotal: 2, startRound: 1, combatId: "c1" } },
      delete: vi.fn(async () => {})
    });
    const active = makeTimedEffect({
      id: "bless",
      flags: { [MODULE_ID]: { roundTotal: 5, startRound: 1, combatId: "c1" } },
      delete: vi.fn(async () => {})
    });
    const actor = makeActor({ temporaryEffects: [expired, active] });
    const combat = { id: "c1", started: true, round: 3, combatants: [{ actor }] };
    globalThis.game.combat = combat;

    await expireRoundBasedEffects(combat);

    expect(expired.delete).toHaveBeenCalled();
    expect(active.delete).not.toHaveBeenCalled();
  });

  it("does not delete expired managed effects for non-GM clients", async () => {
    installFoundry({ isGM: false });

    const expired = makeTimedEffect({
      flags: { [MODULE_ID]: { roundTotal: 2, startRound: 1, combatId: "c1" } },
      delete: vi.fn(async () => {})
    });
    globalThis.game.combat = { id: "c1", started: true, round: 3, combatants: [{ actor: makeActor({ temporaryEffects: [expired] }) }] };

    await expireRoundBasedEffects(globalThis.game.combat);

    expect(expired.delete).not.toHaveBeenCalled();
  });
});
