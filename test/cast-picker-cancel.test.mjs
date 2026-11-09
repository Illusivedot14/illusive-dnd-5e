import { describe, it, expect, beforeEach, vi } from "vitest";
import { installFoundry } from "./helpers.mjs";
import { pickCastSlotLevel } from "../src/hud/components/action-bar/action-bar-cast-picker.mjs";
import { initI18n } from "../src/i18n/core.mjs";

describe("pickCastSlotLevel cancel", () => {
  beforeEach(async () => {
    installFoundry();
    await initI18n();
    globalThis.foundry = {
      applications: {
        api: {
          DialogV2: {
            wait: vi.fn()
          }
        }
      },
      utils: globalThis.foundry?.utils ?? { mergeObject: (a, b) => ({ ...a, ...b }) }
    };
  });

  function actorWithSlots() {
    return {
      system: {
        spells: {
          spell1: { value: 1 },
          spell2: { value: 1 },
          spell3: { value: 0 }
        }
      }
    };
  }

  it("treats DialogV2 nullish-fallback action id as cancel", async () => {
    // Foundry: (await callback()) ?? action  → null callback becomes "cancel"
    foundry.applications.api.DialogV2.wait.mockResolvedValue("cancel");
    const pick = await pickCastSlotLevel(
      actorWithSlots(),
      { name: "Fireball", type: "spell", system: { level: 1 } },
      { type: "cast" }
    );
    expect(pick).toEqual({ cancelled: true, level: null });
  });

  it("treats false callback result as cancel", async () => {
    foundry.applications.api.DialogV2.wait.mockResolvedValue(false);
    const pick = await pickCastSlotLevel(
      actorWithSlots(),
      { name: "Fireball", type: "spell", system: { level: 1 } },
      { type: "cast" }
    );
    expect(pick).toEqual({ cancelled: true, level: null });
  });

  it("accepts a numeric slot level", async () => {
    foundry.applications.api.DialogV2.wait.mockResolvedValue(2);
    const pick = await pickCastSlotLevel(
      actorWithSlots(),
      { name: "Fireball", type: "spell", system: { level: 1 } },
      { type: "cast" }
    );
    expect(pick).toEqual({ cancelled: false, level: 2 });
  });

  it("skips the slot dialog for cantrips even when many slots are free", async () => {
    const pick = await pickCastSlotLevel(
      {
        system: {
          spells: {
            spell1: { value: 4 },
            spell2: { value: 3 },
            spell3: { value: 2 }
          }
        }
      },
      { name: "Fire Bolt", type: "spell", system: { level: 0 } },
      { type: "attack" }
    );
    expect(pick).toEqual({ cancelled: false, level: null });
    expect(foundry.applications.api.DialogV2.wait).not.toHaveBeenCalled();
  });
});
