import { describe, it, expect, beforeEach, vi } from "vitest";
import { installFoundry } from "./helpers.mjs";
import { postGmResolutionChat } from "../src/foundry/gm-resolution-chat.mjs";
import { createActionResolution } from "../src/domain/combat/action-state.mjs";
import { createRuleContext } from "../src/domain/rule-context.mjs";

describe("postGmResolutionChat", () => {
  beforeEach(() => {
    const handles = installFoundry({ isGM: true });
    handles.setSetting("gmResolutionChat", true);
    game.users = [{ id: "gm1", isGM: true }, { id: "p1", isGM: false }];
    globalThis.ChatMessage = {
      create: vi.fn(async (data) => data)
    };
  });

  it("does nothing when the setting is off", async () => {
    game.settings._store.set("gmResolutionChat", false);
    const resolution = createActionResolution({
      id: "r0",
      phase: "completed",
      rulesContext: createRuleContext(),
      trace: [{ type: "phase", detail: "Sword finished" }]
    });
    expect(await postGmResolutionChat(resolution)).toBeNull();
    expect(ChatMessage.create).not.toHaveBeenCalled();
  });

  it("whispers a completed resolution to GMs only", async () => {
    const resolution = createActionResolution({
      id: "r1",
      phase: "completed",
      rulesContext: createRuleContext({ edition: "2014" }),
      trace: [
        { type: "phase", rule: "combat.activity-use", detail: "Club finished · 1 hit" }
      ],
      rolls: [{ kind: "attack", total: 18 }, { kind: "damage", total: 5 }]
    });

    const msg = await postGmResolutionChat(resolution);
    expect(ChatMessage.create).toHaveBeenCalledOnce();
    expect(msg.whisper).toEqual(["gm1"]);
    expect(msg.content).toContain("Club finished");
    expect(msg.content).toContain("completed");
  });

  it("skips non-terminal phases", async () => {
    const resolution = createActionResolution({ id: "r2", phase: "awaiting-attack" });
    expect(await postGmResolutionChat(resolution)).toBeNull();
    expect(ChatMessage.create).not.toHaveBeenCalled();
  });
});
