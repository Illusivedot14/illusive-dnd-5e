import { afterEach, describe, expect, it, vi } from "vitest";
import { applyEarlyMobileBootClass, isPhoneOrTablet } from "../src/hud/lib/mobile-boot.mjs";
import { detectMobileDevice, isNativeMobile } from "../src/hud/lib/mobile-client.mjs";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15";
const IPAD_DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID_TABLET = "Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36";
const DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36";
const WINDOWS_TABLE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36";

function setDevice({ ua, touch = 0, coarse = false, width = 1920, height = 1080 }) {
  vi.stubGlobal("navigator", { userAgent: ua, maxTouchPoints: touch });
  vi.stubGlobal("screen", { width, height });
  vi.stubGlobal("matchMedia", (query) => ({
    matches: coarse && String(query).includes("pointer: coarse"),
    media: query
  }));
}

describe("isPhoneOrTablet", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("treats phones as handheld", () => {
    setDevice({ ua: IPHONE, touch: 5, width: 390, height: 844 });
    expect(isPhoneOrTablet()).toBe(true);
    expect(isNativeMobile()).toBe(true);
  });

  it("treats an iPad desktop user agent as a tablet", () => {
    setDevice({ ua: IPAD_DESKTOP, touch: 5, width: 1376, height: 1032 });
    expect(isPhoneOrTablet()).toBe(true);
  });

  it("treats an Android tablet user agent as a tablet", () => {
    setDevice({ ua: ANDROID_TABLET, touch: 5, width: 1280, height: 800 });
    expect(isPhoneOrTablet()).toBe(true);
  });

  it("treats a coarse pointer inside tablet dimensions as a tablet", () => {
    setDevice({ ua: WINDOWS_TABLE, touch: 5, coarse: true, width: 1366, height: 1024 });
    expect(isPhoneOrTablet()).toBe(true);
  });

  it("leaves a desktop browser on the canvas", () => {
    setDevice({ ua: DESKTOP, touch: 0, width: 2560, height: 1440 });
    expect(isPhoneOrTablet()).toBe(false);
  });

  it("leaves the 1080p touch table on the canvas", () => {
    setDevice({ ua: WINDOWS_TABLE, touch: 10, coarse: true, width: 1920, height: 1080 });
    expect(isPhoneOrTablet()).toBe(false);
    setDevice({ ua: WINDOWS_TABLE, touch: 10, coarse: true, width: 1080, height: 1920 });
    expect(isPhoneOrTablet()).toBe(false);
  });

  it("does not treat a huge touch Mac as an iPad", () => {
    setDevice({ ua: IPAD_DESKTOP, touch: 10, coarse: true, width: 2560, height: 1440 });
    expect(isPhoneOrTablet()).toBe(false);
  });

  it("does not treat a huge Android display as a tablet", () => {
    setDevice({ ua: ANDROID_TABLET, touch: 10, coarse: true, width: 3840, height: 2160 });
    expect(isPhoneOrTablet()).toBe(false);
  });
});

describe("applyEarlyMobileBootClass", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function installDocument(sticky = null) {
    const classes = new Set();
    const store = new Map();
    if (sticky != null) store.set("illusive-dnd-mobile-boot", sticky);
    const classList = {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name)
    };
    vi.stubGlobal("document", {
      documentElement: { classList },
      body: { classList: { add() {}, remove() {} } },
      head: { appendChild() {} },
      getElementById: () => null,
      createElement: () => ({ id: "", textContent: "" })
    });
    vi.stubGlobal("sessionStorage", {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, value)
    });
    return { classes, store };
  }

  it("hides chrome on an iPad before the user is known", () => {
    setDevice({ ua: IPAD_DESKTOP, touch: 5, width: 1376, height: 1032 });
    const { classes } = installDocument(null);
    expect(applyEarlyMobileBootClass()).toBe(true);
    expect(classes.has("illusive-dnd-mobile-boot")).toBe(true);
  });

  it("keeps a saved sheet session on reload even if the user agent is a desktop Mac", () => {
    setDevice({ ua: DESKTOP, touch: 0, width: 1376, height: 1032 });
    const { classes, store } = installDocument("1");
    expect(applyEarlyMobileBootClass()).toBe(true);
    expect(classes.has("illusive-dnd-mobile-boot")).toBe(true);
    expect(store.get("illusive-dnd-mobile-boot")).toBe("1");
  });

  it("does not hide chrome on the touch table", () => {
    setDevice({ ua: WINDOWS_TABLE, touch: 10, coarse: true, width: 1920, height: 1080 });
    const { classes } = installDocument(null);
    expect(applyEarlyMobileBootClass()).toBe(false);
    expect(classes.has("illusive-dnd-mobile-boot")).toBe(false);
  });

  it("clears a saved sheet session when the display is huge", () => {
    setDevice({ ua: IPAD_DESKTOP, touch: 10, coarse: true, width: 2560, height: 1440 });
    const { classes, store } = installDocument("1");
    expect(applyEarlyMobileBootClass()).toBe(false);
    expect(classes.has("illusive-dnd-mobile-boot")).toBe(false);
    expect(store.get("illusive-dnd-mobile-boot")).toBe("0");
  });
});

describe("detectMobileDevice", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function setPlayer() {
    vi.stubGlobal("game", {
      user: { isGM: false, name: "Player" },
      settings: { get: () => "auto" }
    });
  }

  it("keeps a player on the canvas when the display is huge", () => {
    setDevice({ ua: IPAD_DESKTOP, touch: 10, coarse: true, width: 2560, height: 1440 });
    setPlayer();
    expect(detectMobileDevice()).toBe(false);
  });

  it("uses the sheet for a player on an iPad", () => {
    setDevice({ ua: IPAD_DESKTOP, touch: 5, width: 1376, height: 1032 });
    setPlayer();
    expect(detectMobileDevice()).toBe(true);
  });
});
