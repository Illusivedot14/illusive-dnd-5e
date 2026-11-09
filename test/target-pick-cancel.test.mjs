// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { installFoundry, makeToken } from "./helpers.mjs";

vi.mock("../src/hud/lib/render/core.mjs", () => ({
  refreshHud: vi.fn()
}));
vi.mock("../src/hud/lib/overlay-guard.mjs", () => ({
  dismissFloatingHudChrome: vi.fn()
}));

import {
  startTargetPick,
  confirmTargetPick,
  cancelTargetPick,
  isTargetPickActive,
  getTargetPickState
} from "../src/hud/components/action-bar/action-bar-target-picker.mjs";

describe("target pick survives failed use", () => {
  beforeEach(() => {
    const target = makeToken({ id: "t2", name: "Goblin" });
    installFoundry({ targets: [target] });
    document.body.className = "";
    cancelTargetPick({ clearTargets: false });
    globalThis.ui = {
      notifications: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    };
    globalThis.Hooks = { on: vi.fn(), off: vi.fn() };
  });

  it("confirmTargetPick keeps pick mode so Cancel still works after a warn path", async () => {
    await startTargetPick({
      tokenId: "t1",
      actorId: "a1",
      itemId: "i1",
      activityId: "act",
      section: "action",
      spellLevel: null,
      isStandard: false,
      actionId: null,
      required: 1,
      abilityName: "Fire Bolt"
    });

    expect(isTargetPickActive()).toBe(true);
    const pending = confirmTargetPick();
    expect(pending?.abilityName).toBe("Fire Bolt");
    // Still active — finishTargetPickAndUse only cancels after a successful use.
    expect(isTargetPickActive()).toBe(true);
    expect(getTargetPickState()?.tokenId).toBe("t1");
    expect(document.body.classList.contains("illusive-dnd-target-picking")).toBe(true);

    expect(cancelTargetPick()).toBe(true);
    expect(isTargetPickActive()).toBe(false);
    expect(document.body.classList.contains("illusive-dnd-target-picking")).toBe(false);
  });

  it("cancelTargetPick tears down even if state was already cleared", () => {
    document.body.classList.add("illusive-dnd-target-picking");
    expect(cancelTargetPick()).toBe(true);
    expect(document.body.classList.contains("illusive-dnd-target-picking")).toBe(false);
  });
});
