import { describe, it, expect, beforeEach, vi } from "vitest";
import { installFoundry, makeToken } from "./helpers.mjs";
import { damagesFromRolls, applyDamageRolls } from "../src/application/damage-apply.mjs";
import { activityRangeFeet, checkAbilityRange } from "../src/application/activity.mjs";

describe("damagesFromRolls", () => {
  beforeEach(() => {
    installFoundry();
    CONFIG.DND5E = {
      damageTypes: { slashing: { label: "Slashing" } },
      healingTypes: { healing: { label: "Healing" } }
    };
  });

  it("maps damage and healing totals", () => {
    const damages = damagesFromRolls([
      { total: 8, options: { type: "slashing" } },
      { total: 5, options: { type: "healing" } }
    ]);
    expect(damages[0]).toMatchObject({ value: 8, type: "slashing" });
    expect(damages[1]).toMatchObject({ value: -5, type: "healing" });
  });
});

describe("applyDamageRolls", () => {
  beforeEach(() => {
    installFoundry();
    CONFIG.DND5E = { damageTypes: {}, healingTypes: {} };
  });

  it("applies to targeted actors", async () => {
    const applyDamage = vi.fn(async () => ({}));
    const target = makeToken({ id: "t2", name: "Goblin" });
    target.actor = { uuid: "Actor.gob", applyDamage };
    installFoundry({ targets: [target] });
    CONFIG.DND5E = { damageTypes: {}, healingTypes: {} };

    const result = await applyDamageRolls({
      rolls: [{ total: 7, options: { type: "slashing" } }],
      clearTargets: false
    });
    expect(result.applied).toBe(1);
    expect(applyDamage).toHaveBeenCalledOnce();
    expect(applyDamage.mock.calls[0][0][0].value).toBe(7);
  });
});

describe("melee reach range", () => {
  beforeEach(() => {
    installFoundry({
      scene: { id: "scene1", grid: { size: 100, distance: 5 } },
      targets: []
    });
    canvas.scene = { id: "scene1", grid: { size: 100, distance: 5 } };
  });

  it("defaults weapon melee reach to 5 when activity range is empty", () => {
    const item = { type: "weapon", system: { range: { units: "ft" }, actionType: "mwak" } };
    const activity = { type: "attack", attack: { type: { value: "melee" } }, range: {} };
    expect(activityRangeFeet(activity, item)).toBe(5);
  });

  it("uses item.system.range.reach for reach weapons", () => {
    const item = { type: "weapon", system: { range: { reach: 10, units: "ft" } } };
    const activity = { type: "attack", range: { value: null } };
    expect(activityRangeFeet(activity, item)).toBe(10);
  });

  it("blocks melee attacks beyond reach on the square grid", () => {
    const origin = makeToken({ id: "t1" });
    origin.document.x = 0;
    origin.document.y = 0;
    origin.document.width = 1;
    origin.document.height = 1;
    const far = makeToken({ id: "t2" });
    far.document.x = 300; // 15 ft
    far.document.y = 0;
    far.document.width = 1;
    far.document.height = 1;
    installFoundry({
      scene: { id: "scene1", grid: { size: 100, distance: 5 } },
      targets: [far]
    });
    canvas.scene = { id: "scene1", grid: { size: 100, distance: 5 } };

    const item = { type: "weapon", system: { range: { units: "ft" }, actionType: "mwak" } };
    const activity = { type: "attack", attack: { type: { value: "melee" } }, range: {} };
    expect(checkAbilityRange(origin, item, activity).inRange).toBe(false);
  });

  it("allows adjacent diagonal melee (Chebyshev 1 square)", () => {
    const origin = makeToken({ id: "t1" });
    origin.document.x = 0;
    origin.document.y = 0;
    origin.document.width = 1;
    origin.document.height = 1;
    const diag = makeToken({ id: "t2" });
    diag.document.x = 100;
    diag.document.y = 100;
    diag.document.width = 1;
    diag.document.height = 1;
    installFoundry({
      scene: { id: "scene1", grid: { size: 100, distance: 5 } },
      targets: [diag]
    });
    canvas.scene = { id: "scene1", grid: { size: 100, distance: 5 } };

    const item = { type: "weapon", system: { range: { units: "ft" }, actionType: "mwak" } };
    const activity = { type: "attack", attack: { type: { value: "melee" } }, range: {} };
    expect(checkAbilityRange(origin, item, activity).inRange).toBe(true);
  });
});
