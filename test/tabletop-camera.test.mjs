import { afterEach, describe, expect, it, vi } from "vitest";
import { installFoundry, makeCollection } from "./helpers.mjs";
import {
  acceptRemoteView,
  guardTabletopCamera,
  onTabletopCanvasPan,
  recenterTabletop,
  resetTabletopLock,
  tabletopHeldView
} from "../src/tabletop/lock.mjs";
import { driveLocalTable, driveTableFromStick, noteTabletopReport, resetTabletopPilot, tabletopShadowView } from "../src/tabletop/pilot.mjs";
import { setTabletopChrome } from "../src/tabletop/chrome.mjs";
import { handleTabletopMessage } from "../src/tabletop/index.mjs";

function usersOf(...users) {
  globalThis.game.users = makeCollection(users);
}

describe("tabletop lock", () => {
  afterEach(() => {
    resetTabletopLock();
    vi.unstubAllGlobals();
  });

  it("keeps the chosen tabletop view when something else pans", () => {
    installFoundry({ settings: { tabletopUser: "user1", tabletopCameraUser: "pilot" } });
    globalThis.game.user.name = "Table";
    const pans = [];
    globalThis.canvas.pan = (view) => pans.push({ ...view });
    guardTabletopCamera();
    acceptRemoteView({ x: 10, y: 20, scale: 1 });
    pans.length = 0;

    globalThis.canvas.pan({ x: 500, y: 500, scale: 2 });
    expect(pans).toEqual([{ x: 10, y: 20, scale: 1 }]);
    expect(tabletopHeldView()).toMatchObject({ x: 10, y: 20, scale: 1 });
  });

  it("applies a view the camera user sent", () => {
    installFoundry({ settings: { tabletopUser: "user1", tabletopCameraUser: "pilot" } });
    globalThis.game.user.name = "Table";
    const pans = [];
    globalThis.canvas.pan = (view) => pans.push({ ...view });
    guardTabletopCamera();
    acceptRemoteView({ x: 80, y: 40, scale: 1.5, sceneId: "scene1" });
    expect(pans.at(-1)).toMatchObject({ x: 80, y: 40, scale: 1.5 });
  });

  it("snaps a stray pan back to the held view", () => {
    installFoundry({ settings: { tabletopUser: "user1", tabletopCameraUser: "pilot" } });
    globalThis.game.user.name = "Table";
    const pans = [];
    globalThis.canvas.pan = (view) => pans.push({ ...view });
    guardTabletopCamera();
    acceptRemoteView({ x: 4, y: 5, scale: 1 });
    pans.length = 0;
    expect(onTabletopCanvasPan({ x: 9, y: 9, scale: 1 })).toBe(true);
    expect(pans.at(-1)).toMatchObject({ x: 4, y: 5, scale: 1 });
  });

  it("recenters the table on its focused token", () => {
    installFoundry({
      tokens: [{ id: "tok", center: { x: 300, y: 120 } }],
      settings: { tabletopUser: "user1", tabletopCameraUser: "pilot" }
    });
    globalThis.game.user.name = "Table";
    globalThis.game.settings._store.set("actionBarLastTokenId", "tok");
    const pans = [];
    globalThis.canvas.pan = (view) => pans.push({ ...view });
    guardTabletopCamera();
    acceptRemoteView({ x: 1, y: 1, scale: 1 });
    recenterTabletop();
    expect(pans.at(-1)).toMatchObject({ x: 300, y: 120, scale: 1 });
  });

  it("lets the table move its own camera when it is also the controller", () => {
    installFoundry({ settings: { tabletopUser: "user1", tabletopCameraUser: "user1" } });
    const pans = [];
    globalThis.canvas.pan = (view) => pans.push({ ...view });
    guardTabletopCamera();
    acceptRemoteView({ x: 0, y: 0, scale: 1, minScale: 0.1, maxScale: 3 });
    pans.length = 0;
    expect(driveLocalTable({ stick: { x: 1, y: 0 }, zoomHeld: null, dt: 1 })).toBe(true);
    expect(pans.at(-1).x).toBeGreaterThan(0);
  });

  it("hides Foundry chrome on the tabletop client", () => {
    const classes = new Set();
    vi.stubGlobal("document", {
      documentElement: { classList: { toggle: (name, on) => { if (on) classes.add(name); else classes.delete(name); } } },
      body: { classList: { toggle() {} } },
      head: { appendChild() {} },
      getElementById: () => null,
      createElement: () => ({ id: "", textContent: "" })
    });
    setTabletopChrome(true);
    expect(classes.has("illusive-dnd-tabletop")).toBe(true);
    setTabletopChrome(false);
    expect(classes.has("illusive-dnd-tabletop")).toBe(false);
  });
});

