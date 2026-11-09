import { describe, it, expect, beforeEach } from "vitest";
import { installFoundry } from "./helpers.mjs";
import {
  fullKey,
  shortKey,
  looksLikeModuleKey,
  storeString,
  illusiveDndLocalize,
  illusiveDndResolve,
  illusiveDndCore,
  initI18n
} from "../src/i18n/core.mjs";

const PREFIX = "illusive-dnd-5e.";

describe("i18n/core key helpers", () => {
  beforeEach(() => installFoundry());

  it("fullKey adds the module prefix once", () => {
    expect(fullKey("turn.end")).toBe(`${PREFIX}turn.end`);
    expect(fullKey(`${PREFIX}turn.end`)).toBe(`${PREFIX}turn.end`);
  });

  it("shortKey strips the module prefix", () => {
    expect(shortKey(`${PREFIX}turn.end`)).toBe("turn.end");
    expect(shortKey("turn.end")).toBe("turn.end");
  });

  it("looksLikeModuleKey detects raw module keys and empties", () => {
    expect(looksLikeModuleKey(`${PREFIX}turn.end`)).toBe(true);
    expect(looksLikeModuleKey("End Turn")).toBe(false);
    expect(looksLikeModuleKey("")).toBe(true);
    expect(looksLikeModuleKey(null)).toBe(true);
  });
});

describe("illusiveDndLocalize", () => {
  beforeEach(() => installFoundry());

  it("humanizes an unknown key as a readable fallback", () => {
    expect(illusiveDndLocalize("reasons.cannotUse")).toBe("Cannot Use");
  });

  it("uses the last meaningful segment, dropping name/hint suffixes", () => {
    expect(illusiveDndLocalize("settings.showResourceBar.name")).toBe("Show Resource Bar");
  });

  it("substitutes {data} tokens into the resolved string", () => {
    storeString(`${PREFIX}warnings.economySpent`, "{type} already spent.");
    expect(illusiveDndLocalize("warnings.economySpent", { type: "action" })).toBe("action already spent.");
  });

  it("returns a stored string verbatim when present", () => {
    storeString(`${PREFIX}turn.end`, "End Turn");
    expect(illusiveDndLocalize("turn.end")).toBe("End Turn");
  });

  it("returns empty string for a falsy key", () => {
    expect(illusiveDndLocalize("")).toBe("");
  });
});

describe("illusiveDndResolve", () => {
  beforeEach(() => installFoundry());

  it("passes non-key strings through and applies data substitution", () => {
    expect(illusiveDndResolve("Hello {name}", { name: "Bob" })).toBe("Hello Bob");
  });

  it("localizes strings that look like module keys", () => {
    storeString(`${PREFIX}turn.end`, "End Turn");
    expect(illusiveDndResolve("illusive-dnd-5e.turn.end")).toBe("End Turn");
  });

  it("returns empty string for nullish input", () => {
    expect(illusiveDndResolve(null)).toBe("");
    expect(illusiveDndResolve(undefined)).toBe("");
  });
});

describe("illusiveDndCore", () => {
  it("formats/localizes a core key via game.i18n", () => {
    installFoundry({
      i18n: {
        lang: "en",
        localize: (k) => (k === "DND5E.Walk" ? "Walk" : k),
        format: (k, d) => `${k}:${d.n}`
      }
    });
    expect(illusiveDndCore("DND5E.Walk")).toBe("Walk");
    expect(illusiveDndCore("KEY", { n: 3 })).toBe("KEY:3");
  });

  it("returns the key itself when game.i18n is unavailable", () => {
    installFoundry({ i18n: null });
    expect(illusiveDndCore("DND5E.Walk")).toBe("DND5E.Walk");
  });
});

describe("initI18n", () => {
  it("loads built-in HUD fallbacks into the string table", async () => {
    installFoundry();
    await initI18n();
    expect(illusiveDndLocalize("turn.end")).toBe("End Turn");
    expect(illusiveDndLocalize("sections.reaction")).toBe("Reaction");
  });
});
