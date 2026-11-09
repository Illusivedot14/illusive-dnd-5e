import { describe, it, expect, beforeEach, vi } from "vitest";
import { installFoundry, makeActor } from "./helpers.mjs";
import {
  getPactMagic,
  getClassResources,
  buildActionBarResources,
  buildLegendaryResistance,
  adjustLegendaryResistance,
  buildSpellSlotDiamondsForLevel,
  hasAvailableSpellSlot
} from "../src/foundry/actor-resources.mjs";

describe("getPactMagic", () => {
  beforeEach(() => installFoundry());

  it("returns null without pact slots", () => {
    expect(getPactMagic(makeActor())).toBeNull();
  });

  it("reads pact pool and level", () => {
    const actor = makeActor({
      system: {
        spells: { pact: { value: 1, max: 2, level: 3 } }
      }
    });
    const pact = getPactMagic(actor);
    expect(pact).toMatchObject({ id: "pact", kind: "pact", value: 1, max: 2, level: 3 });
    expect(pact.diamonds).toEqual([{ filled: true }, { filled: false }]);
  });
});

describe("getClassResources", () => {
  beforeEach(() => installFoundry());

  it("includes primary/secondary/tertiary with max", () => {
    const actor = makeActor({
      system: {
        resources: {
          primary: { label: "Ki", value: 2, max: 4 },
          secondary: { label: "", value: 0, max: 0 },
          tertiary: { label: "Sorcery", value: 1, max: 3 }
        }
      }
    });
    const list = getClassResources(actor);
    expect(list.map((r) => r.id)).toEqual(["primary", "tertiary"]);
    expect(list[0]).toMatchObject({ label: "Ki", value: 2, max: 4 });
  });

  it("skips legendary actions but keeps resistance", () => {
    const actor = makeActor({
      system: {
        resources: {
          legact: { value: 1, max: 3 },
          legres: { value: 2, max: 3 }
        }
      }
    });
    const list = getClassResources(actor);
    expect(list.map((r) => r.id)).toEqual(["legres"]);
  });
});

describe("buildSpellSlotDiamondsForLevel", () => {
  beforeEach(() => installFoundry());

  it("uses prepared slots when present", () => {
    const actor = makeActor({
      system: {
        spells: {
          spell1: { value: 2, max: 3 },
          pact: { value: 1, max: 2, level: 1 }
        }
      }
    });
    expect(buildSpellSlotDiamondsForLevel(actor, 1)).toEqual([
      { filled: true },
      { filled: true },
      { filled: false }
    ]);
  });

  it("falls back to pact when leveled slots are empty", () => {
    const actor = makeActor({
      system: {
        spells: {
          spell1: { value: 0, max: 0 },
          pact: { value: 2, max: 2, level: 3 }
        }
      }
    });
    expect(buildSpellSlotDiamondsForLevel(actor, 2)).toEqual([
      { filled: true },
      { filled: true }
    ]);
    expect(buildSpellSlotDiamondsForLevel(actor, 5)).toBeNull();
  });
});

describe("hasAvailableSpellSlot", () => {
  beforeEach(() => installFoundry());

  it("accepts pact for spellN keys within pact level", () => {
    const actor = makeActor({
      system: {
        spells: {
          spell2: { value: 0, max: 0 },
          pact: { value: 1, max: 2, level: 3 }
        }
      }
    });
    expect(hasAvailableSpellSlot(actor, "spell2")).toBe(true);
    expect(hasAvailableSpellSlot(actor, "spell5")).toBe(false);
    expect(hasAvailableSpellSlot(actor, "pact")).toBe(true);
  });
});

describe("buildActionBarResources", () => {
  beforeEach(() => installFoundry());

  it("lists class resources without pact magic", () => {
    const actor = makeActor({
      system: {
        spells: { pact: { value: 1, max: 1, level: 1 } },
        resources: { primary: { label: "Ki", value: 1, max: 2 } }
      }
    });
    expect(buildActionBarResources(actor).map((r) => r.id)).toEqual(["primary"]);
  });

  it("keeps resistance off the spell-well strip", () => {
    const actor = makeActor({
      system: {
        resources: {
          primary: { label: "Ki", value: 1, max: 2 },
          legres: { value: 2, max: 3 }
        }
      }
    });
    expect(buildActionBarResources(actor).map((r) => r.id)).toEqual(["primary"]);
  });
});

describe("buildLegendaryResistance", () => {
  beforeEach(() => installFoundry());

  it("returns null when the creature has none", () => {
    expect(buildLegendaryResistance(makeActor())).toBeNull();
  });

  it("reads leftover uses", () => {
    const actor = makeActor({
      system: { resources: { legres: { value: 2, max: 3 } } }
    });
    expect(buildLegendaryResistance(actor)).toMatchObject({ remaining: 2, max: 3 });
  });
});

describe("adjustLegendaryResistance", () => {
  beforeEach(() => installFoundry());

  it("spends one use", async () => {
    const actor = makeActor({
      system: { resources: { legres: { value: 2, max: 3 } } }
    });
    actor.update = vi.fn(async () => true);
    await expect(adjustLegendaryResistance(actor, -1)).resolves.toBe(true);
    expect(actor.update).toHaveBeenCalledWith({ "system.resources.legres.value": 1 });
  });

  it("puts one use back", async () => {
    const actor = makeActor({
      system: { resources: { legres: { value: 1, max: 3 } } }
    });
    actor.update = vi.fn(async () => true);
    await expect(adjustLegendaryResistance(actor, 1)).resolves.toBe(true);
    expect(actor.update).toHaveBeenCalledWith({ "system.resources.legres.value": 2 });
  });

  it("does nothing at empty or full", async () => {
    const empty = makeActor({
      system: { resources: { legres: { value: 0, max: 3 } } }
    });
    empty.update = vi.fn(async () => true);
    await expect(adjustLegendaryResistance(empty, -1)).resolves.toBe(false);
    expect(empty.update).not.toHaveBeenCalled();

    const full = makeActor({
      system: { resources: { legres: { value: 3, max: 3 } } }
    });
    full.update = vi.fn(async () => true);
    await expect(adjustLegendaryResistance(full, 1)).resolves.toBe(false);
    expect(full.update).not.toHaveBeenCalled();
  });
});
