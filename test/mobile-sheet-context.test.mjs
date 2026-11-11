import { describe, expect, it } from "vitest";
import { installFoundry } from "./helpers.mjs";
import { buildMobileSheetContext } from "../src/hud/components/mobile-sheet/mobile-sheet-data.mjs";

function actor() {
  return {
    id: "ada",
    name: "Ada",
    img: "ada.png",
    isOwner: true,
    items: {
      contents: [
        {
          id: "sword",
          name: "Sword",
          type: "weapon",
          sort: 1,
          img: "sword.png",
          system: { equipped: true, activities: [{ type: "attack" }] }
        },
        {
          id: "fire",
          name: "Fire Bolt",
          type: "spell",
          sort: 2,
          system: { level: 0, activities: [], preparation: { mode: "always", prepared: true } }
        }
      ]
    },
    effects: { contents: [] },
    system: {
      attributes: {
        hp: { value: 12, max: 20 },
        ac: { value: 16 },
        movement: { walk: 30 },
        init: { mod: 2 },
        prof: 2
      },
      abilities: { str: { value: 16, mod: 3, save: 5, proficient: true } },
      skills: {},
      details: { biography: { value: "<p>Scout</p>" } }
    }
  };
}

describe("buildMobileSheetContext", () => {
  it("paints a header shell without walking the open tab's items", () => {
    installFoundry();
    const shell = buildMobileSheetContext(actor(), { tab: "combat", shell: true });
    expect(shell.name).toBe("Ada");
    expect(shell.hp.value).toBe(12);
    expect(shell.tabs.combat).toBe(true);
    expect(shell.combat).toEqual([]);
    expect(shell.spellLevels).toEqual([]);
    expect(shell.biography).toBe("");
  });

  it("builds only the open tab and reuses it until an item changes", () => {
    installFoundry();
    const sheet = actor();
    const combat = buildMobileSheetContext(sheet, { tab: "combat" });
    const again = buildMobileSheetContext(sheet, { tab: "combat" });
    expect(combat.combat.map((item) => item.itemName)).toEqual(["Sword"]);
    expect(combat.spellLevels).toEqual([]);
    expect(again.combat).toBe(combat.combat);

    const abilities = buildMobileSheetContext(sheet, { tab: "abilities" });
    expect(abilities.abilities.map((row) => row.id)).toEqual(["str"]);
    expect(abilities.combat).toEqual([]);
    expect(buildMobileSheetContext(sheet, { tab: "combat" }).combat).toBe(combat.combat);

    sheet.items.contents[0].name = "Axe";
    const rebuilt = buildMobileSheetContext(sheet, { tab: "combat" });
    expect(rebuilt.combat.map((item) => item.itemName)).toEqual(["Axe"]);
    expect(rebuilt.combat).not.toBe(combat.combat);
  });
});
