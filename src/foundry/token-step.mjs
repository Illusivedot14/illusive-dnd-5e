import { MODULE_ID } from "../constants.mjs";
import {
  canUndoTokenMovement,
  undoFallbackPosition,
  undoLastTokenMovement,
  undoOneTokenMovement
} from "../application/action-economy.mjs";
import {
  buildMovementData,
  combatMoveExceedsBudget
} from "../application/token-movement.mjs";
import { getViewedCombat } from "./combat.mjs";
import { illusiveDnd } from "../i18n/index.mjs";
import { flipToken } from "./token-actions.mjs";

const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  upLeft: { x: -1, y: -1 },
  upRight: { x: 1, y: -1 },
  downLeft: { x: -1, y: 1 },
  downRight: { x: 1, y: 1 }
};

export const STEP_DIRS = Object.keys(DIRS);

/** Grid step in scene pixels. Works with no canvas. */
export function sceneGridStep(scene) {
  const grid = scene?.grid ?? {};
  const x = Number(grid.sizeX ?? grid.size) || 100;
  const y = Number(grid.sizeY ?? grid.size) || x;
  return { x, y };
}

export function nextTokenStep(pos, dir, step) {
  const delta = DIRS[dir];
  if (!delta) return null;
  return {
    x: (Number(pos?.x) || 0) + delta.x * (Number(step?.x) || 0),
    y: (Number(pos?.y) || 0) + delta.y * (Number(step?.y) || 0)
  };
}

export function viewedScene() {
  return game.scenes?.active
    ?? game.scenes?.current
    ?? game.scenes?.viewed
    ?? game.scenes?.get?.(game.user?.viewedScene)
    ?? null;
}

function tokensOnScene(scene) {
  if (!scene) return [];
  const tokens = scene.tokens ?? scene.getEmbeddedCollection?.("Token") ?? null;
  if (tokens) {
    if (Array.isArray(tokens)) return tokens;
    if (Array.isArray(tokens.contents)) return tokens.contents;
    if (typeof tokens.forEach === "function") {
      const list = [];
      tokens.forEach((t) => list.push(t));
      if (list.length) return list;
    }
    try {
      const spread = [...tokens];
      if (spread.length) return spread;
    } catch {
      /* fall through to source */
    }
  }
  const raw = scene._source?.tokens;
  return Array.isArray(raw) ? raw : [];
}

function tokenMatchesActor(token, actor) {
  const id = actor.id ?? actor._id;
  return token.actorId === id
    || token.actor?.id === id
    || token.actor?._id === id
    || token._source?.actorId === id;
}

function pickToken(list) {
  return list.find((t) => t.isOwner) ?? list[0] ?? null;
}

function tokenSceneId(token) {
  return token?.parent?.id
    ?? token?.parentId
    ?? token?.scene?.id
    ?? token?.sceneId
    ?? token?.document?.parent?.id
    ?? null;
}

function isOnActivatedScene(token, scene = viewedScene()) {
  if (!token || !scene) return false;
  const id = tokenSceneId(token);
  return id == null || id === scene.id;
}

function hydrateToken(scene, token) {
  if (!token) return null;
  const raw = token.document ?? token;
  const id = raw.id ?? raw._id;
  const uuid = raw.uuid ?? (scene?.id && id ? `Scene.${scene.id}.Token.${id}` : null);
  const fromUuid = uuid && typeof fromUuidSync === "function" ? fromUuidSync(uuid) : null;
  if (fromUuid && (typeof fromUuid.move === "function" || typeof fromUuid.update === "function")) return fromUuid;
  const fromScene = id ? scene?.tokens?.get?.(id) : null;
  if (fromScene) return fromScene;
  if (typeof raw.update === "function" || typeof raw.move === "function") return raw;
  return Object.assign(raw, { id, parent: raw.parent ?? scene, uuid });
}

function tokenXY(doc) {
  return {
    x: Number(doc?._source?.x ?? doc?.x) || 0,
    y: Number(doc?._source?.y ?? doc?.y) || 0
  };
}

function buildStepDestination(doc, dir, scene) {
  const origin = doc._source ?? doc;
  const dest = nextTokenStep(origin, dir, sceneGridStep(scene));
  if (!dest) return null;
  return {
    x: Math.round(dest.x),
    y: Math.round(dest.y),
    elevation: origin.elevation ?? 0,
    width: origin.width,
    height: origin.height,
    shape: origin.shape,
    action: origin.movementAction,
    checkpoint: true,
    explicit: false
  };
}

