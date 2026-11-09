// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { installFoundry } from "./helpers.mjs";
import {
  isTokenLightOn,
  applyLightPreset,
  collectLightPresetChoices,
  LIGHT_PRESETS
} from "../src/foundry/token-light.mjs";

describe("token light presets", () => {
  beforeEach(() => {
    installFoundry();
    globalThis.game.user = { isGM: true, id: "gm" };
    globalThis.ui = { notifications: { warn: vi.fn() } };
  });

  it("detects light from bright/dim radii", () => {
    expect(isTokenLightOn({ document: { light: { bright: 20, dim: 40 } } })).toBe(true);
    expect(isTokenLightOn({ document: { light: { bright: 0, dim: 0 } } })).toBe(false);
  });

  it("marks torch active when radii match", () => {
    const choices = collectLightPresetChoices({
      document: { light: { bright: 20, dim: 40 }, getFlag: () => null }
    });
    expect(choices.find((c) => c.id === "torch").isActive).toBe(true);
    expect(choices.find((c) => c.id === "off").isActive).toBe(false);
  });

  it("applies torch radii and animation", async () => {
    const flags = {};
    const doc = {
      light: { bright: 0, dim: 0 },
      canUserModify: () => true,
      setFlag: vi.fn(async (_scope, key, value) => { flags[key] = value; }),
      getFlag: (_scope, key) => flags[key],
      update: vi.fn(async (data) => {
        for (const [key, value] of Object.entries(data)) {
          if (key === "light.bright") doc.light.bright = value;
          if (key === "light.dim") doc.light.dim = value;
          if (key === "light.color") doc.light.color = value;
        }
      })
    };

    await applyLightPreset({ document: doc }, "torch");
    expect(doc.light.bright).toBe(LIGHT_PRESETS.torch.bright);
    expect(doc.light.dim).toBe(LIGHT_PRESETS.torch.dim);
    expect(flags.savedLight).toEqual({ bright: 20, dim: 40 });
  });

  it("always offers custom for anyone to set", () => {
    const choices = collectLightPresetChoices({
      document: {
        light: { bright: 0, dim: 0 },
        getFlag: () => null
      }
    });
    const custom = choices.find((c) => c.id === "custom");
    expect(custom.disabled).toBeUndefined();
    expect(custom.isActive).toBe(false);
  });

  it("applies values returned from the custom prompt", async () => {
    const flags = {};
    const doc = {
      light: { bright: 0, dim: 0 },
      canUserModify: () => true,
      setFlag: vi.fn(async (_scope, key, value) => { flags[key] = value; }),
      getFlag: (_scope, key) => flags[key],
      update: vi.fn(async (data) => {
        if ("light.bright" in data) doc.light.bright = data["light.bright"];
        if ("light.dim" in data) doc.light.dim = data["light.dim"];
        if ("light.color" in data) doc.light.color = data["light.color"];
      })
    };

    await applyLightPreset({ document: doc }, "custom", {
      promptCustom: async () => ({
        bright: 12,
        dim: 24,
        color: "#112233",
        alpha: 0.45,
        animation: { type: "torch", speed: 2, intensity: 3, reverse: false }
      })
    });
    expect(doc.light.bright).toBe(12);
    expect(doc.light.dim).toBe(24);
    expect(flags.customLight.bright).toBe(12);
  });
});
