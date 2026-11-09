import { describe, it, expect, beforeEach } from "vitest";
import { installFoundry, makeToken } from "./helpers.mjs";
import {
  flipToken,
  getElevationStep,
  getTokenElevation,
  isTokenFlipped,
  nextElevation,
  nudgeTokenElevation
} from "../src/foundry/token-actions.mjs";

describe("token pose", () => {
  beforeEach(() => {
    installFoundry({ isGM: true });
    globalThis.canvas.scene = { grid: { distance: 5 } };
  });

  it("flips the token by reversing scaleX", async () => {
    const token = makeToken();
    token.document.texture = { scaleX: 1, scaleY: 1 };
    await expect(flipToken(token)).resolves.toBe(true);
    expect(token.document.update).toHaveBeenCalledWith(
      { "texture.scaleX": -1 },
      expect.objectContaining({ animation: { duration: 120 } })
    );
  });

  it("keeps the token's size when flipping a scaled token", async () => {
    const token = makeToken();
    token.document._source = { texture: { scaleX: 0.5, scaleY: 0.5 } };
    token.document.texture = { scaleX: 0.5, scaleY: 0.5 };
    await expect(flipToken(token)).resolves.toBe(true);
    expect(token.document.update).toHaveBeenCalledWith(
      { "texture.scaleX": -0.5 },
      expect.objectContaining({ animation: { duration: 120 } })
    );
  });

  it("un-squashes a token whose scaleX no longer matches scaleY", async () => {
    const token = makeToken();
    token.document._source = { texture: { scaleX: -1, scaleY: 0.5 } };
    token.document.texture = { scaleX: -1, scaleY: 0.5 };
    await expect(flipToken(token)).resolves.toBe(true);
    expect(token.document.update).toHaveBeenCalledWith(
      { "texture.scaleX": 0.5 },
      expect.objectContaining({ animation: { duration: 120 } })
    );
  });

  it("knows when the token is already flipped", () => {
    const token = makeToken();
    token.document.texture = { scaleX: -1 };
    expect(isTokenFlipped(token)).toBe(true);
  });

  it("raises and lowers height by the grid step", async () => {
    const token = makeToken();
    token.document._source = { elevation: 0 };
    token.document.elevation = 0;
    expect(getElevationStep()).toBe(5);
    expect(getTokenElevation(token)).toBe(0);
    await nudgeTokenElevation(token, 1);
    expect(token.document.update).toHaveBeenCalledWith({ elevation: 5 }, { animate: false });
    token.document._source = { elevation: 5 };
    token.document.elevation = 5;
    await nudgeTokenElevation(token, -1);
    expect(token.document.update).toHaveBeenCalledWith({ elevation: 0 }, { animate: false });
  });

  it("shows height relative to the current floor", () => {
    globalThis.canvas.level = { elevation: { base: 10 } };
    const token = makeToken();
    token.document._source = { elevation: 10 };
    token.document.elevation = 10;
    expect(getTokenElevation(token)).toBe(0);
  });

  it("snaps off-step height to the next square", () => {
    expect(nextElevation(-2, 1, 5)).toBe(0);
    expect(nextElevation(-2, -1, 5)).toBe(-5);
    expect(nextElevation(3, 1, 5)).toBe(5);
    expect(nextElevation(3, -1, 5)).toBe(0);
  });
});
