/**
 * Runtime Foundry harness for unit tests.
 *
 * `installFoundry()` wires up `game`, `canvas`, `ui`, `CONFIG` with sensible
 * defaults plus a live settings store, and returns handles for tweaking state.
 * The `make*` factories build the minimal document-like shapes the module reads.
 */
import { vi } from "vitest";

export const MODULE_ID = "illusive-dnd-5e";

/** An array that also answers `.get(id)` like a Foundry Collection. */
export function makeCollection(items = []) {
  const arr = [...items];
  arr.get = (id) => arr.find((entry) => entry?.id === id) ?? null;
  arr.has = (id) => arr.some((entry) => entry?.id === id);
  arr.contents = arr;
  return arr;
}

export function makeSettingsApi(initial = {}, registered = {}) {
  const store = new Map(Object.entries(initial));
  const registry = new Map(
    Object.entries(registered).map(([key, def]) => [`${MODULE_ID}.${key}`, def])
  );
  return {
    _store: store,
    settings: registry,
    get: (_ns, key) => store.get(key),
    set: vi.fn(async (_ns, key, value) => {
      store.set(key, value);
      return value;
    }),
    register: vi.fn(),
    registerMenu: vi.fn()
  };
}

/**
 * Install global Foundry stubs for a single test.
 * @returns handles: { game, canvas, ui, settings, setSetting, setTargets }
 */
export function installFoundry({
  settings = {},
  registeredSettings = {},
  isGM = false,
  combat = null,
  combats = null,
  sceneCombats = null,
  tokens = [],
  actors = [],
  scene = { id: "scene1" },
  targets = [],
  i18n = { lang: "en", localize: (k) => k, format: (k) => k, translations: {} }
} = {}) {
  const settingsApi = makeSettingsApi(settings, registeredSettings);
  const tokenCol = makeCollection(tokens);
  const actorCol = makeCollection(actors);
  const targetSet = new Set(targets);

  const combatsCol = makeCollection(combats ?? (combat ? [combat] : []));
  combatsCol.viewed = null;
  combatsCol.combats = sceneCombats ?? [];

  globalThis.game = {
    settings: settingsApi,
    user: { isGM, targets: targetSet, id: "user1" },
    combat,
    combats: combatsCol,
    actors: actorCol,
    modules: { get: () => undefined },
    i18n
  };

  globalThis.canvas = {
    tokens: tokenCol,
    scene,
    ping: vi.fn(),
    animatePan: vi.fn(async () => {})
  };

  globalThis.ui = {
    combat: { viewed: null },
    notifications: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
  };

  globalThis.CONFIG = {
    statusEffects: [],
    specialStatusEffects: { DEFEATED: "dead" },
    DND5E: { movementTypes: {} }
  };

  return {
    game: globalThis.game,
    canvas: globalThis.canvas,
    ui: globalThis.ui,
    settings: settingsApi,
    setSetting: (key, value) => settingsApi._store.set(key, value),
    setTargets: (list) => {
      targetSet.clear();
      list.forEach((t) => targetSet.add(t));
    }
  };
}

export function resetFoundry() {
  delete globalThis.game;
  delete globalThis.canvas;
  delete globalThis.ui;
  delete globalThis.CONFIG;
}

/* ------------------------------------------------------------------ */
/*  Document factories                                                */
/* ------------------------------------------------------------------ */

let uid = 0;
const nextId = (prefix) => `${prefix}${++uid}`;

export function makeActor(overrides = {}) {
  const {
    id = nextId("actor"),
    name = "Actor",
    img = "actor.png",
    type = "character",
    isOwner = false,
    hp = { value: 10, max: 10, temp: 0 },
    ac = 15,
    movement = { walk: 30 },
    resources = null,
    spells = null,
    items = [],
    temporaryEffects = [],
    appliedEffects = [],
    flags = {},
    prototypeToken = null,
    system: systemOverride = {}
  } = overrides;

  const itemCol = makeCollection(items);

  return {
    id,
    name,
    img,
    type,
    isOwner,
    temporaryEffects,
    appliedEffects,
    items: itemCol,
    flags,
    prototypeToken,
    system: {
      attributes: { hp, ac: { value: ac }, movement },
      resources,
      spells,
      ...systemOverride
    },
    getFlag: vi.fn((ns, key) => flags?.[ns]?.[key]),
    setFlag: vi.fn(async () => {}),
    toggleStatusEffect: vi.fn(async () => {}),
    sheet: { render: vi.fn() }
  };
}

