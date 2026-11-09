import { describe, it, expect, beforeEach, vi } from "vitest";
import { installFoundry, makeActor, makeToken, makeCombat, makeCombatant } from "./helpers.mjs";
import {
  getCombatantForToken,
  findCombatantForToken,
  isTokenInCombat,
  buildEconomyPips,
  buildLegendaryPips,
  getMovementModes,
  buildMovementData,
  cycleMovementMode,
  undoLastTokenMovement
} from "../src/application/action-economy.mjs";
import {
  combatMoveExceedsBudget,
  estimateProposedMoveCostFeet
} from "../src/application/token-movement.mjs";

describe("getCombatantForToken", () => {
  it("returns null when there is no started combat", () => {
    installFoundry();
    expect(getCombatantForToken(makeToken())).toBeNull();
  });

  it("finds the combatant matching the token id", () => {
    const cmb = makeCombatant({ id: "c1", tokenId: "tokA" });
    installFoundry({ combat: makeCombat({ started: true, combatants: [cmb] }) });
    expect(getCombatantForToken(makeToken({ id: "tokA" }))).toBe(cmb);
  });
});

describe("findCombatantForToken", () => {
  it("finds a combatant before combat has started", () => {
    const cmb = makeCombatant({ id: "c1", tokenId: "tokA" });
    installFoundry({ combat: makeCombat({ started: false, combatants: [cmb] }) });
    expect(findCombatantForToken(makeToken({ id: "tokA" }))).toBe(cmb);
    expect(getCombatantForToken(makeToken({ id: "tokA" }))).toBeNull();
  });
});

describe("isTokenInCombat", () => {
  it("is false out of combat and true for an active combatant", () => {
    installFoundry();
    expect(isTokenInCombat(makeToken({ id: "tokA" }))).toBe(false);

    const cmb = makeCombatant({ id: "c1", tokenId: "tokA" });
    installFoundry({ combat: makeCombat({ started: true, combatants: [cmb] }) });
    expect(isTokenInCombat(makeToken({ id: "tokA" }))).toBe(true);
    expect(isTokenInCombat(makeToken({ id: "other" }))).toBe(false);
  });
});

describe("buildEconomyPips", () => {
  it("returns [] when the token is not in the active combat", () => {
    installFoundry();
    expect(buildEconomyPips(makeToken())).toEqual([]);
  });

  it("returns action/bonus/reaction pips with economy availability", () => {
    const actor = makeActor({ id: "actA" });
    const token = makeToken({ id: "tokA", actor });
    const cmb = makeCombatant({
      id: "c1",
      tokenId: "tokA",
      actor,
      flags: { "illusive-dnd-5e": { turn: { action: 0, bonus: 1, reaction: 1, attacks: { granted: 0, used: 0 } } } }
    });
    installFoundry({ combat: makeCombat({ started: true, combatants: [cmb] }) });

    const pips = buildEconomyPips(token);
    expect(pips.map((p) => p.id)).toEqual(["action", "bonus", "reaction"]);
    expect(pips.find((p) => p.id === "action").available).toBe(false);
    expect(pips.find((p) => p.id === "bonus").available).toBe(true);
  });
});

describe("buildLegendaryPips", () => {
  beforeEach(() => installFoundry());

  it("returns null without legendary actions", () => {
    expect(buildLegendaryPips(makeActor())).toBeNull();
  });

  it("reports remaining/max, computing remaining from spent when needed", () => {
    const actor = makeActor({ system: { resources: { legact: { max: 3, spent: 1 } } } });
    const pips = buildLegendaryPips(actor);
    expect(pips).toMatchObject({ remaining: 2, max: 3 });
  });

  it("prefers an explicit value when present", () => {
    const actor = makeActor({ system: { resources: { legact: { max: 3, value: 1 } } } });
    expect(buildLegendaryPips(actor).remaining).toBe(1);
  });
});

