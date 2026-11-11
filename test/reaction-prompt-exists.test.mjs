import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { installFoundry, resetFoundry, makeActor, makeToken } from "./helpers.mjs";
import { startReactionPrompt, _resetReactionPromptQueue, clearReactionContext } from "../src/application/reaction-context.mjs";
import { bindReactionRelay } from "../src/application/reactions/window.mjs";
import { deliverReaction } from "../src/foundry/reaction-socket.mjs";
import { bindOwnerRolls } from "../src/application/dice.mjs";
import { initI18n } from "../src/i18n/index.mjs";
import { promptOpportunityReactions, stashPendingMove, getPendingMove } from "../src/application/opportunity-attack.mjs";
import { bindAutomationHooks } from "../src/foundry/hooks.mjs";

function armDialog() {
  const wait = vi.fn(async () => "pass");
  globalThis.foundry.applications.api.DialogV2.wait = wait;
  return wait;
}

function meleeWeapon(id = "sword") {
  const activity = {
    id: "atk",
    type: "attack",
    attack: { type: { value: "melee" } },
    range: { value: 5, units: "ft" }
  };
  return {
    id,
    name: "Scimitar",
    type: "weapon",
    system: {
      type: { value: "martialM" },
      activities: {
        get: (key) => (key === "atk" ? activity : null),
        values: () => [activity],
        [Symbol.iterator]: function* iterate() { yield activity; }
      }
    }
  };
}

function legacyMwk(id = "club") {
  return {
    id,
    name: "Club",
    type: "weapon",
    system: { actionType: "mwak", type: { value: "simpleM" }, range: { value: 5, units: "ft" } }
  };
}