export function makeToken(overrides = {}) {
  const {
    id = nextId("token"),
    name = "Token",
    actor = null,
    center = { x: 100, y: 100 },
    isVisible = true,
    isOwner = false,
    src = "token.png",
    movementAction = "walk",
    movementHistory = [],
    measureMovementPath = null
  } = overrides;

  const targeted = new Set();

  return {
    id,
    name,
    actor,
    center,
    isVisible,
    isOwner,
    controlled: false,
    targeted,
    texture: { src },
    document: {
      texture: { src },
      movementAction,
      movementHistory,
      ...(measureMovementPath ? { measureMovementPath } : {}),
      update: vi.fn(async () => {})
    },
    control: vi.fn(async function control() {
      this.controlled = true;
    }),
    setTarget: vi.fn(function setTarget(state) {
      if (state) targeted.add(game.user);
      else targeted.delete(game.user);
    })
  };
}

export function makeEffect(overrides = {}) {
  const {
    id = nextId("effect"),
    name = "Effect",
    img = "effect.png",
    disabled = false,
    isSuppressed = false,
    statuses = [],
    duration = null
  } = overrides;

  return { id, name, img, disabled, isSuppressed, statuses: new Set(statuses), duration };
}

export function makeCombatant(overrides = {}) {
  const {
    id = nextId("cmb"),
    name = "Combatant",
    img = "cmb.png",
    initiative = null,
    hidden = false,
    defeated = false,
    actor = null,
    tokenId = null,
    token = null,
    groupId = null,
    event = false,
    duration = null,
    roundCreated = 1,
    hideDuration = false,
    flags = {}
  } = overrides;

  const mergedFlags = { ...flags };
  if (event) {
    mergedFlags[MODULE_ID] = {
      event: true,
      duration,
      roundCreated,
      hideDuration: hideDuration || undefined,
      ...(flags[MODULE_ID] ?? {})
    };
  }

  return {
    id,
    name,
    img,
    initiative,
    hidden,
    defeated,
    isDefeated: defeated,
    actor,
    actorId: actor?.id ?? actor?._id ?? null,
    tokenId: tokenId ?? token?.id ?? null,
    token: token ? { id: token.id, object: token } : null,
    group: groupId,
    flags: mergedFlags,
    getFlag: vi.fn((ns, key) => {
      const parts = String(key).split(".");
      let cur = mergedFlags?.[ns];
      for (const part of parts) {
        if (cur == null) return undefined;
        cur = cur[part];
      }
      return cur;
    }),
    setFlag: vi.fn(async (ns, key, value) => {
      const parts = String(key).split(".");
      if (!mergedFlags[ns]) mergedFlags[ns] = {};
      let cur = mergedFlags[ns];
      for (let i = 0; i < parts.length - 1; i++) {
        if (!cur[parts[i]] || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = value;
      return value;
    }),
    unsetFlag: vi.fn(async (ns, key) => {
      const parts = String(key).split(".");
      let cur = mergedFlags?.[ns];
      if (!cur) return;
      for (let i = 0; i < parts.length - 1; i++) {
        cur = cur?.[parts[i]];
        if (!cur) return;
      }
      delete cur[parts[parts.length - 1]];
    }),
    update: vi.fn(async () => {}),
    delete: vi.fn(async () => {})
  };
}

export function makeGroup(overrides = {}) {
  const {
    id = nextId("group"),
    name = "Group",
    img = "group.png",
    initiative = null,
    members = []
  } = overrides;

  return {
    id,
    name,
    img,
    initiative,
    members: new Set(members),
    update: vi.fn(async () => {})
  };
}

/* ------------------------------------------------------------------ */
/*  DOM fixtures (jsdom-only helpers)                                 */
/* ------------------------------------------------------------------ */

/**
 * Build a `.illusive-dnd-turn-card` element resembling the rendered template.
 * Requires a DOM (jsdom test environment).
 */
export function makeCardEl({
  id,
  groupId = null,
  tokenId = "",
  order = 0,
  roll = false,
  active = false,
  count = null
} = {}) {
  const card = document.createElement("div");
  card.className = "illusive-dnd-turn-card";
  if (active) card.classList.add("is-active");
  if (id) card.dataset.combatantId = id;
  if (groupId) {
    card.dataset.groupId = groupId;
    card.classList.add("illusive-dnd-turn-card-group");
  }
  card.dataset.tokenId = tokenId ?? "";
  card.style.order = String(order);

  const portrait = document.createElement("div");
  portrait.className = "illusive-dnd-turn-portrait illusive-dnd-ornate-frame";

  const img = document.createElement("img");
  img.className = "illusive-dnd-turn-portrait-img";
  img.alt = "";
  portrait.appendChild(img);

  const init = document.createElement("span");
  init.className = "illusive-dnd-turn-init";
  if (roll) {
    init.classList.add("illusive-dnd-turn-init-roll");
    init.dataset.action = "roll-initiative";
  }
  portrait.appendChild(init);

  if (count != null) {
    const badge = document.createElement("span");
    badge.className = "illusive-dnd-turn-group-count";
    portrait.appendChild(badge);
  } else {
    const hp = document.createElement("span");
    hp.className = "illusive-dnd-turn-hp";
    portrait.appendChild(hp);
  }

  card.appendChild(portrait);

  const name = document.createElement("div");
  name.className = "illusive-dnd-turn-name";
  card.appendChild(name);
  return card;
}

/** A `#illusive-dnd-turn-tracker-track` element containing the given cards + a separator. */
export function makeTrackEl(cards = [], { separatorOrder = 0 } = {}) {
  const track = document.createElement("div");
  track.id = "illusive-dnd-turn-tracker-track";
  cards.forEach((card) => track.appendChild(card));

  const separator = document.createElement("div");
  separator.className = "illusive-dnd-turn-separator";
  separator.style.order = String(separatorOrder);
  const round = document.createElement("div");
  round.className = "illusive-dnd-turn-separator-round";
  const label = document.createElement("span");
  round.append(document.createElement("i"), label);
  separator.appendChild(round);
  track.appendChild(separator);
  return track;
}

/** Default initiative-desc sort matching Foundry's `_sortCombatants`. */
function defaultSort(a, b) {
  const ia = a.initiative ?? -Infinity;
  const ib = b.initiative ?? -Infinity;
  if (ib !== ia) return ib - ia;
  return a.id > b.id ? 1 : a.id < b.id ? -1 : 0;
}

export function makeCombat(overrides = {}) {
  const {
    id = nextId("combat"),
    round = 1,
    turn = 0,
    started = true,
    combatants = [],
    groups = [],
    sceneId = "scene1",
    active = undefined,
    sortCombatants = defaultSort
  } = overrides;

  const combatantCol = makeCollection(combatants);
  const groupCol = makeCollection(groups);

  const combat = {
    id,
    round,
    turn,
    started,
    combatants: combatantCol,
    groups: groupCol,
    scene: { id: sceneId },
    sceneId,
    _active: active,
    _sortCombatants: sortCombatants,
    get turns() {
      return [...combatantCol].sort(this._sortCombatants.bind(this));
    },
    get combatant() {
      if (this._active !== undefined) return this._active;
      return this.turns[this.turn] ?? null;
    },
    update: vi.fn(async () => {}),
    endCombat: vi.fn(async () => {}),
    resetAll: vi.fn(async () => {}),
    rollAll: vi.fn(async () => {}),
    rollNPC: vi.fn(async () => {}),
    rollInitiative: vi.fn(async () => {}),
    nextTurn: vi.fn(async () => {}),
    previousTurn: vi.fn(async () => {}),
    nextRound: vi.fn(async () => {}),
    previousRound: vi.fn(async () => {}),
    startCombat: vi.fn(async () => {}),
    activate: vi.fn(async () => {}),
    createEmbeddedDocuments: vi.fn(async () => {}),
    deleteEmbeddedDocuments: vi.fn(async () => {})
  };

  return combat;
}
