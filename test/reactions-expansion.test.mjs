import { describe, it, expect, beforeEach } from "vitest";
import {
  getReactionSpec,
  listMatchingActivities,
  mergePatches,
  runReactionUseHooks,
  REACTION_REGISTRY
} from "../src/application/reactions/registry.mjs";
import { damageTargetsFromPatches } from "../src/application/reactions/window.mjs";
import {
  grantNextD20Advantage,
  hasNextD20Advantage,
  consumeNextD20Advantage,
  addPendingHitRider,
  takePendingHitRiders,
  tickPendingHitRiders,
  listPendingHitRiders,
  setReadiedAction,
  getReadiedAction
} from "../src/application/reactions/reaction-state.mjs";
import { collectSaveModifiers } from "../src/application/roll-modifiers.mjs";
import { noteFall, takeFallFor, _resetFalls } from "../src/application/falling.mjs";
import { appliesCharmOrFear } from "../src/application/save-resolve.mjs";
import { getRule } from "../src/rules/catalog.mjs";

function makeActor({ items = [], system = {}, uuid = "Actor.a" } = {}) {
  const flags = {};
  return {
    uuid,
    id: uuid.split(".").pop(),
    system,
    items: Object.assign(items, { get: (id) => items.find((i) => i.id === id) }),
    getFlag: (_scope, key) => flags[key],
    setFlag: async (_scope, key, value) => { flags[key] = value; },
    unsetFlag: async (_scope, key) => { delete flags[key]; },
    _flags: flags
  };
}

function activities(list) {
  return Object.assign(list, { get: (id) => list.find((a) => a.id === id) });
}

describe("reaction state and Ready", () => {
  beforeEach(() => {
    _resetFalls();
  });

  it("every registry spec cites a catalog rule", () => {
    for (const spec of Object.values(REACTION_REGISTRY)) {
      expect(getRule(spec.rule), spec.id).toBeTruthy();
    }
  });

  it("a Silvery Barbs grant gives advantage on the next save, then is consumed", async () => {
    const actor = makeActor();
    await grantNextD20Advantage(actor, { source: "silvery-barbs" });
    expect(hasNextD20Advantage(actor)).toBe(true);
    expect(collectSaveModifiers({ actor, ability: "dex" })).toMatchObject({ advantage: true });
    await consumeNextD20Advantage(actor);
    expect(hasNextD20Advantage(actor)).toBe(false);
  });

  it("a next-turn rider arms at the owner's turn start and only fits a melee hit", async () => {
    const reactor = makeActor();
    await addPendingHitRider(reactor, { source: "absorb-elements", formula: "2d6", damageType: "fire", meleeOnly: true, ownTurnOnly: true });
    expect(await takePendingHitRiders(reactor, { melee: true, ownTurn: true })).toEqual([]);
    await tickPendingHitRiders(reactor);
    expect(await takePendingHitRiders(reactor, { melee: false, ownTurn: true })).toEqual([]);
    const taken = await takePendingHitRiders(reactor, { melee: true, ownTurn: true });
    expect(taken).toHaveLength(1);
    expect(listPendingHitRiders(reactor)).toEqual([]);
  });

  it("an armed next-turn rider lapses at the following turn start", async () => {
    const reactor = makeActor();
    await addPendingHitRider(reactor, { source: "absorb-elements", formula: "1d6", ownTurnOnly: true });
    await tickPendingHitRiders(reactor);
    await tickPendingHitRiders(reactor);
    expect(listPendingHitRiders(reactor)).toEqual([]);
  });

  it("Ready offers the readied activity only on its trigger window and range", async () => {
    const bow = { id: "bow", system: { activities: activities([{ id: "shoot", type: "attack" }]) } };
    const actor = makeActor({ items: [bow] });
    await setReadiedAction(actor, { text: "", trigger: "move", itemId: "bow", activityId: "shoot", rangeFeet: 30 });
    const spec = getReactionSpec("ready");
    expect(listMatchingActivities(actor, spec, { windowId: "after-move", distanceToTrigger: 20 })).toHaveLength(1);
    expect(listMatchingActivities(actor, spec, { windowId: "after-move", distanceToTrigger: 40 })).toHaveLength(0);
    expect(listMatchingActivities(actor, spec, { windowId: "on-cast", distanceToTrigger: 20 })).toHaveLength(0);
    expect(listMatchingActivities(actor, spec, { windowId: "after-move", hostile: false })).toHaveLength(0);
    await runReactionUseHooks("after", ["ready"], actor, bow);
    expect(getReadiedAction(actor)).toBeNull();
  });

  it("a zero damage multiplier reaches the fall damage write", () => {
    const merged = mergePatches([{ type: "damageMultiplier", targetUuid: "Fall.T", value: 0, source: "feather-fall" }]);
    expect(damageTargetsFromPatches(["Fall.T"], merged)[0].multiplier).toBe(0);
  });

  it("matches a dnd5e fall to its damage roll", () => {
    globalThis.game = { user: { id: "me" } };
    noteFall({ uuid: "Scene.s.Token.t" }, { dnd5e: { fall: { distance: 30 } } }, "me");
    expect(takeFallFor([{ options: { type: "fire" } }])).toBeNull();
    expect(takeFallFor([{ options: { type: "bludgeoning" } }])).toMatchObject({ tokenUuid: "Scene.s.Token.t", distance: 30 });
    expect(takeFallFor([{ options: { type: "bludgeoning" } }])).toBeNull();
    noteFall({ uuid: "Scene.s.Token.t" }, { dnd5e: { fall: { distance: 30 } } }, "someone-else");
    expect(takeFallFor([{ options: { type: "bludgeoning" } }])).toBeNull();
    delete globalThis.game;
  });

  it("detects charm and fear save effects", () => {
    const fear = { statuses: new Set(["frightened"]) };
    expect(appliesCharmOrFear({ effects: [{ effect: fear }], item: { name: "Cause Fear" } })).toBe(true);
    expect(appliesCharmOrFear({ effects: [], item: { name: "Fireball" } })).toBe(false);
  });
});
