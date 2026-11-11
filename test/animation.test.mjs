import { describe, it, expect } from "vitest";
import { pickSource } from "../src/animation/sources.mjs";
import { englishKeys, resolveLabel } from "../src/animation/aa.mjs";
import { planFx } from "../src/animation/plan.mjs";
import { deferToAutomatedAnimations } from "../src/animation/bind.mjs";
import { templateEnd } from "../src/animation/play.mjs";
import { relevantAnimations, waitForCombatAnimations } from "../src/animation/wait.mjs";

const settings = {
  melee: [{ label: "Longsword" }],
  range: [{ label: "Fire Bolt" }],
  templatefx: [{ label: "Fireball" }],
  ontoken: [],
  aura: [],
  preset: []
};

const both = { aa: true, jb2a: true, tokenmagic: true };

describe("animation sources", () => {
  it("lets Automated Animations play when it has a match", () => {
    expect(pickSource("strikes", null, both, { aaMatch: true })).toBe("aa");
  });

  it("falls through to JB2A when Automated Animations has no match", () => {
    expect(pickSource("strikes", null, both, { aaMatch: false })).toBe("jb2a");
  });

  it("uses Token Magic when no art pack is active", () => {
    expect(pickSource("areas", null, { tokenmagic: true })).toBe("tokenmagic");
  });
});

describe("automated animations names", () => {
  it("finds the English entry for a translated item", () => {
    const keys = englishKeys({ name: "Boule de feu", identifier: "fireball" });
    const found = resolveLabel(settings, { keys, nativeNames: ["Boule de feu"], itemName: "Boule de feu", isTemplate: true });
    expect(found.label).toBe("Fireball");
  });

  it("leaves an item Automated Animations already recognises", () => {
    const found = resolveLabel(settings, { keys: ["fireball"], nativeNames: ["Fireball"], itemName: "Fireball" });
    expect(found).toBeNull();
  });
});

describe("animation plan", () => {
  it("stays quiet when Automated Animations will play the attack", () => {
    const plan = planFx({ kind: "attackHit", damageType: "slashing" }, { aaMatch: true, available: both });
    expect(plan.source).toBe("aa");
    expect(plan.play).toBeNull();
  });

  it("plays a fire impact when nothing else will", () => {
    const plan = planFx({ kind: "overTime", damageType: "fire" }, { available: { jb2a: true } });
    expect(plan.source).toBe("jb2a");
    expect(plan.play.file).toBe("jb2a.impact.fire.01.orange");
    expect(plan.play.at).toBe("targets");
  });

  it("plays a spell area even when Automated Animations lists that spell", () => {
    expect(deferToAutomatedAnimations("templatePlace", true)).toBe(false);
    expect(deferToAutomatedAnimations("attackHit", true)).toBe(true);
  });

  it("plays a spell area by its identifier", () => {
    const plan = planFx({ kind: "templatePlace", identifier: "fireball", shape: "circle" }, { available: { jb2a: true } });
    expect(plan.play.file).toBe("jb2a.fireball.explosion.orange");
  });
});

describe("cone and line length", () => {
  it("ends one grid square east per 5 feet, not a square the size of the spell", () => {
    expect(templateEnd({ x: 0, y: 0 }, 0, 30, { gridDistance: 5, gridSize: 100 })).toEqual({ x: 600, y: 0 });
  });
});

describe("animation wait", () => {
  it("waits only for fresh effects on the tokens involved", () => {
    const effects = [
      { id: "bolt", source: "Token.a", target: "Token.b", persist: false, started: 1000, ended: false },
      { id: "aura", source: "Token.a", target: null, persist: true, started: 1000, ended: false },
      { id: "old", source: "Token.a", target: "Token.b", persist: false, started: -5000, ended: false }
    ];
    expect(relevantAnimations(effects, ["Token.b"], 2000)).toEqual(["bolt"]);
  });

  it("holds until the swing and the rider impact have both ended", async () => {
    const effects = [
      { id: "swing", source: "Token.a", target: "Token.b", persist: false, started: Date.now(), ended: false },
      { id: "smite", source: "Token.a", target: "Token.b", persist: false, started: Date.now(), ended: false }
    ];
    let released = false;
    const pending = waitForCombatAnimations(["Token.b"], {
      pollMs: 5,
      list: () => effects
    }).then(() => { released = true; });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(released).toBe(false);
    effects[0].ended = true;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(released).toBe(false);
    effects[1].ended = true;
    await pending;
    expect(released).toBe(true);
  });
});