describe("getMovementModes", () => {
  beforeEach(() => {
    installFoundry();
    globalThis.CONFIG.DND5E.movementTypes = {
      walk: { label: "DND5E.Walk" },
      fly: { label: "DND5E.Fly" },
      burrow: { label: "DND5E.Burrow", hidden: true }
    };
  });

  it("returns [] for an actor with no movement", () => {
    expect(getMovementModes(makeActor({ movement: null }))).toEqual([]);
  });

  it("includes walk always and any positive-speed non-hidden modes", () => {
    const actor = makeActor({ movement: { walk: 0, fly: 60, burrow: 10 } });
    const modes = getMovementModes(actor);
    expect(modes.map((m) => m.id)).toEqual(["walk", "fly"]);
    expect(modes.find((m) => m.id === "fly").speed).toBe(60);
    expect(modes.find((m) => m.id === "walk").label).toBe("Walk");
  });

  it("labels walk as Walk even when dnd5e config says Speed", () => {
    globalThis.CONFIG.DND5E.movementTypes = {
      walk: { label: "DND5E.MOVEMENT.Type.Speed" },
      fly: { label: "DND5E.MOVEMENT.Type.Fly" }
    };
    globalThis.game.i18n.localize = (key) => (
      key === "DND5E.MOVEMENT.Type.Walk" ? "Walk" : key
    );
    const actor = makeActor({ movement: { walk: 20, fly: 80 } });
    const modes = getMovementModes(actor);
    expect(modes[0]).toMatchObject({ id: "walk", label: "Walk", speed: 20 });
  });

  it("records base walk speed when effective speed is reduced", () => {
    const actor = makeActor({ movement: { walk: 20, fly: 80 } });
    actor._source = { system: { attributes: { movement: { walk: 30 } } } };
    const walk = getMovementModes(actor).find((m) => m.id === "walk");
    expect(walk).toMatchObject({ speed: 20, baseSpeed: 30 });
  });
});

describe("cycleMovementMode", () => {
  beforeEach(() => {
    installFoundry();
    globalThis.CONFIG.Token = {
      movement: {
        defaultAction: "walk",
        actions: {
          walk: { label: "Walk", icon: "fa-solid fa-person-walking", order: 0 },
          fly: { label: "Fly", icon: "fa-solid fa-person-fairy", order: 1 },
          swim: { label: "Swim", icon: "fa-solid fa-person-swimming", order: 2 },
          displace: { label: "Displace", icon: "fa-solid fa-transporter-1", order: 8, canSelect: () => false }
        }
      }
    };
  });

  it("switches to the next Foundry movement action", async () => {
    const token = makeToken({
      actor: makeActor({ movement: { walk: 30 } }),
      movementAction: "walk"
    });
    await expect(cycleMovementMode(token)).resolves.toBe(true);
    expect(token.document.update).toHaveBeenCalledWith({ movementAction: "fly" });
  });

  it("wraps back to walk after the last selectable action", async () => {
    const token = makeToken({
      actor: makeActor({ movement: { walk: 30 } }),
      movementAction: "swim"
    });
    await expect(cycleMovementMode(token)).resolves.toBe(true);
    expect(token.document.update).toHaveBeenCalledWith({ movementAction: "walk" });
  });

  it("can set fly even when the sheet has no fly speed", async () => {
    const token = makeToken({
      actor: makeActor({ movement: { walk: 30 } }),
      movementAction: "walk"
    });
    await expect(cycleMovementMode(token)).resolves.toBe(true);
    expect(token.document.update).toHaveBeenCalledWith({ movementAction: "fly" });
  });
});

