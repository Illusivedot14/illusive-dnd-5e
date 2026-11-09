import { describe, it, expect, beforeEach } from "vitest";
import { installFoundry, makeToken } from "./helpers.mjs";
import { checkAbilityRange, buildTargetListLabel } from "../src/application/activity.mjs";
import { initI18n } from "../src/i18n/core.mjs";

function placeToken(id, x, y) {
  const token = makeToken({ id });
  token.document.x = x;
  token.document.y = y;
  token.document.width = 1;
  token.document.height = 1;
  token.x = x;
  token.y = y;
  return token;
}

describe("checkAbilityRange", () => {
  beforeEach(() => {
    installFoundry({
      scene: { id: "scene1", grid: { size: 100, distance: 5 } },
      targets: []
    });
    canvas.scene = { id: "scene1", grid: { size: 100, distance: 5 } };
  });

  it("is in range when there is no token or no targets", () => {
    const activity = { range: { value: 5 } };
    expect(checkAbilityRange(null, {}, activity).inRange).toBe(true);
    expect(checkAbilityRange(placeToken("t1", 0, 0), {}, activity).inRange).toBe(true);
  });

  it("is in range when the activity has no numeric range", () => {
    installFoundry({
      scene: { id: "scene1", grid: { size: 100, distance: 5 } },
      targets: [placeToken("t2", 1000, 0)]
    });
    canvas.scene = { id: "scene1", grid: { size: 100, distance: 5 } };
    expect(checkAbilityRange(placeToken("t1", 0, 0), {}, { id: "act1" }).inRange).toBe(true);
  });

  it("reports out of range when the target is beyond activity range", () => {
    const origin = placeToken("t1", 0, 0);
    const target = placeToken("t2", 1000, 0); // 50 ft apart on 5ft/100px grid
    installFoundry({
      scene: { id: "scene1", grid: { size: 100, distance: 5 } },
      targets: [target]
    });
    canvas.scene = { id: "scene1", grid: { size: 100, distance: 5 } };
    const result = checkAbilityRange(origin, {}, { range: { value: 5 } });
    expect(result.inRange).toBe(false);
    expect(result.reason).toBe("outOfRange");
  });

  it("reports in range when the target is within activity range", () => {
    const origin = placeToken("t1", 0, 0);
    const target = placeToken("t2", 100, 0); // 5 ft apart
    installFoundry({
      scene: { id: "scene1", grid: { size: 100, distance: 5 } },
      targets: [target]
    });
    canvas.scene = { id: "scene1", grid: { size: 100, distance: 5 } };
    expect(checkAbilityRange(origin, {}, { range: { value: 5 } }).inRange).toBe(true);
  });

  it("counts large creature footprint so melee reach reaches its edge", () => {
    const origin = placeToken("hero", 0, 0);
    // Large 2×2 starting at x=100: occupies cols 1–2. Center-to-center is 15 ft;
    // closest-square distance to medium at col 0 is 5 ft.
    const large = placeToken("ogre", 100, 0);
    large.document.width = 2;
    large.document.height = 2;
    installFoundry({
      scene: { id: "scene1", grid: { size: 100, distance: 5 } },
      targets: [large]
    });
    canvas.scene = { id: "scene1", grid: { size: 100, distance: 5 } };
    expect(checkAbilityRange(origin, {}, { range: { value: 5 } }).inRange).toBe(true);
  });
});

describe("buildTargetListLabel", () => {
  beforeEach(async () => {
    installFoundry();
    await initI18n();
  });

  it("is empty with no targets", () => {
    expect(buildTargetListLabel()).toBe("");
  });

  it("lists target names", () => {
    installFoundry({ targets: [{ name: "Goblin" }, { name: "Orc" }] });
    expect(buildTargetListLabel()).toBe("Targets: Goblin, Orc");
  });
});
