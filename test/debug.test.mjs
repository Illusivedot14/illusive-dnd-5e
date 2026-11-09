import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { installFoundry } from "./helpers.mjs";
import {
  debugLog,
  isDebugLoggingEnabled,
  DEBUG_SETTING_KEY,
  DEBUG_CHANNELS
} from "../src/foundry/debug.mjs";

describe("debug logging", () => {
  let logSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("is off by default and emits nothing", () => {
    installFoundry({ settings: {} });
    expect(isDebugLoggingEnabled()).toBe(false);
    debugLog(DEBUG_CHANNELS.TEMPLATE, "placer.confirm", { width: 5 });
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("emits channel-prefixed lines when debugLogging is on", () => {
    installFoundry({ settings: { [DEBUG_SETTING_KEY]: true } });
    expect(isDebugLoggingEnabled()).toBe(true);
    debugLog(DEBUG_CHANNELS.TEMPLATE, "placer.confirm", { width: 5 });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const [prefix, payload] = logSpy.mock.calls[0];
    expect(prefix).toBe("[illusive-dnd-5e:template] placer.confirm");
    expect(payload).toBe(JSON.stringify({ width: 5 }));
  });

  it("gates game-log channel the same way", () => {
    installFoundry({ settings: { [DEBUG_SETTING_KEY]: false } });
    debugLog(DEBUG_CHANNELS.GAME_LOG, "record.resolution", { id: 1 });
    expect(logSpy).not.toHaveBeenCalled();

    installFoundry({ settings: { [DEBUG_SETTING_KEY]: true } });
    debugLog(DEBUG_CHANNELS.GAME_LOG, "record.resolution", { id: 1 });
    expect(logSpy.mock.calls[0][0]).toBe("[illusive-dnd-5e:game-log] record.resolution");
  });
});
