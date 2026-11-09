import { describe, it, expect } from "vitest";
import { installFoundry, makeActor } from "./helpers.mjs";
import { statPercent, getHpBarData, getTokenCombatStats, buildPassiveScores, getDamageWashCssPct, buildVisionSummary, buildDefenseTraits, buildLanguageSummary } from "../src/foundry/actor-stats.mjs";

describe("getDamageWashCssPct", () => {
  it("returns remaining HP percent for the party-style wash", () => {
    expect(getDamageWashCssPct(100)).toBe(100);
    expect(getDamageWashCssPct(45)).toBe(45);
    expect(getDamageWashCssPct(0)).toBe(0);
  });

  it("clamps out-of-range values", () => {
    expect(getDamageWashCssPct(150)).toBe(100);
    expect(getDamageWashCssPct(-10)).toBe(0);
  });
});

describe("statPercent", () => {
  it("returns 0 when max is missing or non-positive", () => {
    expect(statPercent(null)).toBe(0);
    expect(statPercent({ value: 5, max: 0 })).toBe(0);
    expect(statPercent({ value: 5, max: -1 })).toBe(0);
  });

  it("computes a clamped percentage", () => {
    expect(statPercent({ value: 5, max: 10 })).toBe(50);
    expect(statPercent({ value: 20, max: 10 })).toBe(100);
    expect(statPercent({ value: -5, max: 10 })).toBe(0);
  });
});

describe("getHpBarData", () => {
  it("returns zeros for an actor with no hp", () => {
    const data = getHpBarData(null);
    expect(data).toMatchObject({ value: 0, max: 0, temp: 0, totalPercent: 0, percent: 0 });
  });

  it("classifies a healthy actor", () => {
    const data = getHpBarData(makeActor({ hp: { value: 10, max: 10 } }));
    expect(data.tier).toBe("healthy");
    expect(data.totalPercent).toBe(100);
  });

  it("classifies warn (<=50%) and critical (<=25%)", () => {
    expect(getHpBarData(makeActor({ hp: { value: 5, max: 10 } })).tier).toBe("warn");
    expect(getHpBarData(makeActor({ hp: { value: 2, max: 10 } })).tier).toBe("critical");
  });

  it("classifies down when at 0 hp with a positive max", () => {
    expect(getHpBarData(makeActor({ hp: { value: 0, max: 10 } })).tier).toBe("down");
  });

  it("accounts for temp hp in the total and temp percentages", () => {
    const data = getHpBarData(makeActor({ hp: { value: 5, max: 10, temp: 3 } }));
    expect(data.basePercent).toBe(50);
    expect(data.tempPercent).toBe(30);
    expect(data.totalPercent).toBe(80);
  });

  it("caps temp percentage so base + temp never exceeds 100", () => {
    const data = getHpBarData(makeActor({ hp: { value: 9, max: 10, temp: 5 } }));
    expect(data.basePercent).toBe(90);
    expect(data.tempPercent).toBe(10);
    expect(data.totalPercent).toBe(100);
  });
});

describe("getTokenCombatStats", () => {
  it("returns nulls for a missing actor", () => {
    expect(getTokenCombatStats(null)).toEqual({ ac: null, speed: null });
  });

  it("extracts AC and walk speed", () => {
    const actor = makeActor({ ac: 17, movement: { walk: 25 } });
    expect(getTokenCombatStats(actor)).toEqual({ ac: 17, speed: 25 });
  });
});

describe("buildPassiveScores", () => {
  it("returns passive perception, insight, and investigation values", () => {
    installFoundry();
    const actor = makeActor({
      system: {
        skills: {
          prc: { passive: 14 },
          ins: { passive: 12 },
          inv: { passive: 16 }
        }
      }
    });
    const scores = buildPassiveScores(actor);
    expect(scores.map((entry) => entry.value)).toEqual([14, 12, 16]);
    expect(scores.map((entry) => entry.short)).toEqual(["PP", "INS", "INV"]);
  });

  it("uses localized skill abbreviations when available", () => {
    installFoundry();
    globalThis.CONFIG = {
      DND5E: {
        skills: {
          prc: { label: "DND5E.SkillPrc" },
          ins: { label: "DND5E.SkillIns" },
          inv: { label: "DND5E.SkillInv" }
        }
      }
    };
    globalThis.game.i18n.localize = (key) => ({
      "DND5E.SkillPrc": "Perception",
      "DND5E.SkillIns": "Insight",
      "DND5E.SkillInv": "Investigation"
    }[key] ?? key);

    const actor = makeActor({
      system: {
        skills: {
          prc: { passive: 14 },
          ins: { passive: 12 },
          inv: { passive: 16 }
        }
      }
    });
    const scores = buildPassiveScores(actor);
    expect(scores.map((entry) => entry.short)).toEqual(["Per", "Ins", "Inv"]);
    expect(scores.map((entry) => entry.label)).toEqual(["Perception", "Insight", "Investigation"]);
  });
});