describe("tabletop pilot", () => {
  afterEach(() => {
    resetTabletopPilot();
    vi.unstubAllGlobals();
  });

  it("asks the table for its view before the first move", () => {
    installFoundry({ settings: { tabletopUser: "table", tabletopCameraUser: "user1" } });
    globalThis.game.user.name = "Pilot";
    const emit = vi.fn();
    globalThis.game.socket = { emit };
    expect(driveTableFromStick({ stick: { x: 1, y: 0 }, zoomHeld: null, dt: 1 })).toBe(true);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][1]).toMatchObject({ type: "tabletop-camera", action: "request" });
    expect(tabletopShadowView()).toBeNull();
  });

  it("sends the table's view, not the controller's map", () => {
    installFoundry({ settings: { tabletopUser: "table", tabletopCameraUser: "user1" } });
    globalThis.game.user.name = "Pilot";
    const emit = vi.fn();
    globalThis.game.socket = { emit };
    noteTabletopReport({ x: 100, y: 40, scale: 1, sceneId: "scene1", minScale: 0.1, maxScale: 3 });
    driveTableFromStick({ stick: { x: 1, y: 0 }, zoomHeld: null, dt: 1 });
    const sent = emit.mock.calls.at(-1)[1];
    expect(sent.action).toBe("set");
    expect(sent.sceneId).toBe("scene1");
    expect(sent.x).toBeGreaterThan(100);
    expect(sent.y).toBeCloseTo(40);
  });
});

describe("tabletop socket", () => {
  afterEach(() => {
    resetTabletopLock();
    resetTabletopPilot();
    vi.unstubAllGlobals();
  });

  it("ignores a pan that did not come from the camera user", () => {
    installFoundry({ settings: { tabletopUser: "user1", tabletopCameraUser: "pilot" } });
    globalThis.game.user.name = "Table";
    usersOf(
      { id: "player", name: "Vesper", isGM: false },
      { id: "pilot", name: "Pilot", isGM: false }
    );
    const pans = [];
    globalThis.canvas.pan = (view) => pans.push({ ...view });
    guardTabletopCamera();
    acceptRemoteView({ x: 1, y: 2, scale: 1, sceneId: "scene1" });
    pans.length = 0;
    handleTabletopMessage({
      type: "tabletop-camera",
      action: "set",
      fromUserId: "player",
      x: 90,
      y: 90,
      scale: 2,
      sceneId: "scene1"
    });
    expect(pans).toEqual([]);
    expect(tabletopHeldView()).toMatchObject({ x: 1, y: 2, scale: 1 });
  });

  it("moves the table when the camera user sends a view", () => {
    installFoundry({ settings: { tabletopUser: "user1", tabletopCameraUser: "pilot" } });
    globalThis.game.user.name = "Table";
    usersOf({ id: "pilot", name: "Pilot", isGM: false });
    const pans = [];
    globalThis.canvas.pan = (view) => pans.push({ ...view });
    guardTabletopCamera();
    handleTabletopMessage({
      type: "tabletop-camera",
      action: "set",
      fromUserId: "pilot",
      x: 50,
      y: 60,
      scale: 1.25,
      sceneId: "scene1"
    });
    expect(pans.at(-1)).toMatchObject({ x: 50, y: 60, scale: 1.25 });
  });

  it("records a report from the tabletop user on the camera client", () => {
    installFoundry({ settings: { tabletopUser: "table", tabletopCameraUser: "user1" } });
    globalThis.game.user.name = "Pilot";
    usersOf({ id: "table", name: "Table", isGM: false });
    handleTabletopMessage({
      type: "tabletop-camera",
      action: "report",
      fromUserId: "table",
      x: 12,
      y: 18,
      scale: 0.8,
      sceneId: "scene1",
      minScale: 0.2,
      maxScale: 2
    });
    expect(tabletopShadowView()).toMatchObject({ x: 12, y: 18, scale: 0.8, sceneId: "scene1" });
  });
});
