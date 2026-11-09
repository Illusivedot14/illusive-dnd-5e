import { describe, it, expect, beforeEach } from "vitest";
import { installFoundry } from "./helpers.mjs";
import { setting, settingOn } from "../src/hud/lib/hud-settings.mjs";

describe("hud-settings", () => {
  let handles;
  beforeEach(() => {
    handles = installFoundry({
      settings: { partySize: "large", flagOff: false, flagOn: true }
    });
  });

  it("setting() returns the raw stored value", () => {
    expect(setting("partySize")).toBe("large");
    expect(setting("missing")).toBeUndefined();
  });

  describe("settingOn", () => {
    it("is true when the setting is unset (default-true semantics)", () => {
      expect(settingOn("neverRegistered")).toBe(true);
    });

    it("is true when explicitly true", () => {
      expect(settingOn("flagOn")).toBe(true);
    });

    it("is false only when explicitly false", () => {
      expect(settingOn("flagOff")).toBe(false);
    });

    it("treats non-false values as on", () => {
      handles.setSetting("weird", 0);
      expect(settingOn("weird")).toBe(true);
    });
  });
});
