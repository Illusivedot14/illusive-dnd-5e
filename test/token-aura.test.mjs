// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { installFoundry } from "./helpers.mjs";
import {
  MAX_AURAS,
  auraRadiusPixels,
  auraDrawRadiusPixels,
  readTokenAuras,
  writeTokenAuras,
  paintTokenAura,
  DEFAULT_AURA_COLOR
} from "../src/hud/components/token-aura/token-aura.mjs";
import {
  addTokenAura,
  applyAuraColor,
  applyAuraFeet,
  buildAuraDropdownContext,
  selectAuraSlot
} from "../src/hud/components/token-aura/token-aura-picker.mjs";
import { openMobileAuraMenu } from "../src/hud/components/mobile-sheet/mobile-controller-menus.mjs";
import { MOBILE_SHEET_CRITICAL_CSS } from "../src/hud/components/mobile-sheet/mobile-sheet-styles.mjs";
import { initI18n } from "../src/i18n/core.mjs";

function installAuraMenuStyles() {
  document.documentElement.classList.add("illusive-dnd-mobile-client");
  document.body.classList.add("illusive-dnd-mobile-client");
  const foundryButtons = document.createElement("style");
  foundryButtons.textContent = `
    button { width: 100%; flex: 1; padding: 8px 16px; min-height: 32px; }
  `;
  document.head.appendChild(foundryButtons);
  const mobile = document.createElement("style");
  mobile.textContent = MOBILE_SHEET_CRITICAL_CSS;
  document.head.appendChild(mobile);
}

function circleBox(el) {
  const style = getComputedStyle(el);
  return {
    width: style.width,
    height: style.height,
    minWidth: style.minWidth,
    maxWidth: style.maxWidth,
    flexGrow: style.flexGrow,
    flexShrink: style.flexShrink,
    padding: style.padding,
    radius: style.borderRadius
  };
}

function makeAuraDoc(initial = {}) {
  const flags = { ...initial };
  return {
    canUserModify: () => true,
    getFlag: (_scope, key) => flags[key],
    setFlag: vi.fn(async (_scope, key, value) => { flags[key] = value; }),
    unsetFlag: vi.fn(async (_scope, key) => { delete flags[key]; })
  };
}

/** Phone noCanvas token: getFlag is empty, rings live on _source. */
function makePhoneToken(auras) {
  const listed = Array.isArray(auras)
    ? Object.fromEntries(auras.map((aura, index) => [String(index), aura]))
    : structuredClone(auras);
  const doc = {
    isOwner: true,
    flags: {},
    _source: { flags: { "illusive-dnd-5e": { auras: listed } } },
    getFlag: vi.fn(() => undefined),
    setFlag: vi.fn(async (_scope, key, value) => {
      doc._source.flags["illusive-dnd-5e"][key] = value;
    }),
    unsetFlag: vi.fn(async (_scope, key) => {
      delete doc._source.flags["illusive-dnd-5e"][key];
    })
  };
  return { id: "t1", document: doc, isOwner: true };
}

/** Foundry stores flag arrays as {0,1,2} and can leave _source stale after unsetFlag. */
function makeFoundryAuraDoc(initial = {}) {
  const live = structuredClone(initial);
  const source = structuredClone(initial);
  return {
    canUserModify: () => true,
    flags: { "illusive-dnd-5e": live },
    _source: { flags: { "illusive-dnd-5e": source } },
    getFlag: (_scope, key) => live[key],
    setFlag: vi.fn(async (_scope, key, value) => {
      live[key] = value;
    }),
    unsetFlag: vi.fn(async (_scope, key) => { delete live[key]; })
  };
}