function sameSpot(doc, dest) {
  const now = tokenXY(doc);
  return Math.round(now.x) === Math.round(dest.x) && Math.round(now.y) === Math.round(dest.y);
}

function moveOptions() {
  const inCombat = Boolean(getViewedCombat()?.started);
  const unconstrained = Boolean(
    game.user?.isGM && game.settings?.get?.("core", "unconstrainedMovement")
  );
  return {
    // Keyboard steps stay on one Foundry path. The ruler is what draws that path;
    // Token.#onUpdateAnimation never draws it when animate is false.
    // pan defaults to chasing a controlled token, which jumps the map every square.
    method: "keyboard",
    autoRotate: false,
    showRuler: true,
    pan: false,
    // In combat, honor movement cost so actors cannot step past their speed.
    constrainOptions: {
      ignoreWalls: true,
      ignoreCost: unconstrained || !inCombat,
      ignoreTokens: true
    }
  };
}

function waypointFromDestination(doc, destination) {
  const origin = doc._source ?? doc;
  return {
    x: destination.x,
    y: destination.y,
    elevation: destination.elevation ?? origin.elevation ?? 0,
    width: destination.width ?? origin.width,
    height: destination.height ?? origin.height,
    shape: destination.shape ?? origin.shape,
    action: origin.movementAction || globalThis.CONFIG?.Token?.movement?.defaultAction || "walk",
    checkpoint: true,
    snapped: true
  };
}

function hasLiveCanvas() {
  return Boolean(canvas?.ready && canvas.grid);
}

