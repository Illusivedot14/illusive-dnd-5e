import { describe, it, expect, beforeEach, vi } from "vitest";
import { MODULE_ID, installFoundry, makeActor, makeCombatant, makeCombat, makeToken } from "./helpers.mjs";
import {
  getEconomyActions,
  isEconomyAvailable,
  getEconomyAvailability,
  markEconomyUsed,
  readBudget,
  freshBudget,
  writeBudget
} from "../src/application/economy.mjs";
import { bindCombatTurnHooks } from "../src/foundry/combat-turn.mjs";

function installCombatWithActor(actor, token, budget = freshBudget()) {
  const combatant = makeCombatant({
    actor,
    token,
    tokenId: token.id,
    flags: { [MODULE_ID]: { turn: budget } }
  });
  const combat = makeCombat({ started: true, combatants: [combatant] });
  installFoundry({ combat, tokens: [token] });
  game.combats.viewed = combat;
  return { combat, combatant };
}

describe("activity economy (combatant budget)", () => {
  beforeEach(() => installFoundry());

  it("is always available out of combat", () => {
    const actor = makeActor({ id: "a1" });
    expect(isEconomyAvailable(actor, "action")).toBe(true);
    expect(getEconomyAvailability(actor)).toEqual({
      action: true,
      bonus: true,
      reaction: true
    });
    expect(getEconomyActions(actor)).toEqual({});
  });

  it("reads availability from the combatant turn budget", () => {
    const actor = makeActor({ id: "a1" });
    const token = makeToken({ id: "t1", actor });
    installCombatWithActor(actor, token, { ...freshBudget(), action: 0, bonus: 1 });

    expect(isEconomyAvailable(actor, "action")).toBe(false);
    expect(isEconomyAvailable(actor, "bonus")).toBe(true);
    expect(getEconomyAvailability(actor)).toEqual({
      action: false,
      bonus: true,
      reaction: true
    });
    expect(getEconomyActions(actor)).toEqual({
      action: true,
      bonus: false,
      reaction: false
    });
  });

  it("unlinked copies of one actor keep separate reactions", () => {
    const firstActor = makeActor({ id: "treant", name: "Treant" });
    firstActor.uuid = "Scene.1.Token.t1";
    const secondActor = makeActor({ id: "treant", name: "Treant" });
    secondActor.uuid = "Scene.1.Token.t2";
    const firstToken = makeToken({ id: "t1", actor: firstActor });
    const secondToken = makeToken({ id: "t2", actor: secondActor });
    const spent = makeCombatant({
      actor: firstActor,
      token: firstToken,
      tokenId: "t1",
      flags: { [MODULE_ID]: { turn: { ...freshBudget(), reaction: 0 } } }
    });
    const ready = makeCombatant({
      actor: secondActor,
      token: secondToken,
      tokenId: "t2",
      flags: { [MODULE_ID]: { turn: freshBudget() } }
    });
    const combat = makeCombat({ started: true, combatants: [spent, ready] });
    installFoundry({ combat, tokens: [firstToken, secondToken] });

    expect(isEconomyAvailable(firstActor, "reaction", firstToken)).toBe(false);
    expect(isEconomyAvailable(secondActor, "reaction", secondToken)).toBe(true);
  });

  it("markEconomyUsed spends the combatant budget", async () => {
    const actor = makeActor({ id: "a1" });
    const token = makeToken({ id: "t1", actor });
    const { combatant } = installCombatWithActor(actor, token);

    const spend = await markEconomyUsed(actor, "action");
    expect(spend.before.action).toBe(1);
    expect(spend.after.action).toBe(0);
    expect(readBudget(combatant).action).toBe(0);
    expect(isEconomyAvailable(actor, "action")).toBe(false);
  });

  it("a player asks the GM to save a combatant budget instead of updating it", async () => {
    installFoundry();
    const query = vi.fn(async () => ({ ok: true }));
    globalThis.game.user.isGM = false;
    globalThis.game.users = [{ id: "user1", active: true, isGM: false, name: "Vesper" }];
    globalThis.game.users.activeGM = { id: "gm", isSelf: false, query };
    const combatant = makeCombatant({ id: "GLBnA7yc6B6eIKvR" });
    combatant.uuid = "Combat.OUNariBh0nbQ1ieO.Combatant.GLBnA7yc6B6eIKvR";

    await writeBudget(combatant, freshBudget());

    expect(combatant.setFlag).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith(
      "illusive-dnd-5e.write",
      expect.objectContaining({
        op: expect.objectContaining({
          type: "setFlag",
          uuid: combatant.uuid,
          key: "turn"
        })
      }),
      expect.any(Object)
    );
  });

  it("a player's turn-change hook does not update the combatant", async () => {
    installFoundry();
    const previousOn = globalThis.Hooks.on;
    const handlers = {};
    globalThis.Hooks.on = (name, fn) => { handlers[name] = fn; };
    try {
      bindCombatTurnHooks();
      const combatant = makeCombatant({ id: "c1", tokenId: "t1" });
      const combat = makeCombat({ id: "combat", started: true, combatants: [combatant] });
      combat.current = { tokenId: "t1" };
      globalThis.game.combat = combat;
      globalThis.game.user.isGM = false;
      globalThis.game.users = [{ id: "user1", active: true, isGM: false }];
      globalThis.game.users.activeGM = { id: "gm", isSelf: false, query: vi.fn() };
      globalThis.canvas.ready = true;

      handlers.combatTurnChange(combat, null, { tokenId: "t1" });
      await Promise.resolve();

      expect(combatant.setFlag).not.toHaveBeenCalled();
    } finally {
      globalThis.Hooks.on = previousOn;
    }
  });

  it("defaults unknown economy types to available", () => {
    const actor = makeActor({ id: "a1" });
    expect(isEconomyAvailable(actor, "legendary")).toBe(true);
  });
});