describe("buildMovementData", () => {
  it("returns null when out of combat", () => {
    installFoundry();
    expect(buildMovementData(makeToken({ actor: makeActor() }))).toBeNull();
  });

  it("computes remaining movement with no history used", () => {
    installFoundry({ combat: makeCombat({ started: true }) });
    const token = makeToken({ actor: makeActor({ movement: { walk: 30 } }) });
    const data = buildMovementData(token);
    expect(data).toMatchObject({ usedFeet: 0, maxFeet: 30, remainingFeet: 30, percent: 100, isDashing: false });
  });

  it("doubles max movement when the actor is dashing", () => {
    installFoundry({ combat: makeCombat({ started: true }) });
    const actor = makeActor({ movement: { walk: 30 }, flags: { "illusive-dnd-5e": { dashing: true } } });
    const data = buildMovementData(makeToken({ actor }));
    expect(data.isDashing).toBe(true);
    expect(data.maxFeet).toBe(60);
  });

  it("uses recorded step costs and does not remeasure the whole path", () => {
    installFoundry({ combat: makeCombat({ started: true }) });
    const measure = vi.fn(() => ({ cost: 999 }));
    const token = makeToken({
      actor: makeActor({ movement: { walk: 30 } }),
      movementHistory: [
        { x: 0, y: 0, cost: 0 },
        { x: 1, y: 0, cost: 5 },
        { x: 2, y: 0, cost: 5 }
      ],
      measureMovementPath: measure
    });
    const data = buildMovementData(token);
    expect(data.usedFeet).toBe(10);
    expect(data.remainingFeet).toBe(20);
    expect(measure).not.toHaveBeenCalled();
  });

  it("measures used feet from the movement path when available", () => {
    installFoundry({ combat: makeCombat({ started: true }) });
    const token = makeToken({
      actor: makeActor({ movement: { walk: 30, max: 70, fly: 70 } }),
      movementHistory: [{ x: 0 }, { x: 1 }],
      measureMovementPath: () => ({ cost: 10 })
    });
    const data = buildMovementData(token);
    expect(data.usedFeet).toBe(10);
    expect(data.remainingFeet).toBe(60);
    expect(data.maxFeet).toBe(70);
  });

  it("uses the gestalt movement pool max when present", () => {
    installFoundry({ combat: makeCombat({ started: true }) });
    const token = makeToken({ actor: makeActor({ movement: { walk: 40, fly: 70, max: 70 } }) });
    const data = buildMovementData(token);
    expect(data).toMatchObject({ maxFeet: 70, remainingFeet: 70, isGestalt: true });
  });

  it("applies multi-mode remaining: walk 30 then fly shares the leftover pool", () => {
    installFoundry({ combat: makeCombat({ started: true }) });
    globalThis.CONFIG.DND5E.movementTypes = {
      walk: { label: "DND5E.Walk" },
      fly: { label: "DND5E.Fly" }
    };
    const token = makeToken({
      actor: makeActor({ movement: { walk: 30, fly: 90, max: 90 } }),
      movementAction: "fly",
      movementHistory: [
        { x: 0, y: 0, action: "walk" },
        { x: 1, y: 0, action: "walk", cost: 30 },
        { x: 2, y: 0, action: "fly", cost: 40 }
      ],
      measureMovementPath: () => ({ cost: 70 })
    });
    const data = buildMovementData(token);
    expect(data).toMatchObject({ usedFeet: 70, maxFeet: 90, remainingFeet: 20 });
    const walk = data.modes.find((m) => m.id === "walk");
    const fly = data.modes.find((m) => m.id === "fly");
    expect(walk).toMatchObject({ remaining: 0, max: 30, isEmpty: true });
    expect(fly).toMatchObject({ remaining: 20, max: 90, isActive: true });
  });

  it("caps each mode by its own speed against the shared pool", () => {
    installFoundry({ combat: makeCombat({ started: true }) });
    globalThis.CONFIG.DND5E.movementTypes = {
      walk: { label: "DND5E.Walk" },
      fly: { label: "DND5E.Fly" }
    };
    const token = makeToken({
      actor: makeActor({ movement: { walk: 30, fly: 90 } }),
      movementAction: "walk",
      movementHistory: [
        { x: 0, action: "fly" },
        { x: 1, action: "fly", cost: 40 },
        { x: 2, action: "walk", cost: 30 }
      ],
      measureMovementPath: () => ({ cost: 70 })
    });
    const data = buildMovementData(token);
    expect(data.modes.find((m) => m.id === "fly")).toMatchObject({ remaining: 20, used: 40 });
    expect(data.modes.find((m) => m.id === "walk")).toMatchObject({ remaining: 0, used: 30 });
  });
});

