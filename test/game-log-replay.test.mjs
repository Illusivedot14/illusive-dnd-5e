import { describe, it, expect, beforeEach, vi } from "vitest";
import { MODULE_ID } from "../src/constants.mjs";
import { freshBudget, readBudget } from "../src/application/economy.mjs";
import { _rememberResolutionForTests, _resetCombatMemory } from "../src/application/combat.mjs";
import {
  setGameLogCombatActive,
  recordMovementOnGameLog,
  recordGameLogEvent,
  getGameLogView,
  undoGameLogFromEntry,
  undoGameLogEntry,
  _resetGameLogForTests,
  _setGameLogCursorForTests
} from "../src/application/combat-game-log.mjs";
import { previewTokenMoveOpportunity } from "../src/application/opportunity-attack.mjs";
import { bindAutomationHooks } from "../src/foundry/hooks.mjs";
import { installFoundry, makeActor, makeCombat, makeCombatant, makeToken } from "./helpers.mjs";

function spent(key) {
  const before = freshBudget();
  const after = { ...before, [key]: 0 };
  return { before, after };
}

function creature(name, budget) {
  const actor = makeActor({
    id: name.toLowerCase(),
    name,
    system: { attributes: { hp: { value: 8, max: 20 } } }
  });
  actor.uuid = `Actor.${actor.id}`;
  actor.update = vi.fn(async () => actor);
  const combatant = makeCombatant({
    id: `cmb-${actor.id}`,
    name,
    actor,
    flags: { [MODULE_ID]: { turn: budget } }
  });
  return { actor, combatant };
}

function installWorld(creatures) {
  const combat = makeCombat({
    started: true,
    combatants: creatures.map((c) => c.combatant)
  });
  installFoundry({ isGM: true, combat });
  globalThis.game.user.isGM = true;
  globalThis.fromUuid = async (uuid) => creatures.find((c) => c.actor.uuid === uuid)?.actor ?? null;
}

function labels() {
  return getGameLogView({ scope: "all" }).entries.map((entry) => entry.label);
}