describe("reaction prompts exist", () => {
  beforeEach(async () => {
    installFoundry();
    _resetReactionPromptQueue();
    clearReactionContext();
    globalThis.CONFIG.queries = {};
    await initI18n();
  });
  afterEach(() => {
    resetFoundry();
    delete globalThis.fromUuidSync;
  });

  it("opens a dialog with Pass when this client is asked for a reaction", async () => {
    const wait = armDialog();
    const shield = { id: "shield-act", item: { id: "shield", name: "Shield" } };
    const actor = makeActor({ id: "wizard", name: "Mirena" });
    startReactionPrompt(actor, [shield], "on-damage-known", { actorUuid: actor.uuid });
    await vi.waitFor(() => expect(wait).toHaveBeenCalledOnce());
    const dialog = wait.mock.calls[0][0];
    expect(dialog.content).toContain("Shield");
    expect(dialog.content).toContain('type="checkbox"');
    expect(dialog.buttons.map((button) => button.action)).toEqual(["pass", "confirm"]);
    expect(dialog.content).toContain("Mirena");
  });

  it("opens that same dialog on the client that receives a relayed prompt", async () => {
    const wait = armDialog();
    const activity = { id: "shield-act", type: "utility" };
    const shield = {
      id: "shield",
      name: "Shield",
      system: { activities: { get: (id) => (id === "shield-act" ? activity : null) } }
    };
    activity.item = shield;
    const actor = makeActor({ id: "wizard", name: "Mirena", items: [shield] });
    actor.uuid = "Actor.wizard";
    actor.items.get = (id) => (id === "shield" ? shield : null);
    globalThis.fromUuidSync = (uuid) => (uuid === "Actor.wizard" ? actor : null);
    bindReactionRelay();
    deliverReaction("prompt", {
      actorUuid: "Actor.wizard",
      windowId: "on-damage-known",
      fromUserId: "gm",
      refs: [{ itemId: "shield", activityId: "shield-act" }],
      options: { actorUuid: "Actor.wizard" }
    });
    await vi.waitFor(() => expect(wait).toHaveBeenCalledOnce());
    expect(wait.mock.calls[0][0].content).toContain("Mirena");
    expect(wait.mock.calls[0][0].buttons.map((button) => button.action)).toContain("pass");
  });

  it("opens the owner's dialog when the relayed activity item is a read-only getter", async () => {
    const wait = armDialog();
    const weapon = { id: "sword", name: "Longsword", type: "weapon" };
    const activity = { id: "atk", name: "Attack", type: "attack", parent: { parent: weapon } };
    Object.defineProperty(activity, "item", { get: () => weapon });
    weapon.system = { activities: { get: (id) => (id === "atk" ? activity : null) } };
    const actor = makeActor({ id: "bucky", name: "Buckamillion (Bucky)", items: [weapon] });
    actor.uuid = "Actor.bucky";
    actor.items.get = (id) => (id === "sword" ? weapon : null);
    globalThis.fromUuidSync = (uuid) => {
      if (uuid === "Actor.bucky") return actor;
      if (uuid === "Token.dragon") return { name: "Adult Red Dragon" };
      return null;
    };
    bindReactionRelay();
    expect(() => deliverReaction("prompt", {
      actorUuid: "Actor.bucky",
      windowId: "opportunityAttack",
      fromUserId: "gm",
      refs: [{ itemId: "sword", activityId: "atk" }],
      options: {
        actorUuid: "Actor.bucky",
        pendingMoveTokenId: "dragon",
        opportunityAttack: true,
        moverUuid: "Token.dragon"
      }
    })).not.toThrow();
    await vi.waitFor(() => expect(wait).toHaveBeenCalledOnce());
    expect(wait.mock.calls[0][0].window.title).toBe("Opportunity attack");
    expect(wait.mock.calls[0][0].buttons.map((button) => button.action)).toEqual(["pass", "confirm"]);
    expect(wait.mock.calls[0][0].content).toContain('type="checkbox"');
    expect(wait.mock.calls[0][0].content).toContain("Buckamillion (Bucky)");
    expect(wait.mock.calls[0][0].content).toContain("Adult Red Dragon");
    expect(wait.mock.calls[0][0].content).toContain("Longsword");
  });

  it("opens an Attack / Pass dialog on the GM for a monster opportunity attack", async () => {
    const wait = vi.fn(async () => false);
    globalThis.foundry.applications.api.DialogV2.wait = wait;
    globalThis.game.user.isGM = true;
    globalThis.game.users = [];
    const goblin = makeActor({ id: "gob", name: "Goblin", items: [meleeWeapon()] });
    goblin.uuid = "Actor.gob";
    goblin.isOwner = true;
    goblin.testUserPermission = () => false;
    const mover = makeToken({ id: "hero", name: "Balrus", actor: makeActor({ id: "hero", name: "Balrus" }) });
    mover.document.id = "hero";
    mover.document.uuid = "Token.hero";
    await promptOpportunityReactions({
      candidates: [{ observerUuid: "Token.gob", rule: "oa" }],
      observers: [{ uuid: "Token.gob", token: { name: "Goblin", actor: goblin, document: { uuid: "Token.gob" } } }],
      token: mover
    });
    expect(wait).toHaveBeenCalledOnce();
    expect(wait.mock.calls[0][0].buttons.map((button) => button.action)).toEqual(["pass", "confirm"]);
    expect(wait.mock.calls[0][0].content).toContain('type="checkbox"');
    expect(wait.mock.calls[0][0].content).toContain("Scimitar");
    expect(wait.mock.calls[0][0].content).toContain("Goblin");
    expect(wait.mock.calls[0][0].content).toContain("Balrus");
  });

  it("lists every reactor in the same window", async () => {
    const wait = vi.fn(async () => ["0:0", "1:0"]);
    globalThis.foundry.applications.api.DialogV2.wait = wait;
    globalThis.game.user.isGM = true;
    globalThis.game.users = [];
    const vesper = makeActor({ id: "vesper", name: "Vesper", items: [meleeWeapon("sword")] });
    vesper.uuid = "Actor.vesper";
    const bucky = makeActor({ id: "bucky", name: "Bucky", items: [meleeWeapon("club")] });
    bucky.uuid = "Actor.bucky";
    bucky.items[0].name = "Club";
    const mover = makeToken({ id: "dragon", name: "Adult Red Dragon", actor: makeActor({ id: "dragon", name: "Adult Red Dragon" }) });
    mover.document.id = "dragon";
    mover.document.uuid = "Token.dragon";

    await promptOpportunityReactions({
      candidates: [
        { observerUuid: "Token.vesper", rule: "oa" },
        { observerUuid: "Token.bucky", rule: "oa" }
      ],
      observers: [
        { uuid: "Token.vesper", token: { name: "Vesper", actor: vesper, document: { uuid: "Token.vesper" } } },
        { uuid: "Token.bucky", token: { name: "Bucky", actor: bucky, document: { uuid: "Token.bucky" } } }
      ],
      token: mover
    });

    expect(wait).toHaveBeenCalledOnce();
    const content = wait.mock.calls[0][0].content;
    expect(content).toContain("Vesper");
    expect(content).toContain("Bucky");
    expect(content).toContain('value="0:0"');
    expect(content).toContain('value="1:0"');
    expect(wait.mock.calls[0][0].buttons.map((button) => button.label)).toEqual(["All pass", "Confirm"]);
    expect(wait.mock.calls[0][0].position.width).toBe(480);
  });

  it("Confirm uses the boxes that are checked", async () => {
    const wait = vi.fn(async (dialog) => {
      const boxes = [
        { checked: true, value: "0:0" },
        { checked: true, value: "1:0" }
      ];
      const root = { querySelectorAll: (selector) => selector.includes("checkbox") ? boxes : [] };
      const confirm = dialog.buttons.find((button) => button.action === "confirm");
      return confirm.callback(null, { form: null }, { element: root });
    });
    globalThis.foundry.applications.api.DialogV2.wait = wait;
    globalThis.game.user.isGM = true;
    globalThis.game.users = [];
    const sword = meleeWeapon("sword");
    const club = meleeWeapon("club");
    club.name = "Club";
    const lookedUp = [];
    for (const item of [sword, club]) {
      const get = item.system.activities.get;
      item.system.activities.get = (id) => {
        lookedUp.push(`${item.id}:${id}`);
        return get(id);
      };
    }
    const vesper = makeActor({ id: "vesper", name: "Vesper", items: [sword] });
    vesper.uuid = "Actor.vesper";
    vesper.items.get = (id) => (id === "sword" ? sword : null);
    const bucky = makeActor({ id: "bucky", name: "Bucky", items: [club] });
    bucky.uuid = "Actor.bucky";
    bucky.items.get = (id) => (id === "club" ? club : null);
    globalThis.fromUuid = async (uuid) => (uuid === "Actor.vesper" ? vesper : uuid === "Actor.bucky" ? bucky : null);
    canvas.tokens.placeables = [
      makeToken({ id: "vesper", name: "Vesper", actor: vesper }),
      makeToken({ id: "bucky", name: "Bucky", actor: bucky })
    ];
    const mover = makeToken({ id: "dragon", name: "Adult Red Dragon", actor: makeActor({ id: "dragon", name: "Adult Red Dragon" }) });
    mover.document.uuid = "Token.dragon";

    await promptOpportunityReactions({
      candidates: [
        { observerUuid: "Token.vesper", rule: "oa" },
        { observerUuid: "Token.bucky", rule: "oa" }
      ],
      observers: [
        { uuid: "Token.vesper", token: { name: "Vesper", actor: vesper, document: { uuid: "Token.vesper" } } },
        { uuid: "Token.bucky", token: { name: "Bucky", actor: bucky, document: { uuid: "Token.bucky" } } }
      ],
      token: mover
    });

    expect(lookedUp).toEqual(["sword:atk", "club:atk"]);
  });

  it("linked tokens of one actor are a single choice", async () => {
    const wait = armDialog();
    globalThis.game.user.isGM = true;
    globalThis.game.users = [];
    const actor = makeActor({ id: "treant", name: "Treant", items: [meleeWeapon("slam")] });
    actor.uuid = "Actor.treant";
    const mover = makeToken({ id: "hero", name: "Vesper", actor: makeActor({ id: "hero", name: "Vesper" }) });
    mover.document.uuid = "Token.hero";

    await promptOpportunityReactions({
      candidates: [
        { observerUuid: "Token.t1", rule: "oa" },
        { observerUuid: "Token.t2", rule: "oa" }
      ],
      observers: [
        { uuid: "Token.t1", token: { name: "Treant", actor, document: { uuid: "Token.t1", actorLink: true } } },
        { uuid: "Token.t2", token: { name: "Treant", actor, document: { uuid: "Token.t2", actorLink: true } } }
      ],
      token: mover
    });

    const content = wait.mock.calls[0][0].content;
    expect(content.match(/Treant/g)).toHaveLength(1);
    expect(content.match(/data-actor="/g)).toHaveLength(1);
  });

  it("unlinked copies of the same actor stay separate choices", async () => {
    const wait = armDialog();
    globalThis.game.user.isGM = true;
    globalThis.game.users = [];
    function copy(uuid) {
      const actor = makeActor({ id: "treant", name: "Treant", items: [meleeWeapon("slam")] });
      actor.uuid = uuid;
      return actor;
    }
    const left = copy("Actor.treant.Token.t1");
    const right = copy("Actor.treant.Token.t2");
    const mover = makeToken({ id: "hero", name: "Vesper", actor: makeActor({ id: "hero", name: "Vesper" }) });
    mover.document.uuid = "Token.hero";

    await promptOpportunityReactions({
      candidates: [
        { observerUuid: "Token.t1", rule: "oa" },
        { observerUuid: "Token.t2", rule: "oa" }
      ],
      observers: [
        { uuid: "Token.t1", token: { name: "Treant", actor: left, document: { uuid: "Token.t1", actorLink: false } } },
        { uuid: "Token.t2", token: { name: "Treant", actor: right, document: { uuid: "Token.t2", actorLink: false } } }
      ],
      token: mover
    });

    const content = wait.mock.calls[0][0].content;
    expect(content).toContain('data-actor="Token.t1"');
    expect(content).toContain('data-actor="Token.t2"');
    expect(content.match(/<h4/g)).toHaveLength(2);
  });

  it("opens the GM dialog when the melee activity's item is a read-only getter", async () => {
    const wait = vi.fn(async () => false);
    globalThis.foundry.applications.api.DialogV2.wait = wait;
    globalThis.game.user.isGM = true;
    globalThis.game.users = [];
    const weapon = {
      id: "sword",
      name: "Scimitar",
      type: "weapon",
      system: { type: { value: "martialM" } }
    };
    const activity = {
      id: "atk",
      type: "attack",
      attack: { type: { value: "melee" } },
      range: { value: 5, units: "ft" },
      parent: { parent: weapon }
    };
    Object.defineProperty(activity, "item", { get: () => weapon });
    weapon.system.activities = {
      get: (key) => (key === "atk" ? activity : null),
      contents: [activity],
      values: () => [activity],
      [Symbol.iterator]: function* iterate() { yield activity; }
    };
    const goblin = makeActor({ id: "gob", name: "Goblin", items: [weapon] });
    goblin.uuid = "Actor.gob";
    goblin.isOwner = true;
    goblin.testUserPermission = () => false;
    const mover = makeToken({ id: "hero", name: "Buckamillion (Bucky)", actor: makeActor({ id: "hero", name: "Buckamillion (Bucky)" }) });
    mover.document.id = "hero";
    mover.document.uuid = "Token.hero";
    await promptOpportunityReactions({
      candidates: [{ observerUuid: "Token.gob", rule: "oa" }],
      observers: [{ uuid: "Token.gob", token: { name: "Goblin", actor: goblin, document: { uuid: "Token.gob" } } }],
      token: mover
    });
    expect(wait).toHaveBeenCalledOnce();
    expect(wait.mock.calls[0][0].buttons.map((button) => button.action)).toEqual(["pass", "confirm"]);
    expect(wait.mock.calls[0][0].content).toContain("Scimitar");
  });

  it("lists every eligible melee attack and swings the one that was chosen", async () => {
    const wait = vi.fn(async () => ["0:1"]);
    globalThis.foundry.applications.api.DialogV2.wait = wait;
    globalThis.game.user.isGM = true;
    globalThis.game.users = [];
    function natural(id, name) {
      const activity = {
        id: `${id}-atk`,
        name,
        type: "attack",
        attack: { type: { value: "melee" } }
      };
      const weapon = {
        id,
        name,
        type: "weapon",
        system: {
          type: { value: "natural" },
          activities: {
            get: (key) => (key === activity.id ? activity : null),
            contents: [activity]
          }
        }
      };
      activity.item = weapon;
      return weapon;
    }
    const bite = natural("bite", "Bite");
    const claw = natural("claw", "Claw");
    const dragon = makeActor({ id: "dragon", name: "Adult Red Dragon", items: [bite, claw] });
    dragon.uuid = "Actor.dragon";
    dragon.isOwner = true;
    dragon.testUserPermission = () => false;
    dragon.items.get = (id) => (id === "bite" ? bite : id === "claw" ? claw : null);
    const lookedUp = [];
    for (const weapon of [bite, claw]) {
      const get = weapon.system.activities.get;
      weapon.system.activities.get = (id) => {
        lookedUp.push(id);
        return get(id);
      };
    }
    const reactor = makeToken({ id: "dragon", name: "Adult Red Dragon", actor: dragon });
    canvas.tokens.placeables = [reactor];
    globalThis.fromUuid = async (uuid) => (uuid === "Actor.dragon" ? dragon : null);
    const mover = makeToken({ id: "hero", name: "Buckamillion (Bucky)", actor: makeActor({ id: "hero", name: "Buckamillion (Bucky)" }) });
    mover.document.id = "hero";
    mover.document.uuid = "Token.hero";

    await promptOpportunityReactions({
      candidates: [{ observerUuid: "Token.dragon", rule: "oa" }],
      observers: [{ uuid: "Token.dragon", token: reactor }],
      token: mover
    });

    expect(wait.mock.calls[0][0].content).toContain("Bite");
    expect(wait.mock.calls[0][0].content).toContain("Claw");
    expect(wait.mock.calls[0][0].buttons.map((button) => button.action)).toEqual(["pass", "confirm"]);
    expect(lookedUp).toContain("claw-atk");
    expect(lookedUp).not.toContain("bite-atk");
  });

  it("the owning player is prompted even when the GM is the one who moved", async () => {
    const wait = vi.fn(async () => "pass");
    globalThis.foundry.applications.api.DialogV2.wait = wait;
    globalThis.game.user.isGM = true;
    globalThis.game.user.id = "gm";
    const vesper = makeActor({ id: "vesper", name: "Vesper", isOwner: true, items: [meleeWeapon()] });
    vesper.uuid = "Actor.vesper";
    vesper.testUserPermission = () => false;
    const query = vi.fn(async (name, data) => {
      expect(name).toBe("illusive-dnd-5e.opportunityAttack");
      expect(data.groups.map((group) => group.actorName)).toEqual(["Vesper"]);
      expect(data.groups[0].refs.map((ref) => ref.label)).toContain("Scimitar");
      return { used: false };
    });
    const player = { id: "vesper-user", active: true, isGM: false, character: vesper, query };
    globalThis.game.users = [player, { id: "gm", active: true, isGM: true, isSelf: true }];
    const mover = makeToken({ id: "dragon", name: "Adult Red Dragon", actor: makeActor({ id: "dragon", name: "Adult Red Dragon" }) });
    mover.document.id = "dragon";
    mover.document.uuid = "Token.dragon";

    await promptOpportunityReactions({
      candidates: [{ observerUuid: "Token.vesper", rule: "oa" }],
      observers: [{ uuid: "Token.vesper", token: { name: "Vesper", actor: vesper, document: { uuid: "Token.vesper", actorLink: true } } }],
      token: mover
    });

    expect(query).toHaveBeenCalledOnce();
    expect(wait).not.toHaveBeenCalled();
  });

  it("the owning player's answer releases the move the GM was dragging", async () => {
    const wait = vi.fn(async () => "pass");
    globalThis.foundry.applications.api.DialogV2.wait = wait;
    globalThis.game.user.isGM = true;
    globalThis.game.user.id = "gm";
    const vesper = makeActor({ id: "vesper", name: "Vesper", isOwner: true, items: [meleeWeapon()] });
    vesper.uuid = "Actor.vesper";
    vesper.testUserPermission = () => false;
    const query = vi.fn(async () => ({ used: false }));
    const player = { id: "vesper-user", active: true, isGM: false, character: vesper, query };
    globalThis.game.users = [player, { id: "gm", active: true, isGM: true, isSelf: true }];
    const mover = makeToken({ id: "dragon", name: "Adult Red Dragon", actor: makeActor({ id: "dragon", name: "Adult Red Dragon" }) });
    mover.document.id = "dragon";
    mover.document.uuid = "Token.dragon";
    mover.document.update = vi.fn(async () => {});
    canvas.tokens.get = (id) => (id === "dragon" ? mover : null);
    stashPendingMove(mover.document, { x: 400, y: 0 }, { movement: { id: "drag-1" } });

    await promptOpportunityReactions({
      candidates: [{ observerUuid: "Token.vesper", rule: "oa" }],
      observers: [{ uuid: "Token.vesper", token: { name: "Vesper", actor: vesper, document: { uuid: "Token.vesper", actorLink: true } } }],
      token: mover
    });

    expect(query).toHaveBeenCalledOnce();
    expect(wait).not.toHaveBeenCalled();
    expect(getPendingMove("dragon")).toBe(null);
    expect(mover.document.update).toHaveBeenCalledWith(
      { x: 400, y: 0 },
      { illusiveSkipOA: true, illusiveApplyPending: true }
    );
  });

  it("the player's client asks the GM, and the GM handler is what opens the dialog", async () => {
    const wait = vi.fn(async () => false);
    globalThis.foundry.applications.api.DialogV2.wait = wait;
    bindOwnerRolls();
    const gm = {
      id: "gm",
      active: true,
      isGM: true,
      isSelf: false,
      query: (name, data) => globalThis.CONFIG.queries[name](data)
    };
    globalThis.game.user.isGM = false;
    globalThis.game.user.id = "player2";
    globalThis.game.users = [{ id: "player2", active: true, isGM: false }, gm];
    globalThis.game.users.activeGM = gm;
    const goblin = makeActor({ id: "gob", name: "Goblin", items: [legacyMwk()] });
    goblin.uuid = "Actor.gob";
    goblin.isOwner = false;
    goblin.testUserPermission = () => false;
    const mover = makeToken({ id: "hero", name: "Broccoli", actor: makeActor({ id: "hero", name: "Broccoli" }) });
    mover.document.id = "hero";
    mover.document.uuid = "Token.hero";
    mover.document.update = vi.fn(async () => {});
    canvas.tokens.get = (id) => (id === "hero" ? mover : null);
    stashPendingMove(mover.document, { x: 400, y: 0 }, {});

    await promptOpportunityReactions({
      candidates: [{ observerUuid: "Token.gob", rule: "oa" }],
      observers: [{ uuid: "Token.gob", token: { name: "Goblin", actor: goblin, document: { uuid: "Token.gob" } } }],
      token: mover
    });

    expect(wait).toHaveBeenCalledOnce();
    expect(wait.mock.calls[0][0].content).toContain("Broccoli");
    expect(getPendingMove("hero")).toBe(null);
    expect(mover.document.update).toHaveBeenCalled();
  });

  it("still installs the GM opportunity handler when queries did not exist yet", async () => {
    delete globalThis.CONFIG.queries;
    const wait = vi.fn(async () => false);
    globalThis.foundry.applications.api.DialogV2.wait = wait;
    bindOwnerRolls();
    await globalThis.CONFIG.queries["illusive-dnd-5e.opportunityAttack"]({
      reactorName: "Goblin",
      moverName: "Stumps"
    });
    expect(wait).toHaveBeenCalledOnce();
    expect(wait.mock.calls[0][0].content).toContain("Stumps");
  });

  it("opens the reaction dialog for the player who owns the reactor, and Pass releases the move", async () => {
    const wait = vi.fn(async () => "pass");
    globalThis.foundry.applications.api.DialogV2.wait = wait;
    globalThis.game.user.isGM = false;
    globalThis.game.user.id = "user1";
    globalThis.game.users = [{ id: "user1", active: true, isGM: false }];
    const fighter = makeActor({ id: "fighter", name: "Vesper", isOwner: true, items: [meleeWeapon()] });
    fighter.uuid = "Actor.fighter";
    fighter.testUserPermission = (user) => user?.id === "user1";
    const mover = makeToken({ id: "hero", name: "Balrus", actor: makeActor({ id: "hero", name: "Balrus" }) });
    mover.document.id = "hero";
    mover.document.uuid = "Token.hero";
    mover.document.update = vi.fn(async () => {});
    canvas.tokens.get = (id) => (id === "hero" ? mover : null);
    stashPendingMove(mover.document, { x: 500, y: 0 }, {});

    await promptOpportunityReactions({
      candidates: [{ observerUuid: "Token.fighter", rule: "oa" }],
      observers: [{ uuid: "Token.fighter", token: { name: "Vesper", actor: fighter, document: { uuid: "Token.fighter" } } }],
      token: mover
    });

    await vi.waitFor(() => expect(wait).toHaveBeenCalledOnce());
    expect(wait.mock.calls[0][0].buttons.map((button) => button.action)).toEqual(["pass", "confirm"]);
    expect(wait.mock.calls[0][0].content).toContain("Vesper");
    await vi.waitFor(() => expect(getPendingMove("hero")).toBe(null));
    expect(mover.document.update).toHaveBeenCalled();
  });

  it("choosing a melee weapon that has no activity still closes the prompt and releases the move", async () => {
    const club = legacyMwk();
    const wait = vi.fn(async () => ["0:0"]);
    globalThis.foundry.applications.api.DialogV2.wait = wait;
    globalThis.game.user.isGM = false;
    globalThis.game.user.id = "user1";
    globalThis.game.users = [{ id: "user1", active: true, isGM: false }];
    const fighter = makeActor({ id: "fighter", name: "Vesper", isOwner: true, items: [club] });
    fighter.uuid = "Actor.fighter";
    fighter.testUserPermission = (user) => user?.id === "user1";
    const reactor = makeToken({ id: "vesper", name: "Vesper", actor: fighter });
    reactor.document.uuid = "Token.fighter";
    const mover = makeToken({ id: "hero", name: "Balrus", actor: makeActor({ id: "hero", name: "Balrus" }) });
    mover.document.id = "hero";
    mover.document.uuid = "Token.hero";
    mover.document.update = vi.fn(async () => {});
    canvas.tokens.placeables = [reactor, mover];
    canvas.tokens.get = (id) => (id === "hero" ? mover : null);
    stashPendingMove(mover.document, { x: 500, y: 0 }, {});

    await promptOpportunityReactions({
      candidates: [{ observerUuid: "Token.fighter", rule: "oa" }],
      observers: [{ uuid: "Token.fighter", token: reactor }],
      token: mover
    });

    await vi.waitFor(() => expect(wait).toHaveBeenCalledOnce());
    expect(wait.mock.calls[0][0].content).toContain("Club");
    expect(wait.mock.calls[0][0].buttons.map((button) => button.action)).toEqual(["pass", "confirm"]);
    await vi.waitFor(() => expect(getPendingMove("hero")).toBe(null));
    expect(mover.document.update).toHaveBeenCalled();
  });

  it("releases a held move when the hostile creature has no melee attack, and does not pretend a prompt opened", async () => {
    const wait = armDialog();
    globalThis.game.user.isGM = true;
    const bow = {
      id: "bow",
      name: "Shortbow",
      type: "weapon",
      system: { actionType: "rwak", type: { value: "simpleR" } }
    };
    const goblin = makeActor({ id: "gob", name: "Goblin", items: [bow] });
    goblin.uuid = "Actor.gob";
    goblin.isOwner = true;
    goblin.testUserPermission = () => false;
    const mover = makeToken({ id: "hero", name: "Balrus", actor: makeActor({ id: "hero", name: "Balrus" }) });
    mover.document.id = "hero";
    mover.document.uuid = "Token.hero";
    mover.document.update = vi.fn(async () => {});
    canvas.tokens.get = (id) => (id === "hero" ? mover : null);
    stashPendingMove(mover.document, { x: 500, y: 0 }, {});

    await promptOpportunityReactions({
      candidates: [{ observerUuid: "Token.gob", rule: "oa" }],
      observers: [{ uuid: "Token.gob", token: { name: "Goblin", actor: goblin, document: { uuid: "Token.gob" } } }],
      token: mover
    });

    expect(wait).not.toHaveBeenCalled();
    expect(getPendingMove("hero")).toBe(null);
    expect(mover.document.update).toHaveBeenCalled();
  });

  it("the leave-reach token hook is what opens the GM dialog", async () => {
    const previousOn = globalThis.Hooks.on;
    const previousOnce = globalThis.Hooks.once;
    const listeners = [];
    globalThis.Hooks.on = (hook, fn) => {
      if (hook === "preUpdateToken") listeners.push(fn);
    };
    globalThis.Hooks.once = () => {};
    try {
      bindAutomationHooks();
      const wait = vi.fn(async () => false);
      globalThis.foundry.applications.api.DialogV2.wait = wait;
      bindOwnerRolls();
      const gm = {
        id: "gm",
        active: true,
        isGM: true,
        isSelf: false,
        query: (name, data) => globalThis.CONFIG.queries[name](data)
      };
      globalThis.game.user.isGM = false;
      globalThis.game.user.id = "player2";
      globalThis.game.users = [{ id: "player2", active: true, isGM: false }, gm];
      globalThis.game.users.activeGM = gm;

      const goblin = makeActor({ id: "gob", name: "Goblin", items: [meleeWeapon()] });
      goblin.uuid = "Actor.gob";
      goblin.isOwner = false;
      goblin.testUserPermission = () => false;
      const heroActor = makeActor({ id: "hero", name: "Broccoli" });
      const hero = makeToken({ id: "hero", name: "Broccoli", actor: heroActor });
      Object.assign(hero.document, {
        id: "hero",
        uuid: "Scene.scene1.Token.hero",
        x: 100,
        y: 0,
        width: 1,
        height: 1,
        disposition: 1,
        actor: heroActor,
        object: hero
      });
      const gob = makeToken({ id: "gob", name: "Goblin", actor: goblin });
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
      canvas.tokens.placeables = [hero, gob];
      canvas.tokens.get = (id) => ({ hero, gob }[id] ?? null);
      canvas.scene = { id: "scene1", grid: { size: 100, distance: 5 } };

      let blocked = false;
      for (const fn of listeners) {
        const result = fn(hero.document, { x: 400, y: 0 }, {});
        if (result === false) blocked = true;
      }
      expect(blocked).toBe(false);
      expect(wait).not.toHaveBeenCalled();

      globalThis.game.combat = { started: true, combatants: [] };
      blocked = false;
      for (const fn of listeners) {
        const result = fn(hero.document, { x: 400, y: 0 }, {});
        if (result === false) {
          blocked = true;
          break;
        }
      }
      expect(blocked).toBe(true);
      await vi.waitFor(() => expect(wait).toHaveBeenCalledOnce());
      expect(wait.mock.calls[0][0].content).toContain("Goblin");
      expect(wait.mock.calls[0][0].content).toContain("Broccoli");
      expect(wait.mock.calls[0][0].content).toContain("Scimitar");
      expect(wait.mock.calls[0][0].buttons.map((button) => button.action)).toEqual(["pass", "confirm"]);
    } finally {
      globalThis.Hooks.on = previousOn;
      globalThis.Hooks.once = previousOnce;
    }
  });
});
