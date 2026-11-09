import { describe, it, expect, beforeEach } from "vitest";
import { MODULE_ID, installFoundry, makeActor, makeCombatant, makeCombat, makeToken } from "./helpers.mjs";
import {
  getEconomyActions,
  isEconomyAvailable,
  getEconomyAvailability,
  markEconomyUsed,
  readBudget,
  freshBudget
} from "../src/application/economy.mjs";

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

  it("defaults unknown economy types to available", () => {
    const actor = makeActor({ id: "a1" });
    expect(isEconomyAvailable(actor, "legendary")).toBe(true);
  });
});
