import { describe, it, expect, beforeEach, vi } from "vitest";
import { MODULE_ID, installFoundry, makeActor, makeEffect } from "./helpers.mjs";
import {
  buildRoundDurationUpdate,
  getRemainingRounds,
  isEffectDurationExpired
} from "../src/foundry/effect-duration.mjs";
import { collectActiveEffects } from "../src/foundry/effect-icons.mjs";
import { buildTokenStatusData } from "../src/foundry/effect-data.mjs";

function setManagedDuration(effect, rounds) {
  const combat = globalThis.game.combat;
  effect.flags ??= {};
  effect.flags[MODULE_ID] = {
    roundTotal: rounds,
    startRound: combat.round ?? 1,
    combatId: combat.id
  };
  effect.getFlag = vi.fn((ns, key) => effect.flags?.[ns]?.[key]);
}

function makeCombatEffect(overrides = {}) {
  const effect = {
    ...makeEffect({ ...overrides, img: overrides.img ?? "effect.png" }),
    id: overrides.id ?? "bless",
    name: overrides.name ?? "Bless",
    duration: { units: "rounds", value: 0, expired: true, remaining: 0, ...(overrides.duration ?? {}) },
    _source: { duration: { units: "rounds", value: 0, expired: true, ...(overrides._source?.duration ?? {}) } },
    updateDuration: vi.fn(function updateDuration() {
      this.duration = { ...(this.duration ?? {}), expired: true, remaining: 0, value: 0 };
    })
  };
  setManagedDuration(effect, overrides.roundTotal ?? 3);
  return effect;
}

describe("round duration survives Foundry turn corruption (integration)", () => {
  beforeEach(() => {
    installFoundry({ isGM: true });
    globalThis.game.combat = { id: "c1", started: true, round: 2, turn: 0, combatants: [] };
  });

  it("without module flags, round countdown is unknown but effect is not hidden", () => {
    const effect = makeCombatEffect();
    delete effect.flags[MODULE_ID];
    effect.getFlag = vi.fn(() => undefined);

    expect(getRemainingRounds(effect)).toBeNull();
    expect(isEffectDurationExpired(effect)).toBe(false);
    expect(collectActiveEffects(makeActor({ temporaryEffects: [effect] }))).toHaveLength(1);
  });

  it("survives one turn advance when module flags remain intact", () => {
    const effect = makeCombatEffect();
    globalThis.game.combat.turn = 1;
    effect.updateDuration();

    expect(getRemainingRounds(effect)).toBe(3);
    expect(collectActiveEffects(makeActor({ temporaryEffects: [effect] }))).toHaveLength(1);
  });

  it("survives refetch from actor collection after Foundry corrupts duration fields", async () => {
    const effect = makeCombatEffect();
    const actor = makeActor({ temporaryEffects: [effect] });

    globalThis.game.combat.turn = 2;
    effect.updateDuration();

    const refetched = actor.temporaryEffects.find((entry) => entry.id === effect.id);
    expect(getRemainingRounds(refetched)).toBe(3);

    const statuses = await buildTokenStatusData({ actor });
    expect(statuses).toHaveLength(1);
    expect(statuses[0].timedBadge).toBe("3");
  });

  it("countdown drops only when combat.round advances", () => {
    const effect = makeCombatEffect();

    effect.updateDuration();
    expect(getRemainingRounds(effect)).toBe(3);

    globalThis.game.combat.round = 3;
    expect(getRemainingRounds(effect)).toBe(2);

    globalThis.game.combat.round = 5;
    expect(getRemainingRounds(effect)).toBe(0);
    expect(collectActiveEffects(makeActor({ temporaryEffects: [effect] }))).toHaveLength(0);
  });

  it("buildRoundDurationUpdate persists module tracking flags only", () => {
    const update = buildRoundDurationUpdate(4);
    expect(update).toEqual({
      [`flags.${MODULE_ID}.roundTotal`]: 4,
      [`flags.${MODULE_ID}.startRound`]: 2,
      [`flags.${MODULE_ID}.combatId`]: "c1"
    });
  });

  it("keeps Foundry-native round effects visible when duration fields are zeroed", () => {
    const managed = makeCombatEffect({ id: "managed" });
    const native = {
      ...makeEffect({ id: "burrowing", name: "Burrowing", img: "burrow.png" }),
      duration: { units: "rounds", value: 0, expired: true, remaining: 0 },
      _source: { duration: { units: "rounds", value: 0 } }
    };
    native.updateDuration = vi.fn(function updateDuration() {
      this.duration = { ...(this.duration ?? {}), expired: true, remaining: 0, value: 0 };
    });
    native.updateDuration();

    const actor = makeActor({ temporaryEffects: [managed, native] });
    const ids = collectActiveEffects(actor).map((entry) => entry.id);

    expect(ids).toContain("burrowing");
    expect(ids).toContain("managed");
    expect(isEffectDurationExpired(native)).toBe(false);
  });
});
