// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { installFoundry, makeActor } from "./helpers.mjs";
import { buildDrawerEntries, rollDrawerEntry } from "../src/hud/components/action-bar/action-bar-drawer.mjs";

describe("action-bar-drawer rolls", () => {
  beforeEach(() => {
    installFoundry();
    globalThis.CONFIG = {
      DND5E: {
        abilities: {
          str: { label: "Strength" },
          dex: { label: "Dexterity" },
          con: { label: "Constitution" },
          int: { label: "Intelligence" },
          wis: { label: "Wisdom" },
          cha: { label: "Charisma" }
        },
        skills: {
          prc: { label: "Perception" },
          ath: { label: "Athletics" }
        }
      }
    };
    globalThis.ui = { notifications: { warn: vi.fn() } };
  });

  it("builds ability checks, skills, and saves", () => {
    const actor = makeActor({
      system: {
        abilities: {
          str: { mod: 3 },
          dex: { mod: 2 },
          con: { mod: 1 },
          int: { mod: 0 },
          wis: { mod: 4 },
          cha: { mod: -1 }
        },
        skills: {
          prc: { total: 7 },
          ath: { mod: 5 }
        }
      },
      items: []
    });

    const entries = buildDrawerEntries(actor);
    expect(entries.checks.map((e) => e.id)).toEqual(["str", "dex", "con", "int", "wis", "cha"]);
    expect(entries.checks[0].type).toBe("check");
    expect(entries.skills.map((e) => e.id)).toEqual(["ath", "prc"]);
    expect(entries.saves).toHaveLength(6);
    expect(entries.checks[0].modLabel).toBe("+3");
  });

  it("routes check rolls to rollAbilityCheck with configure dialog", async () => {
    const actor = {
      isOwner: true,
      rollAbilityCheck: vi.fn(async () => {})
    };
    const event = { type: "click" };
    await rollDrawerEntry(actor, { type: "check", id: "str" }, event);
    expect(actor.rollAbilityCheck).toHaveBeenCalledWith(
      { ability: "str", event },
      { configure: true },
      { create: true }
    );
  });

  it("falls back to rollAbilityTest when rollAbilityCheck is missing", async () => {
    const actor = {
      isOwner: true,
      rollAbilityTest: vi.fn(async () => {})
    };
    await rollDrawerEntry(actor, { type: "check", id: "dex" });
    expect(actor.rollAbilityTest).toHaveBeenCalledWith(
      { ability: "dex", event: null },
      { configure: true },
      { create: true }
    );
  });

  it("routes skill and save rolls", async () => {
    const actor = {
      isOwner: true,
      rollSkill: vi.fn(async () => {}),
      rollSavingThrow: vi.fn(async () => {})
    };
    const event = { type: "click" };
    await rollDrawerEntry(actor, { type: "skill", id: "prc" }, event);
    await rollDrawerEntry(actor, { type: "save", id: "wis" }, event);
    expect(actor.rollSkill).toHaveBeenCalledWith(
      { skill: "prc", event },
      { configure: true },
      { create: true }
    );
    expect(actor.rollSavingThrow).toHaveBeenCalledWith(
      { ability: "wis", event },
      { configure: true },
      { create: true }
    );
  });

  it("lists tool proficiencies on the checks list", () => {
    const actor = makeActor({
      system: {
        abilities: { str: { mod: 1 } },
        tools: {
          thief: { total: 7 },
          herb: { total: 4 }
        }
      },
      items: []
    });
    globalThis.CONFIG.DND5E.tools = { thief: "Thieves' Tools", herb: "Herbalism Kit" };

    const entries = buildDrawerEntries(actor);
    expect(entries.tools.map((e) => e.id).sort()).toEqual(["herb", "thief"]);
    expect(entries.tools.find((e) => e.id === "thief")).toMatchObject({
      type: "tool",
      label: "Thieves' Tools",
      modLabel: "+7"
    });
  });

  it("routes tool rolls to rollToolCheck", async () => {
    const actor = {
      isOwner: true,
      rollToolCheck: vi.fn(async () => {})
    };
    const event = { type: "click" };
    await rollDrawerEntry(actor, { type: "tool", id: "thief" }, event);
    expect(actor.rollToolCheck).toHaveBeenCalledWith(
      { tool: "thief", event },
      { configure: true },
      { create: true }
    );
  });

  it("skips configure dialog when dnd5e skip-dialog keys are held", async () => {
    globalThis.game = {
      ...(globalThis.game ?? {}),
      system: {
        utils: {
          areKeysPressed: (evt, action) => evt && action === "skipDialogAdvantage"
        }
      }
    };
    const actor = {
      isOwner: true,
      rollAbilityCheck: vi.fn(async () => {})
    };
    const event = { altKey: true };
    await rollDrawerEntry(actor, { type: "check", id: "str" }, event);
    expect(actor.rollAbilityCheck).toHaveBeenCalledWith(
      { ability: "str", event },
      {},
      { create: true }
    );
  });
});