describe("buildVisionSummary", () => {
  it("reads darkvision from senses.ranges and capitalizes the label", () => {
    installFoundry();
    globalThis.CONFIG = {
      DND5E: {
        senses: { darkvision: "DND5E.SenseDarkvision" }
      }
    };
    globalThis.game.i18n.localize = (key) => (
      key === "DND5E.SenseDarkvision" ? "Darkvision" : key
    );

    const summary = buildVisionSummary({
      actor: {
        system: {
          attributes: {
            senses: { ranges: { darkvision: 60 }, units: "ft" }
          }
        }
      }
    });
    expect(summary).toBe("Darkvision 60 ft");
  });

  it("falls back to flat senses.darkvision", () => {
    installFoundry();
    globalThis.CONFIG = { DND5E: { senses: { darkvision: "DND5E.SenseDarkvision" } } };
    globalThis.game.i18n.localize = (key) => key;

    const summary = buildVisionSummary({
      actor: {
        system: {
          attributes: {
            senses: { darkvision: 60, units: "ft" }
          }
        }
      }
    });
    expect(summary).toBe("Darkvision 60 ft");
  });

  it("lists multiple senses on separate lines", () => {
    installFoundry();
    globalThis.CONFIG = {
      DND5E: {
        senses: {
          darkvision: "DND5E.SenseDarkvision",
          tremorsense: "DND5E.SenseTremorsense"
        }
      }
    };
    globalThis.game.i18n.localize = (key) => ({
      "DND5E.SenseDarkvision": "Darkvision",
      "DND5E.SenseTremorsense": "Tremorsense"
    }[key] ?? key);

    const summary = buildVisionSummary({
      actor: {
        system: {
          attributes: {
            senses: {
              ranges: { darkvision: 120, tremorsense: 60 },
              units: "ft"
            }
          }
        }
      }
    });
    expect(summary).toBe("Darkvision 120 ft\nTremorsense 60 ft");
  });
});

describe("buildDefenseTraits", () => {
  it("lists damage immunities, condition immunities, and resistances", () => {
    installFoundry();
    globalThis.CONFIG = {
      DND5E: {
        damageTypes: {
          fire: { label: "DND5E.DAMAGE.Type.Fire" },
          cold: { label: "DND5E.DAMAGE.Type.Cold" }
        },
        conditionTypes: {
          poisoned: { name: "DND5E.ConPoisoned" }
        }
      }
    };
    globalThis.game.i18n.localize = (key) => ({
      "DND5E.DAMAGE.Type.Fire": "Fire",
      "DND5E.DAMAGE.Type.Cold": "Cold",
      "DND5E.ConPoisoned": "Poisoned"
    }[key] ?? key);

    const traits = buildDefenseTraits({
      system: {
        traits: {
          di: { value: new Set(["fire"]), custom: "" },
          ci: { value: ["poisoned"] },
          dr: { value: ["cold"], custom: "thunder from laughs" }
        }
      }
    });
    expect(traits.immunities).toEqual(["Fire", "Poisoned"]);
    expect(traits.resistances).toEqual(["Cold", "thunder from laughs"]);
  });
});

describe("buildLanguageSummary", () => {
  it("uses prepared language labels when present", () => {
    installFoundry();
    expect(buildLanguageSummary({
      system: {
        traits: {
          languages: {
            labels: { languages: ["Common", "Elvish"], ranged: ["Telepathy 60 ft"] }
          }
        }
      }
    })).toBe("Common, Elvish, Telepathy 60 ft");
  });

  it("falls back to language keys and custom text", () => {
    installFoundry();
    globalThis.CONFIG = {
      DND5E: {
        languages: {
          standard: { children: { common: { label: "DND5E.Language.Common" } } }
        }
      }
    };
    globalThis.game.i18n.localize = (key) => (
      key === "DND5E.Language.Common" ? "Common" : key
    );

    expect(buildLanguageSummary({
      system: {
        traits: {
          languages: { value: new Set(["common"]), custom: "Thieves' Cant" }
        }
      }
    })).toBe("Common, Thieves' Cant");
  });
});
