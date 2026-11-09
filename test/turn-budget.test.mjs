import { describe, it, expect } from "vitest";
import {
  freshBudget,
  costOf,
  checkUse,
  spendUse,
  refundUse,
  toggleResource,
  basicAction
} from "../src/domain/combat/turn-budget.mjs";

describe("turn-budget domain", () => {
  it("freshBudget starts with one of each resource", () => {
    expect(freshBudget()).toMatchObject({
      action: 1,
      bonus: 1,
      reaction: 1,
      attacks: { granted: 0, used: 0 },
      dashed: false
    });
  });

  it("costOf maps activation types", () => {
    expect(costOf("action")).toBe("action");
    expect(costOf("bonus")).toBe("bonus");
    expect(costOf("reaction")).toBe("reaction");
    expect(costOf("legendary")).toBe(null);
  });

  it("checkUse reports spent resources softly", () => {
    const budget = { ...freshBudget(), action: 0 };
    expect(checkUse(budget, { cost: "action" }, { isOwnTurn: true })).toEqual(["noAction"]);
    expect(checkUse(budget, { cost: "bonus" }, { isOwnTurn: true })).toEqual([]);
    expect(checkUse(budget, { cost: "action" }, { isOwnTurn: false })).toEqual([
      "notYourTurn",
      "noAction"
    ]);
  });

  it("spendUse debits and opens attack grants", () => {
    const before = freshBudget();
    const after = spendUse(before, { cost: "action", weaponAttack: true }, { attacksPerAction: 2 });
    expect(after.action).toBe(0);
    expect(after.attacks).toEqual({ granted: 2, used: 1 });
    const second = spendUse(after, { cost: "action", weaponAttack: true });
    expect(second.action).toBe(0);
    expect(second.attacks.used).toBe(2);
  });

  it("refundUse restores the spend delta", () => {
    const before = freshBudget();
    const after = spendUse(before, { cost: "bonus" });
    const current = { ...after, reaction: 0 };
    const refunded = refundUse(current, before, after);
    expect(refunded.bonus).toBe(1);
    expect(refunded.reaction).toBe(0);
  });

  it("toggleResource and basicAction flip diamonds / flags", () => {
    const spent = toggleResource(freshBudget(), "action");
    expect(spent.action).toBe(0);
    expect(toggleResource(spent, "action").action).toBe(1);
    expect(basicAction(freshBudget(), "dash")).toMatchObject({ action: 0, dashed: true });
    expect(basicAction(freshBudget(), "disengage")).toMatchObject({ action: 0, disengaged: true });
  });
});
