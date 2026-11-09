// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  installFoundry,
  makeActor,
  makeToken,
  makeCombat,
  makeCombatant,
  makeGroup,
  makeCardEl
} from "./helpers.mjs";
import {
  jumpToCombatantTurn,
  resolveCombatant,
  cardMemberIds
} from "../src/hud/components/turn-tracker/turn-tracker-combatant.mjs";
import { handleTurnTrackerAction } from "../src/hud/components/turn-tracker/turn-tracker-controls.mjs";
import { getTurnTrackerMenuItems } from "../src/hud/components/turn-tracker/turn-tracker-menu-items.mjs";
import { onTurnTrackerClick } from "../src/hud/components/turn-tracker/turn-tracker-menu.mjs";

const fakeEvent = (target) => ({ target, preventDefault: vi.fn(), stopPropagation: vi.fn() });
const menuItem = (name) => getTurnTrackerMenuItems().find((i) => i.name === name);

/* ------------------------------------------------------------------ */
/*  jumpToCombatantTurn (Set as Current Turn)                          */
/* ------------------------------------------------------------------ */

describe("jumpToCombatantTurn", () => {
  function combatAt(turn, { round = 1, started = true } = {}) {
    const a = makeCombatant({ id: "A", initiative: 20 });
    const b = makeCombatant({ id: "B", initiative: 10 });
    return { combat: makeCombat({ combatants: [a, b], turn, round, started }), a, b };
  }

  beforeEach(() => installFoundry({ isGM: true }));

  it("ignores combatants not in the turn order", () => {
    const { combat } = combatAt(0);
    jumpToCombatantTurn(combat, makeCombatant({ id: "ghost" }));
    expect(combat.update).not.toHaveBeenCalled();
  });

  it("stays in the current round when the target acts later", () => {
    const { combat, b } = combatAt(0);
    jumpToCombatantTurn(combat, b);
    expect(combat.update).toHaveBeenCalledWith({ turn: 1 });
  });

  it("advances a round when the target already acted", () => {
    const { combat, a } = combatAt(1, { round: 3 });
    jumpToCombatantTurn(combat, a);
    expect(combat.update).toHaveBeenCalledWith({ round: 4, turn: 0 });
  });

  it("does not advance the round before combat starts", () => {
    const { combat, a } = combatAt(1, { started: false });
    jumpToCombatantTurn(combat, a);
    expect(combat.update).toHaveBeenCalledWith({ turn: 0 });
  });
});

/* ------------------------------------------------------------------ */
/*  handleTurnTrackerAction                                            */
/* ------------------------------------------------------------------ */