describe("token aura", () => {
  beforeEach(() => {
    installFoundry();
    globalThis.game.user = { isGM: true, id: "gm" };
    globalThis.ui = { notifications: { warn: vi.fn() } };
    selectAuraSlot(0);
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("reads no auras as empty", () => {
    expect(readTokenAuras({})).toEqual([]);
  });

  it("migrates a single legacy aura flag", () => {
    const doc = makeAuraDoc({ aura: { feet: 15, color: "#4090e0" } });
    expect(readTokenAuras(doc)).toEqual([
      { index: 0, feet: 15, color: "#4090e0", on: true }
    ]);
  });

  it("measures a true circle from the grid", () => {
    expect(auraRadiusPixels(10, { distance: 5, size: 100 })).toBe(200);
    expect(auraRadiusPixels(0, { distance: 5, size: 100 })).toBe(0);
  });

  it("adds half the token footprint so auras start at the creature edge", () => {
    const grid = { distance: 5, size: 100 };
    // Medium 1×1: half extent 50px + 10ft (200px) = 250
    expect(auraDrawRadiusPixels(10, { w: 100, h: 100 }, grid)).toBe(250);
    // Large 2×2: half extent 100px + 10ft = 300
    expect(auraDrawRadiusPixels(10, {
      w: 200,
      h: 200,
      document: { width: 2, height: 2 }
    }, grid)).toBe(300);
  });

  it("stores auras as a list and clears them with off", async () => {
    const doc = makeAuraDoc();
    await writeTokenAuras({ document: doc }, [{ feet: 15, color: "#4090e0" }]);
    expect(doc.getFlag("illusive-dnd-5e", "auras")).toEqual([
      { feet: 15, color: "#4090e0" }
    ]);

    await applyAuraFeet({ document: doc }, 0);
    expect(doc.getFlag("illusive-dnd-5e", "auras")).toEqual([]);
  });

  it("adds a second and third aura, then stops", async () => {
    const doc = makeAuraDoc();
    await applyAuraFeet({ document: doc }, 10);
    await addTokenAura({ document: doc });
    await addTokenAura({ document: doc });
    const blocked = await addTokenAura({ document: doc });
    const auras = readTokenAuras(doc);
    expect(auras).toHaveLength(MAX_AURAS);
    expect(blocked).toBe(false);
    expect(buildAuraDropdownContext({ document: doc }).canAdd).toBe(false);
  });

  it("edits the selected slot without changing the others", async () => {
    const doc = makeAuraDoc();
    await writeTokenAuras({ document: doc }, [
      { feet: 10, color: "#e07020" },
      { feet: 20, color: "#4090e0" }
    ]);
    selectAuraSlot(1);
    await applyAuraFeet({ document: doc }, 30);
    await applyAuraColor({ document: doc }, "#40b060");
    expect(readTokenAuras(doc)).toEqual([
      { index: 0, feet: 10, color: "#e07020", on: true },
      { index: 1, feet: 30, color: "#40b060", on: true }
    ]);
  });

  it("turns a color pick on at 10 ft when none exist", async () => {
    const doc = makeAuraDoc();
    await applyAuraColor({ document: doc }, "#40b060");
    expect(readTokenAuras(doc)[0]).toMatchObject({ feet: 10, color: "#40b060" });
  });

  it("marks the matching size on the selected aura", () => {
    const ctx = buildAuraDropdownContext({
      document: makeAuraDoc({ auras: [{ feet: 10, color: DEFAULT_AURA_COLOR }] })
    });
    expect(ctx.feet.find((c) => c.feet === 10).isActive).toBe(true);
    expect(ctx.offActive).toBe(false);
    expect(ctx.feetValue).toBe(10);
    expect(ctx.colors.find((c) => c.color === DEFAULT_AURA_COLOR).isActive).toBe(true);
    expect(ctx.slots).toHaveLength(1);
    expect(ctx.canAdd).toBe(true);
  });

  it("accepts a typed radius and any hex color", async () => {
    const doc = makeAuraDoc();
    await applyAuraFeet({ document: doc }, 12);
    await applyAuraColor({ document: doc }, "#a1b2c3");
    expect(readTokenAuras(doc)[0]).toMatchObject({ feet: 12, color: "#a1b2c3" });
    expect(buildAuraDropdownContext({ document: doc }).customColor).toBe(true);
  });

  it("keeps phone swatches and slot dots as circles under Foundry button CSS", async () => {
    installAuraMenuStyles();
    const doc = makeAuraDoc({ auras: [{ feet: 10, color: DEFAULT_AURA_COLOR }] });
    await openMobileAuraMenu({ document: doc });

    const swatch = document.querySelector(".illusive-dnd-ms-aura-swatch");
    const dot = document.querySelector(".illusive-dnd-ms-aura-dot");
    const swatchBox = circleBox(swatch);
    const dotBox = circleBox(dot);

    expect(swatchBox.width).toBe(swatchBox.height);
    expect(swatchBox.width).toBe("36px");
    expect(swatchBox.minWidth).toBe("36px");
    expect(swatchBox.maxWidth).toBe("36px");
    expect(swatchBox.flexGrow).toBe("0");
    expect(swatchBox.padding).toBe("0px");
    expect(swatchBox.radius).toBe("50%");

    expect(dotBox.width).toBe(dotBox.height);
    expect(dotBox.width).toBe("18px");
    expect(dotBox.flexGrow).toBe("0");
    expect(dotBox.flexShrink).toBe("0");

    const row = document.querySelector(".illusive-dnd-ms-aura-slots");
    const rowBox = getComputedStyle(row);
    expect(rowBox.display).toBe("flex");
    expect(rowBox.flexDirection).toBe("row");
    expect(rowBox.flexWrap).toBe("nowrap");
    expect(document.querySelector(".illusive-dnd-ms-settings-list [data-aura-slot]")).toBeNull();

    const actions = document.querySelector(".illusive-dnd-ms-aura-actions");
    const actionsBox = getComputedStyle(actions);
    expect(actionsBox.display).toBe("flex");
    expect(actionsBox.flexDirection).toBe("row");
    expect(actionsBox.flexWrap).toBe("nowrap");
    expect(actions.querySelector("[data-aura-add]")).toBeTruthy();
    expect(actions.querySelector("[data-aura-feet='0']")).toBeTruthy();
    expect(document.querySelector(".illusive-dnd-ms-settings-list [data-aura-add]")).toBeNull();
    expect(document.querySelector(".illusive-dnd-ms-settings-list [data-aura-feet='0']")).toBeNull();
  });

  it("keeps the phone menu scrolled unless an aura is added", async () => {
    const doc = makeAuraDoc({ auras: [{ feet: 10, color: DEFAULT_AURA_COLOR }] });
    await openMobileAuraMenu({ document: doc });
    const overlay = document.querySelector(".illusive-dnd-ms-aura-overlay");
    const dialog = () => overlay.querySelector(".illusive-dnd-ms-settings-dialog");
    const previous = {
      scrollHeight: Object.getOwnPropertyDescriptor(Element.prototype, "scrollHeight"),
      clientHeight: Object.getOwnPropertyDescriptor(Element.prototype, "clientHeight")
    };
    Object.defineProperty(Element.prototype, "scrollHeight", { configurable: true, get() { return 2000; } });
    Object.defineProperty(Element.prototype, "clientHeight", { configurable: true, get() { return 400; } });
    try {
      dialog().scrollTop = 320;
      overlay.querySelector("[data-aura-feet='20']").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await vi.waitFor(() => {
        expect(overlay.querySelector("[data-aura-feet='20']").classList.contains("is-current")).toBe(true);
        expect(dialog().scrollTop).toBe(320);
      });

      dialog().scrollTop = 320;
      overlay.querySelector("[data-aura-add]").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await vi.waitFor(() => {
        expect(overlay.querySelectorAll("[data-aura-slot]")).toHaveLength(2);
        expect(dialog().scrollTop).toBe(0);
      });
    } finally {
      for (const [key, descriptor] of Object.entries(previous)) {
        if (descriptor) Object.defineProperty(Element.prototype, key, descriptor);
      }
    }
  });

  it("sets a custom size from the phone number field", async () => {
    await initI18n();
    const doc = makeAuraDoc({ auras: [{ feet: 10, color: DEFAULT_AURA_COLOR }] });
    await openMobileAuraMenu({ document: doc });
    const overlay = document.querySelector(".illusive-dnd-ms-aura-overlay");
    const input = overlay.querySelector("[data-aura-feet-input]");
    expect(input.value).toBe("10");

    input.value = "12";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => {
      expect(readTokenAuras(doc)[0]).toMatchObject({ feet: 12 });
      expect(overlay.querySelector("[data-aura-slot]").textContent).toContain("12");
      expect(overlay.querySelector("[data-aura-feet-input]").value).toBe("12");
    });
  });

  it("updates the phone menu on click for add, size, color, and off", async () => {
    const doc = makeAuraDoc({ auras: [{ feet: 10, color: DEFAULT_AURA_COLOR }] });
    await openMobileAuraMenu({ document: doc });
    const overlay = document.querySelector(".illusive-dnd-ms-aura-overlay");

    overlay.querySelector("[data-aura-add]").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => {
      expect(overlay.querySelectorAll("[data-aura-slot]")).toHaveLength(2);
    });

    overlay.querySelector("[data-aura-feet='20']").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => {
      expect(overlay.querySelector("[data-aura-feet='20']").classList.contains("is-current")).toBe(true);
      expect(readTokenAuras(doc)[1]).toMatchObject({ feet: 20 });
      expect(overlay.querySelectorAll("[data-aura-slot]")).toHaveLength(2);
    });

    const nextColor = overlay.querySelector(".illusive-dnd-ms-aura-swatch:not(.is-active)");
    const hex = nextColor.dataset.auraColor;
    nextColor.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => {
      expect(overlay.querySelector(`.illusive-dnd-ms-aura-swatch[data-aura-color="${hex}"]`).classList.contains("is-active")).toBe(true);
    });

    overlay.querySelector("[data-aura-feet='0']").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => {
      expect(overlay.querySelectorAll("[data-aura-slot]")).toHaveLength(1);
      expect(overlay.querySelector("[data-aura-feet='0']").classList.contains("is-current")).toBe(false);
    });
  });

  it("shows current auras that only exist on _source", () => {
    const token = makePhoneToken([{ feet: 15, color: "#4090e0" }]);
    expect(readTokenAuras(token)).toEqual([
      { index: 0, feet: 15, color: "#4090e0", on: true }
    ]);
    expect(buildAuraDropdownContext(token).slots).toHaveLength(1);
  });

  it("keeps the phone menu on the flag until the update settles", async () => {
    let resolveUpdate = () => {};
    const flags = { "illusive-dnd-5e": { auras: [{ feet: 10, color: DEFAULT_AURA_COLOR }] } };
    const doc = {
      canUserModify: () => true,
      flags,
      getFlag(_scope, key) { return flags["illusive-dnd-5e"][key]; },
      update: vi.fn((data) => new Promise((resolve) => {
        resolveUpdate = () => {
          flags["illusive-dnd-5e"].auras = data["flags.illusive-dnd-5e.auras"];
          resolve();
        };
      }))
    };
    await openMobileAuraMenu({ document: doc });
    const overlay = document.querySelector(".illusive-dnd-ms-aura-overlay");
    expect(overlay.querySelectorAll("[data-aura-slot]")).toHaveLength(1);

    overlay.querySelector("[data-aura-feet='0']").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    expect(doc.update).toHaveBeenCalled();
    expect(overlay.querySelectorAll("[data-aura-slot]")).toHaveLength(1);

    resolveUpdate();
    await vi.waitFor(() => {
      expect(overlay.querySelectorAll("[data-aura-slot]")).toHaveLength(0);
    });
  });

  it("does not invent aura rows the flag does not have", async () => {
    const frozen = {};
    Object.defineProperty(frozen, "auras", {
      get: () => ({}),
      set() { /* prepared flags ignore assignment */ }
    });
    const doc = {
      canUserModify: () => true,
      flags: { "illusive-dnd-5e": frozen },
      getFlag: vi.fn(() => undefined),
      setFlag: vi.fn(async () => {}),
      unsetFlag: vi.fn(async () => {})
    };

    await openMobileAuraMenu({ document: doc });
    const overlay = document.querySelector(".illusive-dnd-ms-aura-overlay");
    overlay.querySelector("[data-aura-add]").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => {
      expect(doc.setFlag).toHaveBeenCalled();
    });
    expect(overlay.querySelectorAll("[data-aura-slot]")).toHaveLength(0);
    expect(readTokenAuras(doc)).toEqual([]);
  });

  it("opens the phone menu with those current auras and updates them on add and off", async () => {
    const token = makePhoneToken([{ feet: 15, color: "#4090e0" }]);
    await openMobileAuraMenu(token);
    const overlay = document.querySelector(".illusive-dnd-ms-aura-overlay");
    expect(overlay.querySelectorAll("[data-aura-slot]")).toHaveLength(1);

    overlay.querySelector("[data-aura-add]").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => {
      expect(overlay.querySelectorAll("[data-aura-slot]")).toHaveLength(2);
      expect(readTokenAuras(token)).toHaveLength(2);
    });

    overlay.querySelector("[data-aura-feet='0']").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => {
      expect(overlay.querySelectorAll("[data-aura-slot]")).toHaveLength(1);
      expect(readTokenAuras(token)).toHaveLength(1);
    });

    overlay.querySelector("[data-aura-feet='0']").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => {
      expect(overlay.querySelectorAll("[data-aura-slot]")).toHaveLength(0);
      expect(readTokenAuras(token)).toEqual([]);
    });
  });

  it("puts a current-aura row back after Off when size or color is pressed", async () => {
    await initI18n();
    const token = makePhoneToken([
      { feet: 20, color: "#e05050" },
      { feet: 20, color: "#e0c040" },
      { feet: 10, color: "#e07020" }
    ]);
    await openMobileAuraMenu(token);
    const overlay = document.querySelector(".illusive-dnd-ms-aura-overlay");
    expect(overlay.querySelectorAll("[data-aura-slot]")).toHaveLength(3);
    expect(overlay.querySelector(".roll-dialog-title")?.textContent).toBe("Aura");
    expect(overlay.querySelector("[data-aura-feet='0']")?.textContent.trim()).toBe("Off");

    overlay.querySelector("[data-aura-feet='0']").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    overlay.querySelector("[data-aura-feet='0']").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    overlay.querySelector("[data-aura-feet='0']").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => {
      expect(overlay.querySelectorAll("[data-aura-slot]")).toHaveLength(0);
      expect(overlay.querySelector("[data-aura-add]")?.textContent.trim()).toBe("Add");
    });

    overlay.querySelector("[data-aura-feet='10']").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => {
      expect(overlay.querySelectorAll("[data-aura-slot]")).toHaveLength(1);
      expect(overlay.querySelector("[data-aura-slot]").textContent).toContain("10");
      expect(overlay.querySelector("[data-aura-feet='10']").classList.contains("is-current")).toBe(true);
    });

    overlay.querySelector("[data-aura-feet='0']").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => {
      expect(overlay.querySelectorAll("[data-aura-slot]")).toHaveLength(0);
    });

    overlay.querySelector("[data-aura-color='#40b060']").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => {
      expect(overlay.querySelectorAll("[data-aura-slot]")).toHaveLength(1);
      expect(readTokenAuras(token)[0]).toMatchObject({ feet: 10, color: "#40b060" });
    });
  });

  it("shows a flag that arrived after a settled write", async () => {
    let stored = [{ feet: 10, color: "#e07020" }];
    const bucket = {};
    Object.defineProperty(bucket, "auras", {
      get: () => stored,
      set() { /* prepared flags ignore assignment */ }
    });
    const doc = {
      canUserModify: () => true,
      flags: { "illusive-dnd-5e": bucket },
      getFlag: () => stored,
      update: vi.fn(async () => {})
    };
    await writeTokenAuras(doc, []);
    expect(readTokenAuras(doc)).toEqual([
      { index: 0, feet: 10, color: "#e07020", on: true }
    ]);

    stored = [{ feet: 20, color: "#e05050" }];
    expect(readTokenAuras(doc)).toEqual([
      { index: 0, feet: 20, color: "#e05050", on: true }
    ]);
    expect(buildAuraDropdownContext({ document: doc }).slots).toHaveLength(1);
  });

  it("does not keep slots from a stale _source after Off", async () => {
    const doc = makeFoundryAuraDoc({
      auras: { 0: { feet: 15, color: "#4090e0" } }
    });
    const token = { document: doc };
    await applyAuraFeet(token, 0);
    expect(readTokenAuras(doc)).toEqual([]);
    expect(buildAuraDropdownContext(token).slots).toEqual([]);
    expect(doc.flags["illusive-dnd-5e"].auras).toEqual([]);
    expect(doc._source.flags["illusive-dnd-5e"].auras).toEqual({
      0: { feet: 15, color: "#4090e0" }
    });
  });

  it("removes only the selected Foundry object-flag after Off", async () => {
    const doc = makeFoundryAuraDoc({
      auras: {
        0: { feet: 10, color: "#e07020" },
        1: { feet: 20, color: "#4090e0" }
      }
    });
    selectAuraSlot(0);
    await applyAuraFeet({ document: doc }, 0);
    expect(readTokenAuras(doc)).toEqual([
      { index: 0, feet: 20, color: "#4090e0", on: true }
    ]);
    expect(buildAuraDropdownContext({ document: doc }).slots).toHaveLength(1);
  });

});

describe("paintTokenAura", () => {
  afterEach(() => {
    delete globalThis.PIXI;
    delete globalThis.canvas;
  });

  it("skips a redraw when the rings and token size are unchanged", () => {
    class Graphics {
      constructor() {
        this.clears = 0;
        this.visible = true;
      }
      clear() { this.clears += 1; }
      circle() { return this; }
      fill() { return this; }
      stroke() { return this; }
    }
    globalThis.PIXI = { Graphics };
    globalThis.canvas = { grid: { size: 100 } };
    const token = {
      document: {
        width: 1,
        height: 1,
        flags: { "illusive-dnd-5e": { auras: [{ feet: 10, color: "#e07020" }] } },
        getFlag: () => undefined
      },
      w: 100,
      h: 100,
      visible: true,
      children: [],
      addChildAt(child) {
        child.name = "illusiveDndAura";
        this.children.push(child);
      },
      getChildIndex() { return 0; }
    };

    paintTokenAura(token);
    const drawn = token.children[0].clears;
    token.x = 200;
    paintTokenAura(token);
    expect(token.children[0].clears).toBe(drawn);

    token.w = 140;
    paintTokenAura(token);
    expect(token.children[0].clears).toBe(drawn + 1);
  });
});
