import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { installFoundry, makeActor, makeToken, resetFoundry } from "./helpers.mjs";
import {
  buildReactionKeys,
  clearReactionContext,
  clearReactionPrompt,
  clearReactionPromptFor,
  dismissReactionPromptsFor,
  listQueuedReactionPrompts,
  _resetReactionPromptQueue,
  getActionBarToken,
  getReactionContext,
  passReaction,
  startReactionPrompt,
  useReactionFromHud
} from "../src/application/reaction-context.mjs";

describe("reaction-context", () => {
  beforeEach(() => {
    installFoundry();
    _resetReactionPromptQueue();
    clearReactionContext();
    delete globalThis.foundry.applications.api.DialogV2.wait;
  });
  afterEach(() => resetFoundry());

  it("builds stable reaction keys from activities", () => {
    const keys = buildReactionKeys([
      { id: "a1", item: { id: "i1" } },
      { id: "a2", parent: { id: "i2" } }
    ]);
    expect(keys).toEqual(new Set(["i1:a1", "i2:a2"]));
  });

  it("uses the reacting actor token for the action bar during a prompt", () => {
    const wizard = makeActor({ id: "wizard", isOwner: true });
    const fighter = makeActor({ id: "fighter", isOwner: true });
    const wizardToken = makeToken({ id: "tw", actor: wizard });
    const fighterToken = makeToken({ id: "fw", actor: fighter, controlled: true });

    globalThis.canvas = {
      tokens: {
        controlled: [fighterToken],
        placeables: [wizardToken, fighterToken]
      }
    };

    startReactionPrompt(wizard, [{ id: "a1", item: { id: "i1" } }], "reactionpreattack", {
      workflow: { tokenUuid: "Scene.1.Token.attacker" }
    });

    expect(getActionBarToken()).toBe(wizardToken);
    expect(getReactionContext()?.triggerTokenUuid).toBe("Scene.1.Token.attacker");
  });

  it("announces a shown reaction so the deciding client can open it", () => {
    const actor = makeActor({ id: "goblin", name: "Goblin", isOwner: true });
    startReactionPrompt(actor, [{ id: "a1", item: { id: "i1" } }], "opportunityAttack", {
      pendingMoveTokenId: "mover"
    });
    expect(globalThis.Hooks.callAll).toHaveBeenCalledWith(
      "illusive-dnd-5e.reactionPrompt",
      expect.objectContaining({ actor, triggerType: "opportunityAttack" })
    );
  });

  it("clears the prompt when the player passes", () => {
    const actor = makeActor({ id: "wizard", isOwner: true });
    startReactionPrompt(actor, [{ id: "a1", item: { id: "i1" } }], "reaction", { windowId: "after-damage-applied" });

    passReaction();

    expect(getReactionContext()).toBeNull();
  });

  it("ignores HUD use from an actor that is not being prompted", async () => {
    const actor = makeActor({ id: "wizard", isOwner: true });
    const other = makeActor({ id: "fighter", isOwner: true });
    startReactionPrompt(actor, [{ id: "a1", item: { id: "i1" } }], "reaction", {});

    expect(await useReactionFromHud(makeToken({ id: "tf", actor: other }), "i1", "a1")).toBe(false);
    expect(getReactionContext()).not.toBeNull();
  });

  it("clears reaction state on clearReactionPrompt", () => {
    const actor = makeActor({ id: "wizard", isOwner: true });
    startReactionPrompt(actor, [{ id: "a1", item: { id: "i1" } }], "reaction", {});
    clearReactionPrompt();
    expect(getReactionContext()).toBeNull();
  });

  it("queues a second prompt instead of overwriting the one on screen", () => {
    const wizard = makeActor({ id: "wizard", isOwner: true });
    const fighter = makeActor({ id: "fighter", isOwner: true });
    startReactionPrompt(wizard, [{ id: "a1", item: { id: "i1" } }], "after-damage-applied", { parentId: "r1" });
    startReactionPrompt(fighter, [{ id: "a2", item: { id: "i2" } }], "on-attack-miss", { parentId: "r2" });

    expect(getReactionContext()?.actorId).toBe("wizard");
    expect(listQueuedReactionPrompts()).toHaveLength(1);

    clearReactionPrompt();
    expect(getReactionContext()?.actorId).toBe("fighter");
    expect(listQueuedReactionPrompts()).toHaveLength(0);
  });

  it("lets a hard prompt jump ahead of a soft one and re-queues the soft one", () => {
    const wizard = makeActor({ id: "wizard", isOwner: true });
    const fighter = makeActor({ id: "fighter", isOwner: true });
    startReactionPrompt(wizard, [{ id: "a1", item: { id: "i1" } }], "after-damage-applied", { parentId: "r1" });
    startReactionPrompt(fighter, [{ id: "a2", item: { id: "i2" } }], "on-attack-hit", {
      hardWindow: true,
      parentId: "r2",
      actorUuid: fighter.uuid
    });

    expect(getReactionContext()?.actorId).toBe("fighter");
    clearReactionPromptFor("r2", fighter.uuid);
    expect(getReactionContext()?.actorId).toBe("wizard");
  });

  it("dismisses prompts caused by undone resolutions", () => {
    const wizard = makeActor({ id: "wizard", isOwner: true });
    const fighter = makeActor({ id: "fighter", isOwner: true });
    startReactionPrompt(wizard, [{ id: "a1", item: { id: "i1" } }], "after-damage-applied", { parentId: "undone" });
    startReactionPrompt(fighter, [{ id: "a2", item: { id: "i2" } }], "on-attack-miss", { parentId: "undone" });

    dismissReactionPromptsFor(["undone"]);
    expect(getReactionContext()).toBeNull();
    expect(listQueuedReactionPrompts()).toHaveLength(0);
  });
});
