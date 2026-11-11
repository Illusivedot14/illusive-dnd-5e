import { describe, it, expect, beforeEach, vi } from "vitest";
import { installFoundry, makeActor, makeToken } from "./helpers.mjs";
import { collectWindowCandidates } from "../src/application/reactions/window.mjs";
import {
  leaveReachContext,
  openLeaveReachWindow,
  stashPendingMove,
  getPendingMove
} from "../src/application/opportunity-attack.mjs";
import { listOverTimeEffects } from "../src/domain/combat/overtime.mjs";
import { listAvailableHitRiders } from "../src/domain/combat/hit-riders.mjs";

describe("leave reach window", () => {
  beforeEach(() => installFoundry({ combat: { started: true, combatants: [] } }));

  it("offers the opportunity attack and a declared reaction in one window", async () => {
    const wait = vi.fn(async () => "pass");
    globalThis.foundry.applications.api.DialogV2.wait = wait;

    const sword = {
      id: "sword",
      name: "Scimitar",
      type: "weapon",
      system: {
        type: { value: "martialM" },
        activities: [{ id: "atk", type: "attack", attack: { type: { value: "melee" } }, range: { reach: 5 } }]
      }
    };
    const sentinel = {
      id: "sentinel",
      name: "Sentinel",
      type: "feat",
      flags: {
        "illusive-dnd-5e": {
          triggers: [{
            id: "sentinel-stop",
            label: "Sentinel",
            on: "leavesReach",
            mode: "hard",
            cost: "reaction",
            do: []
          }]
        }
      }
    };
    const goblin = makeActor({ id: "gob", name: "Goblin", items: [sword, sentinel] });
    goblin.uuid = "Actor.gob";
    const heroActor = makeActor({ id: "hero", name: "Vesper" });
    const hero = makeToken({ id: "hero", name: "Vesper", actor: heroActor });
    const gob = makeToken({ id: "gob", name: "Goblin", actor: goblin });
    Object.assign(hero.document, {
      id: "hero", uuid: "Scene.1.Token.hero", x: 100, y: 0, width: 1, height: 1, disposition: 1, actor: heroActor
    });
    Object.assign(gob.document, {
      id: "gob", uuid: "Scene.1.Token.gob", x: 0, y: 0, width: 1, height: 1, disposition: -1, actor: goblin
    });
    hero.actor = heroActor;
    gob.actor = goblin;
    globalThis.canvas.tokens.placeables = [hero, gob];
    globalThis.canvas.tokens.get = (id) => ({ hero, gob }[id] ?? null);
    globalThis.canvas.scene = { id: "scene1", grid: { size: 100, distance: 5 } };

    const ctx = leaveReachContext(hero.document, { x: 400, y: 0 }, {});
    const groups = collectWindowCandidates("on-leave-reach", ctx);
    expect(groups.map((group) => group.actor.name)).toEqual(["Goblin"]);
    expect(groups[0].specs.map((spec) => spec.id).sort()).toEqual(["opportunity", "sentinel-stop"]);

    hero.document.update = vi.fn(async () => {});
    stashPendingMove(hero.document, { x: 400, y: 0 }, {});
    await openLeaveReachWindow(hero.document, ctx);

    expect(wait).toHaveBeenCalledOnce();
    const content = wait.mock.calls[0][0].content;
    expect(content).toContain("Scimitar");
    expect(content).toContain("Sentinel");
    expect(getPendingMove("hero")).toBe(null);
  });
});

describe("declared riders and overtime", () => {
  it("a flagged rider and a flagged overtime tick are rules", () => {
    const rider = listAvailableHitRiders({
      uuid: "Actor.rider",
      items: [{
        id: "brand",
        name: "Brand",
        flags: {
          "illusive-dnd-5e": {
            triggers: [{
              id: "brand",
              label: "Brand",
              on: "hitDamage",
              rider: { auto: true, formula: "1d4" },
              do: [{ step: "bonusDamage", to: "target", value: "1d4" }]
            }]
          }
        }
      }]
    });
    expect(rider.map((entry) => entry.id)).toEqual(["brand"]);

    const overtime = listOverTimeEffects({
      uuid: "Actor.moon",
      items: [],
      effects: [{
        id: "moon",
        name: "Moonbeam",
        disabled: false,
        flags: {
          "illusive-dnd-5e": {
            triggers: [{
              id: "moonbeam-tick",
              label: "Moonbeam",
              on: "turnStart",
              overTime: { turn: "start", damageFormula: "2d10", damageType: "radiant", saveAbility: "con" },
              do: [{ step: "damage", to: "self", value: "2d10", damageType: "radiant" }]
            }]
          }
        }
      }]
    }, "start");
    expect(overtime.map((row) => row.spec.damageFormula)).toEqual(["2d10"]);
  });
});