describe("handleTurnTrackerAction", () => {
  let combat;
  beforeEach(() => {
    combat = makeCombat({ started: true });
    installFoundry({ isGM: true, combat });
  });

  it.each([
    ["previous-turn", "previousTurn"],
    ["next-turn", "nextTurn"],
    ["previous-round", "previousRound"],
    ["next-round", "nextRound"],
    ["start-combat", "startCombat"]
  ])("routes %s to combat.%s", async (action, method) => {
    await handleTurnTrackerAction(action, fakeEvent());
    expect(combat[method]).toHaveBeenCalled();
  });

  it("rolls unrolled initiatives before starting combat", async () => {
    const rolled = makeCombatant({ id: "c-rolled", initiative: 12 });
    const pending = makeCombatant({ id: "c-pending", initiative: null });
    combat = makeCombat({ started: false, combatants: [rolled, pending] });
    installFoundry({ isGM: true, combat });
    const event = fakeEvent();

    await handleTurnTrackerAction("start-combat", event);

    expect(combat.rollInitiative).toHaveBeenCalledWith(["c-pending"], { event });
    expect(combat.startCombat).toHaveBeenCalled();
  });

  it("starts combat without rolling when everyone already has initiative", async () => {
    const a = makeCombatant({ id: "a", initiative: 10 });
    const b = makeCombatant({ id: "b", initiative: 5 });
    combat = makeCombat({ started: false, combatants: [a, b] });
    installFoundry({ isGM: true, combat });

    await handleTurnTrackerAction("start-combat", fakeEvent());

    expect(combat.rollInitiative).not.toHaveBeenCalled();
    expect(combat.startCombat).toHaveBeenCalled();
  });

  it("ends combat directly without a redundant confirmation dialog", async () => {
    await handleTurnTrackerAction("end-combat", fakeEvent());
    expect(combat.endCombat).toHaveBeenCalled();
    expect(globalThis.foundry.applications.api.DialogV2.confirm).not.toHaveBeenCalled();
  });

  it("rolls only unrolled combatants for roll-all and legacy roll-npc", async () => {
    const rolled = makeCombatant({ id: "c-rolled", initiative: 12 });
    const pending = makeCombatant({ id: "c-pending", initiative: null });
    combat = makeCombat({ started: true, combatants: [rolled, pending] });
    installFoundry({ isGM: true, combat });
    const event = fakeEvent();

    await handleTurnTrackerAction("roll-all", event);
    await handleTurnTrackerAction("roll-npc", event);

    expect(combat.rollInitiative).toHaveBeenCalledTimes(2);
    expect(combat.rollInitiative).toHaveBeenCalledWith(["c-pending"], { event });
    expect(combat.rollAll).not.toHaveBeenCalled();
    expect(combat.rollNPC).not.toHaveBeenCalled();
  });

  it("does nothing on roll-all when everyone already has initiative", async () => {
    const a = makeCombatant({ id: "a", initiative: 10 });
    const b = makeCombatant({ id: "b", initiative: 5 });
    combat = makeCombat({ started: true, combatants: [a, b] });
    installFoundry({ isGM: true, combat });

    await handleTurnTrackerAction("roll-all", fakeEvent());

    expect(combat.rollInitiative).not.toHaveBeenCalled();
    expect(combat.rollAll).not.toHaveBeenCalled();
  });

  it("confirms before resetting initiative", async () => {
    globalThis.foundry.applications.api.DialogV2.confirm = vi.fn(async () => true);
    await handleTurnTrackerAction("reset", fakeEvent());
    expect(combat.resetAll).toHaveBeenCalled();
  });

  it("does not reset when the confirmation is declined", async () => {
    globalThis.foundry.applications.api.DialogV2.confirm = vi.fn(async () => false);
    await handleTurnTrackerAction("reset", fakeEvent());
    expect(combat.resetAll).not.toHaveBeenCalled();
  });

  it("cycles to another encounter on the scene", async () => {
    const c1 = makeCombat({ id: "c1", sceneId: "scene1" });
    const c2 = makeCombat({ id: "c2", sceneId: "scene1" });
    installFoundry({ isGM: true, combat: c1, combats: [c1, c2], scene: { id: "scene1" } });
    await handleTurnTrackerAction("next-encounter", fakeEvent());
    expect(c2.activate).toHaveBeenCalled();
  });

  it("ignores encounter cycling when only one encounter exists", async () => {
    await handleTurnTrackerAction("next-encounter", fakeEvent());
    // combat.activate is the only encounter; nothing to switch to.
    expect(combat.activate).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  resolveCombatant + cardMemberIds                                  */
/* ------------------------------------------------------------------ */

describe("resolveCombatant", () => {
  it("resolves a single combatant card", () => {
    const cmb = makeCombatant({ id: "c1", actor: makeActor() });
    const combat = makeCombat({ combatants: [cmb] });
    installFoundry({ isGM: true, combat });

    const resolved = resolveCombatant(makeCardEl({ id: "c1" }));
    expect(resolved.combatant).toBe(cmb);
    expect(resolved.list).toEqual([cmb]);
    expect(resolved.group).toBeNull();
  });

  it("resolves a group card into all members", () => {
    const m1 = makeCombatant({ id: "m1", groupId: "g1" });
    const m2 = makeCombatant({ id: "m2", groupId: "g1" });
    const group = makeGroup({ id: "g1", members: [m1, m2] });
    const combat = makeCombat({ combatants: [m1, m2], groups: [group] });
    installFoundry({ isGM: true, combat });

    const resolved = resolveCombatant(makeCardEl({ id: "m1", groupId: "g1" }));
    expect(resolved.combatant).toBeNull();
    expect(resolved.group).toBe(group);
    expect(resolved.list).toEqual([m1, m2]);
  });

  it("returns an empty list for a target with no combatant data", () => {
    installFoundry({ isGM: true, combat: makeCombat() });
    const resolved = resolveCombatant(document.createElement("div"));
    expect(resolved.combatant).toBeNull();
    expect(resolved.list).toEqual([]);
  });
});

describe("cardMemberIds", () => {
  it("returns the single combatant id for a solo card", () => {
    const combat = makeCombat({ combatants: [makeCombatant({ id: "c1" })] });
    installFoundry({ isGM: true, combat });
    expect(cardMemberIds(combat, makeCardEl({ id: "c1" }))).toEqual(["c1"]);
  });

  it("returns every member id for a group card", () => {
    const m1 = makeCombatant({ id: "m1", groupId: "g1" });
    const m2 = makeCombatant({ id: "m2", groupId: "g1" });
    const group = makeGroup({ id: "g1", members: [m1, m2] });
    const combat = makeCombat({ combatants: [m1, m2], groups: [group] });
    installFoundry({ isGM: true, combat });
    expect(cardMemberIds(combat, makeCardEl({ id: "m1", groupId: "g1" }))).toEqual(["m1", "m2"]);
  });
});

/* ------------------------------------------------------------------ */
/*  onTurnTrackerClick routing                                        */
/* ------------------------------------------------------------------ */

describe("onTurnTrackerClick", () => {
  it("routes a control button to its action", () => {
    const combat = makeCombat({ started: true });
    installFoundry({ isGM: true, combat });
    const button = document.createElement("button");
    button.className = "illusive-dnd-turn-btn";
    button.dataset.action = "next-turn";
    onTurnTrackerClick(fakeEvent(button));
    expect(combat.nextTurn).toHaveBeenCalled();
  });

  it("rolls initiative when the d20 control is clicked", () => {
    const cmb = makeCombatant({ id: "c1", actor: makeActor({ isOwner: true }), initiative: null });
    const combat = makeCombat({ combatants: [cmb] });
    installFoundry({ isGM: false, combat });

    const card = makeCardEl({ id: "c1", roll: true });
    document.body.appendChild(card);
    const rollControl = card.querySelector(".illusive-dnd-turn-init-roll");
    onTurnTrackerClick(fakeEvent(rollControl));
    expect(combat.rollInitiative).toHaveBeenCalledWith(["c1"]);
  });

  it("selects the token for a solo card", () => {
    const token = makeToken({ id: "tok1" });
    const cmb = makeCombatant({ id: "c1", token });
    const combat = makeCombat({ combatants: [cmb] });
    installFoundry({ isGM: true, combat, tokens: [token] });

    onTurnTrackerClick(fakeEvent(makeCardEl({ id: "c1", tokenId: "tok1" })));
    expect(token.control).toHaveBeenCalled();
  });

  it("pans and pings an unowned token without selecting or warning", () => {
    const token = makeToken({ id: "tok1", isOwner: false, isVisible: true });
    const cmb = makeCombatant({ id: "c1", token, actor: makeActor({ isOwner: false }) });
    const combat = makeCombat({ combatants: [cmb] });
    installFoundry({ isGM: false, combat, tokens: [token] });

    onTurnTrackerClick(fakeEvent(makeCardEl({ id: "c1", tokenId: "tok1" })));
    expect(token.control).not.toHaveBeenCalled();
    expect(ui.notifications.warn).not.toHaveBeenCalled();
    expect(canvas.animatePan).toHaveBeenCalled();
    expect(canvas.ping).toHaveBeenCalledWith(token.center);
  });

  it("controls every token when a group card is clicked", () => {
    const t1 = makeToken({ id: "t1" });
    const t2 = makeToken({ id: "t2" });
    const m1 = makeCombatant({ id: "m1", token: t1, groupId: "g1" });
    const m2 = makeCombatant({ id: "m2", token: t2, groupId: "g1" });
    const group = makeGroup({ id: "g1", members: [m1, m2] });
    const combat = makeCombat({ combatants: [m1, m2], groups: [group] });
    installFoundry({ isGM: true, combat, tokens: [t1, t2] });

    onTurnTrackerClick(fakeEvent(makeCardEl({ id: "m1", groupId: "g1" })));
    expect(t1.control).toHaveBeenCalled();
    expect(t2.control).toHaveBeenCalled();
  });

  it("pans and pings an unowned group without selecting", () => {
    const t1 = makeToken({ id: "t1", isOwner: false, isVisible: true });
    const t2 = makeToken({ id: "t2", isOwner: false, isVisible: true });
    const m1 = makeCombatant({ id: "m1", token: t1, groupId: "g1", actor: makeActor({ isOwner: false }) });
    const m2 = makeCombatant({ id: "m2", token: t2, groupId: "g1", actor: makeActor({ isOwner: false }) });
    const group = makeGroup({ id: "g1", members: [m1, m2] });
    const combat = makeCombat({ combatants: [m1, m2], groups: [group] });
    installFoundry({ isGM: false, combat, tokens: [t1, t2] });

    onTurnTrackerClick(fakeEvent(makeCardEl({ id: "m1", groupId: "g1" })));
    expect(t1.control).not.toHaveBeenCalled();
    expect(t2.control).not.toHaveBeenCalled();
    expect(ui.notifications.warn).not.toHaveBeenCalled();
    expect(canvas.animatePan).toHaveBeenCalled();
    expect(canvas.ping).toHaveBeenCalledWith(t1.center);
  });
});

/* ------------------------------------------------------------------ */
/*  getTurnTrackerMenuItems (GM context menu)                         */
/* ------------------------------------------------------------------ */

describe("getTurnTrackerMenuItems", () => {
  function soloSetup({ isGM = true, ...cmbOpts } = {}) {
    const token = makeToken({ id: "tok1" });
    const cmb = makeCombatant({ id: "c1", token, actor: makeActor(), ...cmbOpts });
    const combat = makeCombat({ combatants: [cmb], active: cmb });
    installFoundry({ isGM, combat, tokens: [token] });
    return { card: makeCardEl({ id: "c1", tokenId: "tok1" }), cmb, combat, token };
  }

  it("gates GM-only items behind GM status", () => {
    const { card } = soloSetup({ isGM: false, initiative: 12 });
    expect(menuItem("Set as Current Turn").condition(card)).toBe(false);
    expect(menuItem("Reroll Initiative").condition(card)).toBe(false);
    expect(menuItem("Remove from Combat").condition(card)).toBe(false);
    // Target/Ping are available to everyone.
    expect(menuItem("Target").condition(card)).toBe(true);
    expect(menuItem("Ping").condition(card)).toBe(true);
  });

  it("rerolls initiative for the resolved combatant", () => {
    const { card, combat } = soloSetup({ initiative: 5 });
    menuItem("Reroll Initiative").callback(card);
    expect(combat.rollInitiative).toHaveBeenCalledWith(["c1"]);
  });

  it("sets a specific initiative value from the prompt", async () => {
    const { card, cmb } = soloSetup({ initiative: 5 });
    globalThis.foundry.applications.api.DialogV2.prompt = vi.fn(async () => "17");
    const setInit = getTurnTrackerMenuItems().find((i) => i.name.startsWith("Set Initiative"));
    await setInit.callback(card);
    expect(cmb.update).toHaveBeenCalledWith({ initiative: 17 });
  });

  it("clears initiative (condition requires a rolled value)", () => {
    const rolled = soloSetup({ initiative: 9 });
    expect(menuItem("Clear Initiative").condition(rolled.card)).toBe(true);
    menuItem("Clear Initiative").callback(rolled.card);
    expect(rolled.cmb.update).toHaveBeenCalledWith({ initiative: null });

    const unrolled = soloSetup({ initiative: null });
    expect(menuItem("Clear Initiative").condition(unrolled.card)).toBe(false);
  });

  it("hides and reveals based on the current hidden state", () => {
    const visible = soloSetup({ hidden: false });
    expect(menuItem("Hide from Players").condition(visible.card)).toBe(true);
    expect(menuItem("Reveal to Players").condition(visible.card)).toBe(false);
    menuItem("Hide from Players").callback(visible.card);
    expect(visible.cmb.update).toHaveBeenCalledWith({ hidden: true });

    const hidden = soloSetup({ hidden: true });
    expect(menuItem("Reveal to Players").condition(hidden.card)).toBe(true);
    menuItem("Reveal to Players").callback(hidden.card);
    expect(hidden.cmb.update).toHaveBeenCalledWith({ hidden: false });
  });

  it("marks a combatant defeated (updates flag and toggles the status effect)", async () => {
    const { card, cmb } = soloSetup({ defeated: false, actor: makeActor() });
    await menuItem("Mark Defeated").callback(card);
    expect(cmb.update).toHaveBeenCalledWith({ defeated: true });
    expect(cmb.actor.toggleStatusEffect).toHaveBeenCalled();
  });

  it("targets and pings via the token", () => {
    const { card, token } = soloSetup({ initiative: 5 });
    menuItem("Target").callback(card);
    expect(token.setTarget).toHaveBeenCalled();

    menuItem("Ping").callback(card);
    expect(globalThis.canvas.ping).toHaveBeenCalled();
  });

  it("removes the combatant from combat", () => {
    const { card, cmb } = soloSetup({ initiative: 5 });
    menuItem("Remove from Combat").callback(card);
    expect(cmb.delete).toHaveBeenCalled();
  });

  it("only offers Edit Event for event combatants", () => {
    const normal = soloSetup({ initiative: 5 });
    expect(menuItem("Edit Event").condition(normal.card)).toBe(false);

    const token = makeToken({ id: "tokE" });
    const ev = makeCombatant({ id: "ev", event: true, token });
    const combat = makeCombat({ combatants: [ev], active: ev });
    installFoundry({ isGM: true, combat, tokens: [token] });
    expect(menuItem("Edit Event").condition(makeCardEl({ id: "ev" }))).toBe(true);
  });

  describe("group cards", () => {
    function groupSetup({ isGM = true, hidden = [false, false], initiative = 12 } = {}) {
      const m1 = makeCombatant({ id: "m1", groupId: "g1", initiative, actor: makeActor(), hidden: hidden[0] });
      const m2 = makeCombatant({ id: "m2", groupId: "g1", initiative, actor: makeActor(), hidden: hidden[1] });
      const group = makeGroup({ id: "g1", members: [m1, m2] });
      const combat = makeCombat({ combatants: [m1, m2], groups: [group], active: m1 });
      installFoundry({ isGM, combat });
      return { card: makeCardEl({ id: "m1", groupId: "g1" }), m1, m2, combat };
    }

    it("rerolls initiative for every group member", () => {
      const { card, combat } = groupSetup();
      menuItem("Reroll Initiative").callback(card);
      expect(combat.rollInitiative).toHaveBeenCalledWith(["m1", "m2"]);
    });

    it("hides all members at once", () => {
      const { card, m1, m2 } = groupSetup({ hidden: [false, false] });
      menuItem("Hide from Players").callback(card);
      expect(m1.update).toHaveBeenCalledWith({ hidden: true });
      expect(m2.update).toHaveBeenCalledWith({ hidden: true });
    });

    it("removes all members from combat", () => {
      const { card, m1, m2 } = groupSetup();
      menuItem("Remove from Combat").callback(card);
      expect(m1.delete).toHaveBeenCalled();
      expect(m2.delete).toHaveBeenCalled();
    });
  });
});
