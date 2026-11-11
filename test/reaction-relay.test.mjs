import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/foundry/scene-adapter.mjs", () => ({
  getGridFacts: () => ({ size: 100, distance: 5 }),
  getTokenFacts: (t) => t?.facts ?? null
}));
vi.mock("../src/application/perception.mjs", () => ({
  evaluateVisibilityBetween: ({ observerUuid }) => ({
    result: observerUuid === "Token.blind" ? "not-visible" : "visible"
  })
}));
vi.mock("../src/application/economy.mjs", async (importOriginal) => ({
  ...(await importOriginal()),
  isEconomyAvailable: () => true,
  getReactionTimeoutMs: () => 50
}));

import { installFoundry, resetFoundry, makeActor, makeCollection } from "./helpers.mjs";
import {
  collectWindowCandidates,
  promptReactor,
  openReactionWindow,
  _resetHardWindowWaits
} from "../src/application/reactions/window.mjs";
import { remoteOwnerFor } from "../src/foundry/reaction-socket.mjs";
import { declarationSpecsForWindow } from "../src/application/triggers/engine.mjs";
import { _resetTriggerIndex } from "../src/application/triggers/index.mjs";
import { _resetCombatMemory, getResolution } from "../src/application/combat.mjs";
import { createActionResolution } from "../src/domain/combat/action-state.mjs";
import { saveResolution } from "../src/foundry/workflow-store.mjs";
import {
  passReaction,
  startReactionPrompt,
  getReactionContext
} from "../src/application/reaction-context.mjs";

function spellItem(name) {
  const activity = { id: "act1", type: "utility" };
  return { id: `item-${name}`, name, type: "spell", system: { activities: makeCollection([activity]) } };
}

function shieldSpell() {
  return { ...spellItem("Shield"), id: "shield" };
}

function placeToken({ id, actor, col, row = 0, disposition = -1 }) {
  return {
    id,
    actor,
    document: { uuid: `Token.${id}`, disposition },
    facts: { x: col * 100, y: row * 100, width: 1, height: 1 }
  };
}

describe("reaction window eligibility", () => {
  let tokens;
  beforeEach(() => {
    installFoundry();
    _resetHardWindowWaits();
    _resetTriggerIndex();
    const caster = makeActor({ id: "caster", name: "Caster" });
    caster.uuid = "Actor.caster";
    const near = makeActor({ id: "near", items: [spellItem("Counterspell")] });
    near.uuid = "Actor.near";
    const far = makeActor({ id: "far", items: [spellItem("Counterspell")] });
    far.uuid = "Actor.far";
    const stunned = makeActor({ id: "stunned", items: [spellItem("Counterspell")] });
    stunned.uuid = "Actor.stunned";
    stunned.statuses = new Set(["stunned"]);
    const blind = makeActor({ id: "blind", items: [spellItem("Counterspell")] });
    blind.uuid = "Actor.blind";
    tokens = [
      placeToken({ id: "caster", actor: caster, col: 0, disposition: -1 }),
      placeToken({ id: "near", actor: near, col: 6, disposition: 1 }),
      placeToken({ id: "far", actor: far, col: 20, disposition: 1 }),
      placeToken({ id: "stunned", actor: stunned, col: 2, disposition: 1 }),
      placeToken({ id: "blind", actor: blind, col: 3, disposition: 1 })
    ];
    globalThis.canvas.tokens = makeCollection(tokens);
    globalThis.canvas.tokens.placeables = tokens;
    globalThis.fromUuidSync = (uuid) => tokens.find((t) => t.document.uuid === uuid)?.document ?? null;
    for (const t of tokens) t.document.object = t;
  });
  afterEach(() => {
    resetFoundry();
    delete globalThis.fromUuidSync;
  });

  it("offers Counterspell only to hostile, sighted, conscious reactors within 60 ft", () => {
    const groups = collectWindowCandidates("on-cast", { triggerTokenUuid: "Token.caster" });
    expect(groups.map((g) => g.actor.id)).toEqual(["near"]);
    expect(groups[0].specs.map((s) => s.id)).toEqual(["counterspell"]);
  });

  it("never offers the triggering creature its own reaction", () => {
    tokens[0].actor.items = makeCollection([spellItem("Counterspell")]);
    const groups = collectWindowCandidates("on-cast", { triggerTokenUuid: "Token.caster" });
    expect(groups.some((g) => g.actor.id === "caster")).toBe(false);
  });

  it("orders reactors by initiative, highest first", () => {
    tokens[3].actor.statuses = new Set();
    tokens[4].actor.uuid = "Actor.blind2";
    tokens[4].document.uuid = "Token.blind2";
    globalThis.game.combat = {
      combatants: [
        { tokenId: "near", initiative: 5 },
        { tokenId: "stunned", initiative: 18 },
        { tokenId: "blind", initiative: 11 }
      ]
    };
    const groups = collectWindowCandidates("on-cast", { triggerTokenUuid: "Token.caster" });
    expect(groups.map((g) => g.actor.id)).toEqual(["stunned", "blind", "near"]);
  });
});