/** Set the token on a square when Foundry's own undo cannot. No camera chase. */
async function placeTokenAt(doc, destination) {
  if (!doc || !destination) return false;
  const options = { animate: false, pan: false, diff: false };
  if (typeof doc.update === "function") {
    try {
      await doc.update({ x: destination.x, y: destination.y }, options);
      return true;
    } catch {
      /* fall through */
    }
  }
  const scene = doc.parent ?? viewedScene();
  const id = doc.id ?? doc._id;
  if (scene && id && typeof scene.updateEmbeddedDocuments === "function") {
    try {
      await scene.updateEmbeddedDocuments("Token", [{ _id: id, x: destination.x, y: destination.y }], options);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function applyTokenStep(doc, destination) {
  if (!doc || !destination) return false;
  if (!hasLiveCanvas()) return false;

  if (getViewedCombat()?.started) {
    const changes = { x: destination.x, y: destination.y };
    if (combatMoveExceedsBudget(doc, changes)) {
      const token = doc.object ?? { document: doc, actor: doc.actor };
      const budget = buildMovementData(token, { inCombat: true });
      ui.notifications?.warn?.(
        illusiveDnd.movement("overBudget", { remaining: budget?.remainingFeet ?? 0 })
      );
      return false;
    }
  }

  const options = moveOptions();
  const waypoint = waypointFromDestination(doc, destination);
  const before = tokenXY(doc);

  // constrainOptions have to be on the movement instruction. Foundry does not
  // take them from the database update options, so a wall stops the token short
  // and a second update records a point on the same square.
  const scene = doc.parent ?? viewedScene();
  if (scene && typeof scene.moveTokens === "function") {
    try {
      const results = await scene.moveTokens({
        [doc.id]: {
          destination: waypoint,
          method: options.method,
          autoRotate: options.autoRotate,
          showRuler: options.showRuler,
          constrainOptions: options.constrainOptions
        }
      }, { pan: false });
      if (results?.[doc.id] || sameSpot(doc, destination)) return true;
      const after = tokenXY(doc);
      if (after.x !== before.x || after.y !== before.y) return true;
    } catch {
      /* fall through */
    }
  }

  if (typeof doc.move === "function") {
    try {
      const moved = await doc.move(waypoint, options);
      if (moved || sameSpot(doc, destination)) return true;
      const after = tokenXY(doc);
      if (after.x !== before.x || after.y !== before.y) return true;
    } catch {
      /* fall through */
    }
  }

  if (typeof doc.update === "function") {
    try {
      await doc.update({ x: destination.x, y: destination.y }, options);
      return true;
    } catch {
      /* fall through */
    }
  }

  const id = doc.id ?? doc._id;
  if (scene && id && typeof scene.updateEmbeddedDocuments === "function") {
    try {
      await scene.updateEmbeddedDocuments("Token", [{ _id: id, x: destination.x, y: destination.y }], options);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

const SOCKET_EVENT = `module.${MODULE_ID}`;
const SOCKET_TYPE = "illusive-dnd-token-step";
const pendingSteps = new Map();
let socketBound = false;
let moverChain = Promise.resolve();

export function canUndoActorToken(actor) {
  const doc = findActorTokenDoc(actor);
  if (!doc) return false;
  return canUndoTokenMovement(tokenViewFromDoc(doc));
}

function enqueueMover(fn) {
  const run = moverChain.then(fn, fn);
  moverChain = run.catch(() => {});
  return run;
}

function requestId() {
  return globalThis.foundry?.utils?.randomID?.() ?? `${Date.now()}-${Math.random()}`;
}

function requestRemoteStep(payload) {
  if (typeof game.socket?.emit !== "function") return Promise.resolve(false);
  return new Promise((resolve) => {
    const id = requestId();
    const timer = setTimeout(() => {
      pendingSteps.delete(id);
      resolve(false);
    }, 4000);
    pendingSteps.set(id, (ok) => {
      clearTimeout(timer);
      pendingSteps.delete(id);
      resolve(Boolean(ok));
    });
    game.socket.emit(SOCKET_EVENT, { type: SOCKET_TYPE, requestId: id, ...payload });
  });
}

function isElectedMover(requesterId) {
  if (game.user?.id === requesterId) return false;
  if (!hasLiveCanvas()) return false;
  const others = [...(game.users ?? [])].filter((u) => u.active && u.id !== requesterId);
  const gms = others.filter((u) => u.isGM).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (gms.length) return game.user.isGM && game.user.id === gms[0].id;
  return true;
}

async function onTokenStepSocket(data) {
  if (!data || data.type !== SOCKET_TYPE) return;
  if (data.reply && pendingSteps.has(data.requestId)) {
    pendingSteps.get(data.requestId)(data.ok);
    return;
  }
  if (data.userId === game.user.id) return;
  if (!isElectedMover(data.userId)) return;

  await enqueueMover(async () => {
    const scene = game.scenes?.get?.(data.sceneId) ?? viewedScene();
    const doc = (data.tokenUuid && typeof fromUuidSync === "function" ? fromUuidSync(data.tokenUuid) : null)
      ?? scene?.tokens?.get?.(data.tokenId)
      ?? null;
    let ok = false;
    if (data.kind === "flip") {
      ok = Boolean(doc && await flipToken(tokenViewFromDoc(doc)));
    } else if (data.kind === "undo") {
      const token = doc ? tokenViewFromDoc(doc) : null;
      if (data.mode === "one") {
        ok = Boolean(token && await undoOneTokenMovement(token));
      } else {
        ok = Boolean(token && await undoLastTokenMovement(token));
      }
      if (!ok && doc && token) {
        const start = undoFallbackPosition(token, { all: data.mode !== "one" });
        if (start) ok = await placeTokenAt(doc, start);
      }
    } else if (data.dir && doc) {
      const destination = buildStepDestination(doc, data.dir, scene);
      ok = Boolean(destination && await applyTokenStep(doc, destination));
    } else if (data.destination) {
      ok = Boolean(doc && await applyTokenStep(doc, data.destination));
    }
    game.socket.emit(SOCKET_EVENT, { type: SOCKET_TYPE, requestId: data.requestId, reply: true, ok });
  });
}

export function bindTokenStepSocket() {
  if (socketBound || typeof game.socket?.on !== "function") return;
  socketBound = true;
  game.socket.on(SOCKET_EVENT, (data) => { void onTokenStepSocket(data); });
}

/** TokenDocument (or source token) for this actor on the activated map only. */
export function findActorTokenDoc(actor) {
  if (!actor) return null;
  const scene = viewedScene();
  if (!scene) return null;

  const pick = pickToken(tokensOnScene(scene).filter((t) => tokenMatchesActor(t, actor)));
  if (pick) return hydrateToken(scene, pick);

  const combat = game.combat ?? game.combats?.viewed ?? null;
  if (combat && (combat.sceneId === scene.id || combat.scene?.id === scene.id)) {
    const combatants = combat.combatants;
    const combatant = combatants?.find?.((c) => tokenMatchesActor(c, actor))
      ?? combatants?.contents?.find?.((c) => tokenMatchesActor(c, actor));
    const fromCombat = combatant?.token
      ?? (combatant?.tokenId ? scene.tokens?.get?.(combatant.tokenId) : null);
    if (fromCombat && isOnActivatedScene(fromCombat, scene)) return fromCombat;
  }

  const live = (actor.getActiveTokens?.(true) ?? actor.getActiveTokens?.(false, true) ?? [])
    .find((token) => isOnActivatedScene(token.document ?? token, scene));
  const liveDoc = live?.document ?? live ?? null;
  return liveDoc && isOnActivatedScene(liveDoc, scene) ? liveDoc : null;
}

export function actorHasMapToken(actor) {
  return Boolean(findActorTokenDoc(actor));
}

/** Shape the movement helpers already read (placeable or document). */
export function tokenViewFromDoc(doc) {
  if (!doc) return null;
  if (doc.document && doc.actor) return doc;
  const raw = doc.document ?? doc;
  const actor = doc.actor
    ?? raw.actor
    ?? game.actors?.get?.(raw.actorId)
    ?? game.actors?.get?.(raw._source?.actorId)
    ?? null;
  return {
    id: raw.id ?? raw._id ?? doc.id,
    actor,
    document: raw,
    isOwner: raw.isOwner ?? doc.isOwner
  };
}

export function findTokenViewById(tokenId) {
  if (!tokenId) return null;
  const live = canvas?.tokens?.get?.(tokenId);
  if (live) return live;
  const scene = viewedScene();
  const doc = hydrateToken(scene, scene?.tokens?.get?.(tokenId)
    ?? tokensOnScene(scene).find((t) => (t.id ?? t._id) === tokenId));
  return tokenViewFromDoc(doc);
}

export async function stepActorToken(actor, dir) {
  const doc = findActorTokenDoc(actor);
  if (!doc) return { ok: false, reason: "noToken" };
  if (doc.isOwner === false && !game.user?.isGM) return { ok: false, reason: "noOwner" };

  const scene = viewedScene();
  if (!scene || !isOnActivatedScene(doc, scene)) return { ok: false, reason: "noToken" };

  const origin = tokenXY(doc);
  const destination = nextTokenStep(origin, dir, sceneGridStep(scene));
  if (!destination) return { ok: false, reason: "badDir" };
  destination.x = Math.round(destination.x);
  destination.y = Math.round(destination.y);

  if (await applyTokenStep(doc, destination)) return { ok: true, doc };

  const remote = await requestRemoteStep({
    tokenUuid: doc.uuid ?? null,
    tokenId: doc.id ?? doc._id,
    sceneId: scene.id,
    dir,
    userId: game.user.id
  });
  if (remote) return { ok: true, doc };
  return { ok: false, reason: "failed" };
}

export async function undoActorToken(actor, { all = false } = {}) {
  const doc = findActorTokenDoc(actor);
  if (!doc) return { ok: false, reason: "noToken" };
  const token = tokenViewFromDoc(doc);
  const from = undoFallbackPosition(token, { all });
  const undoFn = all ? undoLastTokenMovement : undoOneTokenMovement;

  if (hasLiveCanvas()) {
    if (await undoFn(token)) return { ok: true, doc };
    if (from && await placeTokenAt(doc, from)) return { ok: true, doc };
  }

  const remote = await requestRemoteStep({
    kind: "undo",
    mode: all ? "all" : "one",
    tokenUuid: doc.uuid ?? null,
    tokenId: doc.id ?? doc._id,
    sceneId: (doc.parent ?? viewedScene())?.id,
    userId: game.user.id
  });
  return remote ? { ok: true, doc } : { ok: false, reason: "failed" };
}

export async function flipActorToken(actor) {
  const doc = findActorTokenDoc(actor);
  if (!doc) return { ok: false, reason: "noToken" };
  const token = tokenViewFromDoc(doc);
  try {
    if (await flipToken(token)) return { ok: true, doc };
  } catch {
    /* fall through */
  }
  const remote = await requestRemoteStep({
    kind: "flip",
    tokenUuid: doc.uuid ?? null,
    tokenId: doc.id ?? doc._id,
    sceneId: (doc.parent ?? viewedScene())?.id,
    userId: game.user.id
  });
  return remote ? { ok: true, doc } : { ok: false, reason: "failed" };
}