describe("combat movement budget gate", () => {
  it("allows moves out of combat", () => {
    installFoundry();
    const token = makeToken({ actor: makeActor({ movement: { walk: 30 } }) });
    expect(combatMoveExceedsBudget(token.document, { x: 500, y: 0 })).toBe(false);
  });

  it("blocks a step when no movement remains", () => {
    installFoundry({ combat: makeCombat({ started: true }) });
    const actor = makeActor({ movement: { walk: 30 } });
    const token = makeToken({
      actor,
      movementHistory: [
        { x: 0, y: 0, cost: 0 },
        { x: 100, y: 0, cost: 30 }
      ],
      measureMovementPath: () => ({ cost: 5 })
    });
    token.document.x = 100;
    token.document.y = 0;
    token.document.actor = actor;
    token.document.object = token;
    expect(combatMoveExceedsBudget(token.document, { x: 200, y: 0 })).toBe(true);
  });

  it("allows a step when budget remains", () => {
    installFoundry({ combat: makeCombat({ started: true }) });
    const actor = makeActor({ movement: { walk: 30 } });
    const token = makeToken({
      actor,
      movementHistory: [{ x: 0, y: 0, cost: 0 }],
      measureMovementPath: () => ({ cost: 5 })
    });
    token.document.actor = actor;
    token.document.object = token;
    expect(combatMoveExceedsBudget(token.document, { x: 100, y: 0 })).toBe(false);
  });

  it("allows undos even when over budget", () => {
    installFoundry({ combat: makeCombat({ started: true }) });
    const actor = makeActor({ movement: { walk: 30 } });
    const token = makeToken({
      actor,
      movementHistory: [
        { x: 0, y: 0, cost: 0 },
        { x: 100, y: 0, cost: 30 }
      ]
    });
    token.document.actor = actor;
    token.document.object = token;
    expect(combatMoveExceedsBudget(token.document, { x: 0, y: 0 }, { isUndo: true })).toBe(false);
  });

  it("estimates cost from measureMovementPath", () => {
    installFoundry({ combat: makeCombat({ started: true }) });
    const token = makeToken({
      actor: makeActor({ movement: { walk: 30 } }),
      measureMovementPath: () => ({ cost: 10 })
    });
    expect(estimateProposedMoveCostFeet(token.document, { x: 200, y: 0 })).toBe(10);
  });
});

describe("undoLastTokenMovement", () => {
  it("reverts to the start in one update, not square by square", async () => {
    installFoundry();
    const history = [
      { x: 0, y: 0 },
      { x: 1, y: 0, movementId: "drag-1" },
      { x: 2, y: 0, movementId: "drag-1" },
      { x: 3, y: 0, movementId: "stub-10" }
    ];
    const token = makeToken({ id: "tok", movementHistory: history });
    token.document.id = "tok";
    token.document._source = { _movementHistory: history };
    token.document.update = vi.fn(async (_data, options) => {
      options._movementArguments.result[token.document.id] = true;
      return true;
    });

    await expect(undoLastTokenMovement(token)).resolves.toBe(true);
    expect(token.document.update).toHaveBeenCalledTimes(1);
    expect(token.document.update).toHaveBeenCalledWith(
      expect.objectContaining({ x: 0, y: 0, _movementHistory: [], action: "walk" }),
      expect.objectContaining({ isUndo: true, pan: false })
    );
  });
});