describe("reaction relay", () => {
  beforeEach(() => {
    _resetTriggerIndex();
  });
  afterEach(() => {
    resetFoundry();
    _resetHardWindowWaits();
  });

  it("picks the active non-GM owner, or this client when it owns the actor", () => {
    installFoundry();
    const player = { id: "player2", active: true, isGM: false };
    const gm = { id: "gm", active: true, isGM: true };
    globalThis.game.users = [gm, player];
    const actor = { testUserPermission: (u) => u.id === "player2" };
    expect(remoteOwnerFor(actor)?.id).toBe("player2");

    globalThis.game.user.id = "player2";
    expect(remoteOwnerFor(actor)).toBeNull();
    expect(remoteOwnerFor({ testUserPermission: () => false })).toBeNull();
  });

  it("sends a player character's reaction to the assigned player while the GM is the one moving", () => {
    installFoundry();
    const vesper = { id: "vesper", uuid: "Actor.vesper" };
    const player = { id: "vesper-user", active: true, isGM: false, character: vesper };
    globalThis.game.user = { id: "gm", isGM: true };
    globalThis.game.users = [player, { id: "gm", active: true, isGM: true, isSelf: true }];
    const actor = {
      id: "vesper",
      uuid: "Actor.vesper",
      isOwner: true,
      testUserPermission: () => false
    };
    expect(remoteOwnerFor(actor)?.id).toBe("vesper-user");
  });

  it("sends a remote owner the prompt instead of showing it locally", () => {
    installFoundry();
    const emit = vi.fn();
    globalThis.game.socket = { emit, on: vi.fn() };
    globalThis.game.users = [{ id: "player2", active: true, isGM: false }];
    const actor = makeActor({ id: "rogue", items: [spellItem("Uncanny Dodge")] });
    actor.uuid = "Actor.rogue";
    actor.testUserPermission = (u) => u.id === "player2";

    const where = promptReactor(actor, [{ id: "act1", item: { id: "item-Uncanny Dodge" } }], "on-damage-known", {
      hardWindow: true,
      parentId: "res-1"
    });

    expect(where).toBe("remote");
    expect(getReactionContext()).toBeNull();
    const payload = emit.mock.calls[0][1];
    expect(payload).toMatchObject({
      type: "illusive-dnd-reaction",
      kind: "prompt",
      toUserId: "player2",
      refs: [{ itemId: "item-Uncanny Dodge", activityId: "act1" }]
    });
    expect(payload.options).toMatchObject({ hardWindow: true, parentId: "res-1", actorUuid: "Actor.rogue" });
  });

  it("a relayed Pass answers the asking client over the socket", async () => {
    installFoundry();
    const emit = vi.fn();
    globalThis.game.socket = { emit, on: vi.fn() };
    const actor = makeActor({ id: "rogue", isOwner: true });
    startReactionPrompt(actor, [{ id: "a1", item: { id: "i1" } }], "on-damage-known", {
      hardWindow: true,
      parentId: "res-1",
      actorUuid: "Actor.rogue",
      relayUserId: "gm"
    });

    passReaction();
    await vi.waitFor(() => expect(emit).toHaveBeenCalled());

    const [, payload] = emit.mock.calls[0];
    expect(payload).toMatchObject({ kind: "decision", toUserId: "gm", used: false });
    expect(payload.options).toMatchObject({ parentId: "res-1", actorUuid: "Actor.rogue" });
    expect(payload.options.relayUserId).toBeUndefined();
  });

  it("hard window: pauses the parent, a local Pass resumes it unchanged", async () => {
    installFoundry();
    _resetCombatMemory();
    await saveResolution(createActionResolution({ id: "hw-1", phase: "awaiting-attack", actorUuid: "Actor.orc" }));
    const wizard = makeActor({ id: "wiz", name: "Wizard", isOwner: true, items: [shieldSpell()] });
    wizard.uuid = "Actor.wiz";
    const fighter = makeActor({ id: "fig", name: "Fighter", isOwner: true, items: [shieldSpell()] });
    fighter.uuid = "Actor.fig";
    const groupFor = (actor) => ({
      actor,
      token: { id: actor.id, name: actor.name, document: { uuid: `Token.${actor.id}` } },
      specs: declarationSpecsForWindow("on-attack-hit", actor),
      activities: [{ id: "a1", item: { id: "shield" }, name: "Shield" }],
      ctx: { isTarget: true, targetUuids: [`Token.${actor.id}`] }
    });

    const wait = vi.fn(async (dialog) => {
      expect(getResolution("hw-1").phase).toBe("awaiting-reaction");
      expect(dialog.content).toContain("Wizard");
      expect(dialog.content).toContain("Fighter");
      expect(dialog.buttons.map((button) => button.action)).toEqual(["pass", "confirm"]);
      return "pass";
    });
    globalThis.foundry.applications.api.DialogV2.wait = wait;

    const merged = await openReactionWindow({
      parentId: "hw-1",
      windowId: "on-attack-hit",
      candidates: [groupFor(wizard), groupFor(fighter)]
    });

    expect(wait).toHaveBeenCalledOnce();
    expect(merged.acBonusByTarget.size).toBe(0);
    expect(getResolution("hw-1").phase).toBe("awaiting-attack");
  });

  it("hard window: a relayed decision settles on the asking client", async () => {
    installFoundry();
    _resetCombatMemory();
    await saveResolution(createActionResolution({ id: "hw-2", phase: "awaiting-attack", actorUuid: "Actor.orc" }));
    const query = vi.fn(async (name) => {
      if (String(name).endsWith("reactionUse")) return { used: true, itemId: "shield" };
      return { picks: [{ actorUuid: "Actor.wiz", itemId: "shield", activityId: "a1" }] };
    });
    globalThis.game.users = [{ id: "player2", active: true, isGM: false, query }];
    const wizard = makeActor({ id: "wiz", name: "Wizard", items: [shieldSpell()] });
    wizard.uuid = "Actor.wiz";
    wizard.testUserPermission = (u) => u.id === "player2";
    const group = {
      actor: wizard,
      token: { id: "tw", name: "Wizard", document: { uuid: "Token.wiz" } },
      specs: declarationSpecsForWindow("on-attack-hit", wizard),
      activities: [{ id: "a1", item: { id: "shield" }, name: "Shield" }],
      ctx: { isTarget: true, targetUuids: ["Token.wiz"] }
    };

    const merged = await openReactionWindow({ parentId: "hw-2", windowId: "on-attack-hit", candidates: [group] });
    expect(query.mock.calls.map((call) => call[0])).toEqual([
      "illusive-dnd-5e.reactionWindow",
      "illusive-dnd-5e.reactionUse"
    ]);

    expect(merged.acBonusByTarget.get("Token.wiz")).toBe(5);
    expect(getResolution("hw-2").phase).toBe("awaiting-attack");
  });

  it("a player does not write the world workflow store", async () => {
    installFoundry();
    globalThis.game.user.isGM = false;
    const set = vi.fn();
    globalThis.game.settings = {
      settings: { has: () => true },
      get: () => ({}),
      set
    };
    await saveResolution(createActionResolution({ id: "player-res", phase: "created", actorUuid: "Actor.vesper" }));
    expect(set).not.toHaveBeenCalled();
  });
});
