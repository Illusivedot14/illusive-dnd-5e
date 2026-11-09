import { describe, it, expect, beforeEach, vi } from "vitest";
import { installFoundry } from "./helpers.mjs";
import { emitCombatFx } from "../src/application/combat-fx.mjs";

describe("emitCombatFx", () => {
  beforeEach(() => {
    installFoundry();
    globalThis.Hooks = { callAll: vi.fn() };
  });

  it("fires illusive-dnd-5e.combatFx with a normalized payload", () => {
    const payload = emitCombatFx({
      kind: "mastery",
      subtype: "vex",
      targetUuids: ["Token.1"],
      outcome: { hit: true }
    });
    expect(payload.kind).toBe("mastery");
    expect(payload.subtype).toBe("vex");
    expect(Hooks.callAll).toHaveBeenCalledWith(
      "illusive-dnd-5e.combatFx",
      expect.objectContaining({ kind: "mastery", subtype: "vex" })
    );
  });
});