describe("game log replay", () => {
  beforeEach(() => {
    _resetGameLogForTests();
    _resetCombatMemory();
    setGameLogCombatActive(true);
    _setGameLogCursorForTests(1, 0);
  });

  it("puts spent actions and reactions back when the turn is replayed", async () => {
    const vesper = creature("Vesper", { ...freshBudget(), action: 0 });
    const treant = creature("Treant", { ...freshBudget(), reaction: 0 });
    installWorld([vesper, treant]);

    const hp = {
      type: "actor-hp",
      actorUuid: vesper.actor.uuid,
      prior: { value: 20 }
    };
    const slamSpend = spent("reaction");
    recordGameLogEvent({
      kind: "action",
      label: "Scimitar",
      actorUuid: vesper.actor.uuid,
      resolutionId: "res-scimitar",
      economySpend: spent("action"),
      appliedChanges: [hp]
    });
    recordGameLogEvent({
      kind: "reaction",
      label: "Slam",
      actorUuid: treant.actor.uuid,
      resolutionId: "res-slam",
      parentId: "res-scimitar",
      economySpend: slamSpend,
      appliedChanges: [hp]
    });
    // The live resolution finished without the spend the log row recorded.
    _rememberResolutionForTests({
      id: "res-scimitar",
      phase: "completed",
      actorUuid: vesper.actor.uuid,
      appliedChanges: [hp]
    });
    // This one did record the spend, so replaying it must refund once.
    _rememberResolutionForTests({
      id: "res-slam",
      phase: "completed",
      actorUuid: treant.actor.uuid,
      appliedChanges: [hp],
      economySpend: slamSpend
    });

    const scimitar = getGameLogView({ scope: "all" }).entries.find((e) => e.label === "Scimitar");
    await undoGameLogFromEntry(scimitar.id);

    expect(labels()).toEqual([]);
    expect(readBudget(vesper.combatant).action).toBe(1);
    expect(readBudget(treant.combatant).reaction).toBe(1);
  });

  it("replaying a move does not open the opportunity prompt again", async () => {
    const previousOn = globalThis.Hooks.on;
    const previousOnce = globalThis.Hooks.once;
    const pre = [];
    const post = [];
    globalThis.Hooks.on = (hook, fn) => {
      if (hook === "preUpdateToken") pre.push(fn);
      if (hook === "updateToken") post.push(fn);
    };
    globalThis.Hooks.once = () => {};
    try {
      installFoundry({ isGM: true, combat: { started: true, combatants: [] } });
      bindAutomationHooks();
      const wait = vi.fn(async () => false);
      globalThis.foundry.applications.api.DialogV2.wait = wait;

      const heroActor = makeActor({ id: "hero", name: "Vesper" });
      const hero = makeToken({ id: "hero", name: "Vesper", actor: heroActor });
      const goblin = makeActor({
        id: "gob",
        name: "Goblin",
        items: [{
          id: "sword",
          name: "Scimitar",
          type: "weapon",
          system: {
            type: { value: "martialM" },
            range: { value: 5, units: "ft" },
            activities: {
              get: () => null,
              values: () => [],
              [Symbol.iterator]: function* iterate() {}
            }
          }
        }]
      });
      const gob = makeToken({ id: "gob", name: "Goblin", actor: goblin });
      Object.assign(hero.document, {
        id: "hero",
        uuid: "Scene.scene1.Token.hero",
        x: 100,
        y: 0,
        width: 1,
        height: 1,
        disposition: 1,
        actor: heroActor,
        object: hero,
        movementHistory: [
          { x: 400, y: 0, movementId: "drag1" },
          { x: 100, y: 0, movementId: "drag1" }
        ]
      });
      hero.document.update = vi.fn(async (changes, options) => {
        for (const fn of pre) fn(hero.document, changes, options);
        for (const fn of post) fn(hero.document, changes, options, globalThis.game.user.id);
        return hero.document;
      });
      Object.assign(gob.document, {
        id: "gob",
        uuid: "Scene.scene1.Token.gob",
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        disposition: -1,
        actor: goblin
      });
      globalThis.canvas.tokens.placeables = [hero, gob];
      globalThis.canvas.tokens.get = (id) => ({ hero, gob }[id] ?? null);
      globalThis.canvas.scene = { id: "scene1", grid: { size: 100, distance: 5 } };
      globalThis.game.combat = { started: true, combatants: [] };

      const provoked = previewTokenMoveOpportunity({
        tokenDoc: hero.document,
        changes: { x: 400, y: 0 },
        options: {}
      });
      expect(provoked.provoked).toBe(true);

      const move = recordMovementOnGameLog({
        tokenUuid: hero.document.uuid,
        label: "Vesper moved",
        movementId: "drag1",
        costFeet: 15,
        appliedChanges: [{
          type: "token-movement",
          tokenUuid: hero.document.uuid,
          movementId: "drag1",
          prior: { x: 400, y: 0 },
          historyLenBefore: 1,
          costFeet: 15,
          segments: [{
            prior: { x: 400, y: 0 },
            historyLenBefore: 1,
            costFeet: 15
          }]
        }]
      });

      await undoGameLogFromEntry(move.id);

      expect(wait).not.toHaveBeenCalled();
      expect(hero.document.update).toHaveBeenCalled();
      expect(hero.document.update.mock.calls.at(-1)[1].illusiveSkipOA).toBe(true);
    } finally {
      globalThis.Hooks.on = previousOn;
      globalThis.Hooks.once = previousOnce;
    }
  });

  it("replaying one reaction undoes the reactions that answered it", async () => {
    const vesper = creature("Vesper", freshBudget());
    const treant = creature("Treant", { ...freshBudget(), reaction: 0 });
    const wizard = creature("Wizard", { ...freshBudget(), reaction: 0 });
    installWorld([vesper, treant, wizard]);

    recordGameLogEvent({ kind: "movement", label: "Vesper moved", tokenUuid: "Token.vesper" });
    recordGameLogEvent({
      kind: "reaction",
      label: "Shield",
      actorUuid: treant.actor.uuid,
      resolutionId: "res-shield",
      economySpend: spent("reaction")
    });
    recordGameLogEvent({ kind: "standard", label: "Dash", actorUuid: vesper.actor.uuid });
    const shield = getGameLogView({ scope: "all" }).entries.find((e) => e.label === "Shield");
    recordGameLogEvent({
      kind: "action",
      label: "Counterspell",
      actorUuid: wizard.actor.uuid,
      resolutionId: "res-counter",
      parentId: "res-shield",
      economySpend: spent("reaction"),
      appliedChanges: [{
        type: "actor-hp",
        actorUuid: vesper.actor.uuid,
        prior: { value: 20 }
      }]
    });
    _rememberResolutionForTests({
      id: "res-counter",
      phase: "completed",
      actorUuid: wizard.actor.uuid,
      appliedChanges: [{
        type: "actor-hp",
        actorUuid: vesper.actor.uuid,
        prior: { value: 20 }
      }]
    });

    await undoGameLogEntry(shield.id);

    expect(labels()).toEqual(["Vesper moved", "Dash"]);
    expect(readBudget(treant.combatant).reaction).toBe(1);
    expect(readBudget(wizard.combatant).reaction).toBe(1);
    expect(readBudget(vesper.combatant).action).toBe(1);
  });
});
