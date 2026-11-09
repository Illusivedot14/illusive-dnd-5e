import { describe, it, expect } from "vitest";
import { unwrapCastActivity } from "../src/application/resolve-activity.mjs";

describe("unwrapCastActivity", () => {
  it("leaves non-cast activities alone", () => {
    const item = { name: "Fireball", type: "spell" };
    const activity = { type: "save", id: "save1" };
    const out = unwrapCastActivity(item, activity);
    expect(out.unwrapped).toBe(false);
    expect(out.item).toBe(item);
    expect(out.activity).toBe(activity);
    expect(out.consumptionItem).toBe(item);
    expect(out.consumptionActivity).toBe(activity);
  });

  it("unwraps Spellcasting cast shells to the linked spell primary", () => {
    const spell = {
      name: "Fireball",
      type: "spell",
      system: {
        activities: {
          contents: [
            { id: "save1", type: "save", target: { template: { type: "circle" } }, canUse: true }
          ]
        }
      }
    };
    const cast = {
      type: "cast",
      id: "cast1",
      cachedSpell: spell
    };
    const shell = { name: "Spellcasting", type: "feat", id: "mmSpellcasting00" };

    const out = unwrapCastActivity(shell, cast);
    expect(out.unwrapped).toBe(true);
    expect(out.consumptionItem).toBe(shell);
    expect(out.consumptionActivity).toBe(cast);
    expect(out.item).toBe(spell);
    expect(out.activity.type).toBe("save");
    expect(out.activity.id).toBe("save1");
  });

  it("prefers attack/save over utility when both exist on the linked spell", () => {
    const spell = {
      name: "Produce Flame",
      type: "spell",
      system: {
        activities: {
          contents: [
            { id: "util", type: "utility", canUse: true },
            { id: "atk", type: "attack", canUse: true }
          ]
        }
      }
    };
    const out = unwrapCastActivity(
      { name: "Spellcasting" },
      { type: "cast", cachedSpell: spell }
    );
    expect(out.unwrapped).toBe(true);
    expect(out.activity.id).toBe("atk");
  });

  it("leaves cast shells alone when the linked spell cannot be resolved", () => {
    const cast = { type: "cast", id: "cast1", cachedSpell: null, spell: {} };
    const shell = { name: "Spellcasting", type: "feat" };
    const out = unwrapCastActivity(shell, cast);
    expect(out.unwrapped).toBe(false);
    expect(out.item).toBe(shell);
    expect(out.activity).toBe(cast);
  });
});
