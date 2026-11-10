import { describe, it, expect } from "vitest";
import { installFoundry } from "./helpers.mjs";
import {
  applyCanvasView,
  clampStick,
  offsetToStick,
  stickToSceneDelta,
  nextScale,
  nextViewPosition,
  withLockViewUnlocked
} from "../src/foundry/camera-control.mjs";
import { shouldShowCameraPad } from "../src/hud/components/camera-pad/camera-pad.mjs";

function asUser(name, { isGM = false, settings = {} } = {}) {
  // Camera pad is desktop chrome — keep players off mobile-sheet mode in these tests.
  installFoundry({
    isGM,
    settings: { enableMobileSheet: false, mobileClientMode: "forceDesktop", ...settings }
  });
  globalThis.game.user.name = name;
}

describe("clampStick", () => {
  it("leaves a short stick alone", () => {
    expect(clampStick(0.3, -0.4)).toEqual({ x: 0.3, y: -0.4 });
  });

  it("caps a long stick at length 1", () => {
    const stick = clampStick(3, 4);
    expect(stick.x).toBeCloseTo(0.6);
    expect(stick.y).toBeCloseTo(0.8);
  });
});

describe("offsetToStick", () => {
  it("maps the pad radius to a full tilt", () => {
    expect(offsetToStick(40, 0, 40)).toEqual({ x: 1, y: 0 });
  });
});

describe("stickToSceneDelta", () => {
  it("moves farther when zoomed out", () => {
    const wide = stickToSceneDelta(1, 0, 0.5, 1, 100);
    const tight = stickToSceneDelta(1, 0, 2, 1, 100);
    expect(wide.dx).toBeCloseTo(200);
    expect(tight.dx).toBeCloseTo(50);
  });

  it("does nothing at rest", () => {
    expect(stickToSceneDelta(0, 0, 1, 1, 400)).toEqual({ dx: 0, dy: 0 });
  });
});

describe("nextScale", () => {
  it("zooms in and out over time", () => {
    expect(nextScale(1, "in", 1)).toBeGreaterThan(1);
    expect(nextScale(1, "out", 1)).toBeLessThan(1);
  });

  it("stays put when no zoom is held", () => {
    expect(nextScale(1.2, null, 1)).toBeCloseTo(1.2);
  });
});

describe("nextViewPosition", () => {
  it("shifts the current view", () => {
    expect(nextViewPosition({ x: 100, y: 40, scale: 1 }, { dx: 10, dy: -5 }))
      .toEqual({ x: 110, y: 35, scale: 1 });
  });
});

describe("withLockViewUnlocked", () => {
  it("drops Lock View applyLocks only while the pad moves the camera", () => {
    const seen = [];
    globalThis.lockView = { locks: { applyLocks: true, pan: true, zoom: true } };
    withLockViewUnlocked(() => {
      seen.push(globalThis.lockView.locks.applyLocks);
    });
    expect(seen).toEqual([false]);
    expect(globalThis.lockView.locks.applyLocks).toBe(true);
  });

  it("keeps applyLocks off until an async pan finishes", async () => {
    let resolvePan;
    const pan = new Promise((resolve) => { resolvePan = resolve; });
    globalThis.lockView = { locks: { applyLocks: true } };
    const done = withLockViewUnlocked(() => pan);
    expect(globalThis.lockView.locks.applyLocks).toBe(false);
    resolvePan();
    await done;
    expect(globalThis.lockView.locks.applyLocks).toBe(true);
  });
});

describe("applyCanvasView", () => {
  it("pans even when Lock View has the camera locked", () => {
    const pans = [];
    installFoundry();
    globalThis.canvas.pan = (view) => {
      pans.push({
        view,
        locked: globalThis.lockView.locks.applyLocks
      });
    };
    globalThis.lockView = { locks: { applyLocks: true, pan: true, zoom: true } };
    expect(applyCanvasView({ x: 40, y: 80, scale: 1.2 })).toBe(true);
    expect(pans).toEqual([{ view: { x: 40, y: 80, scale: 1.2 }, locked: false }]);
    expect(globalThis.lockView.locks.applyLocks).toBe(true);
  });
});

describe("shouldShowCameraPad", () => {
  it("shows the pad only for the user chosen to move the table", () => {
    asUser("Table", { settings: { tabletopUser: "user1", tabletopCameraUser: "pilot" } });
    expect(shouldShowCameraPad()).toBe(false);
    asUser("Pilot", { settings: { tabletopUser: "table", tabletopCameraUser: "user1" } });
    expect(shouldShowCameraPad()).toBe(true);
  });

  it("shows the pad on the table when that user is also the controller", () => {
    asUser("Table", { settings: { tabletopUser: "user1", tabletopCameraUser: "user1" } });
    expect(shouldShowCameraPad()).toBe(true);
  });

  it("hides for every other player by default", () => {
    asUser("Vesper");
    expect(shouldShowCameraPad()).toBe(false);
    asUser("Broccoli");
    expect(shouldShowCameraPad()).toBe(false);
    asUser("Mirena");
    expect(shouldShowCameraPad()).toBe(false);
  });

  it("hides when this client disables the pad", () => {
    asUser("Pilot", {
      settings: { enableCameraPad: false, tabletopUser: "table", tabletopCameraUser: "user1" }
    });
    expect(shouldShowCameraPad()).toBe(false);
  });

  it("shows only the listed users", () => {
    asUser("Vesper", { settings: { cameraPadVisibleTo: ["user1"] } });
    expect(shouldShowCameraPad()).toBe(true);
    asUser("Vesper", { settings: { cameraPadVisibleTo: ["other"] } });
    expect(shouldShowCameraPad()).toBe(false);
  });

  it("hides everyone when the list is empty", () => {
    asUser("Touchscreen", { settings: { cameraPadVisibleTo: [] } });
    expect(shouldShowCameraPad()).toBe(false);
  });
});
