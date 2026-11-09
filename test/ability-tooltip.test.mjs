import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { installFoundry, makeActor, makeCollection, resetFoundry } from "./helpers.mjs";
import { buildAbilityTooltipModel, enrichAbilityDescription } from "../src/hud/components/action-bar/ability-tooltip.mjs";

describe("ability tooltips", () => {
  beforeEach(() => {
    installFoundry();
    globalThis.foundry = {
      applications: {
        ux: {
          TextEditor: {
            implementation: {
              enrichHTML: vi.fn(async (html) => html
                .replace("[[/save con 12 format=long]]", '<a class="inline-roll">Constitution Saving Throw DC 12</a>')
                .replace("[[/damage 3d10 type=thunder]]", '<a class="inline-roll">3d10 thunder</a>'))
            }
          }
        }
      },
      utils: {
        escapeHTML: (value) => String(value)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
      }
    };
  });

  afterEach(() => {
    resetFoundry();
    delete globalThis.foundry;
  });

  it("enriches Foundry inline commands in descriptions", async () => {
    const raw = "Each creature must make a [[/save con 12 format=long]]. On a failed save, take [[/damage 3d10 type=thunder]].";
    const html = await enrichAbilityDescription(raw);
    expect(html).toContain("Constitution Saving Throw DC 12");
    expect(html).toContain("3d10 thunder");
    expect(html).not.toContain("[[/save");
    expect(html).not.toContain("[[/damage");
  });

  it("builds tooltip models with enriched description HTML", async () => {
    const item = {
      id: "goose1",
      name: "Honk",
      system: {
        description: {
          value: "The goose honks. Make a [[/save con 12 format=long]]."
        },
        activities: makeCollection([])
      }
    };
    const token = { actor: makeActor({ items: [item] }) };
    const model = await buildAbilityTooltipModel(token, {
      itemId: "goose1",
      activityId: "",
      isStandard: false,
      name: "Honk",
      needsTarget: false,
      hasTargets: false,
      disabledReason: null
    });

    expect(model.description).toContain("Constitution Saving Throw DC 12");
    expect(model.description).not.toContain("[[/save");
  });
});
