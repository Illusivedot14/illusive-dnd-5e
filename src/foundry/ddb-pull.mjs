/**
 * Pull one actor from D&D Beyond through ddb-importer.
 * Beyond is the source. Foundry is the live sheet after this returns.
 * Players ask a connected GM to run the import so file uploads succeed.
 */

import { MODULE_ID } from "../constants.mjs";

const IMPORTER_ID = "ddb-importer";
const FLAG_SCOPE = "ddbimporter";
const SOCKET_EVENT = `module.${MODULE_ID}`;
const SOCKET_TYPE = "illusive-dnd-ddb-pull";
const PULL_TIMEOUT_MS = 180000;

const pendingPulls = new Map();
let socketBound = false;

export function ddbImporterApi() {
  return game.modules?.get?.(IMPORTER_ID)?.api ?? globalThis.DDBImporter ?? null;
}

function ddbFlags(actor) {
  return actor?.flags?.[FLAG_SCOPE] ?? {};
}

export function readDdbCharacterId(actor) {
  const flags = ddbFlags(actor);
  const ddb = flags.dndbeyond ?? {};
  const id = ddb.characterId ?? flags.id;
  return id != null && String(id).trim() ? String(id).trim() : null;
}

export function readDdbCharacterUrl(actor) {
  const ddb = ddbFlags(actor).dndbeyond ?? {};
  const id = readDdbCharacterId(actor);
  const url = String(ddb.url || (id ? `https://www.dndbeyond.com/characters/${id}` : "")).trim();
  return url || null;
}

export function canPullActorFromDdb(actor) {
  if (!actor) return false;
  if (!game.modules?.get?.(IMPORTER_ID)?.active) return false;
  if (!actor.isOwner && !game.user?.isGM) return false;
  return Boolean(readDdbCharacterId(actor) && ddbImporterApi()?.importCharacter);
}

function ownerLevel() {
  return globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
}

function requesterMayPull(actor, userId) {
  if (!actor || !userId) return false;
  const user = game.users?.get?.(userId);
  if (!user) return false;
  if (user.isGM) return true;
  if (typeof actor.testUserPermission === "function") {
    return Boolean(actor.testUserPermission(user, "OWNER"));
  }
  const level = actor.ownership?.[userId] ?? actor.ownership?.default ?? 0;
  return Number(level) >= ownerLevel();
}

function electedGmId(requesterId) {
  return [...(game.users ?? [])]
    .filter((user) => user.active && user.isGM && user.id !== requesterId)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0]?.id ?? null;
}

async function importLinkedActor(actor) {
  const result = await ddbImporterApi().importCharacter({ actor });
  if (result === false) return { ok: false, reason: "failed" };
  return { ok: true };
}

function requestRemotePull(actorId) {
  if (typeof game.socket?.emit !== "function") return Promise.resolve({ ok: false, reason: "noGm" });
  return new Promise((resolve) => {
    const id = globalThis.foundry?.utils?.randomID?.() ?? `${Date.now()}-${Math.random()}`;
    const timer = setTimeout(() => {
      pendingPulls.delete(id);
      resolve({ ok: false, reason: "failed" });
    }, PULL_TIMEOUT_MS);
    pendingPulls.set(id, (data) => {
      clearTimeout(timer);
      pendingPulls.delete(id);
      resolve({ ok: Boolean(data?.ok), reason: data?.reason ?? (data?.ok ? undefined : "failed") });
    });
    game.socket.emit(SOCKET_EVENT, {
      type: SOCKET_TYPE,
      requestId: id,
      actorId,
      userId: game.user?.id
    });
  });
}

async function onDdbPullSocket(data) {
  if (!data || data.type !== SOCKET_TYPE) return;
  if (data.reply && pendingPulls.has(data.requestId)) {
    pendingPulls.get(data.requestId)(data);
    return;
  }
  if (data.reply || data.userId === game.user?.id) return;
  if (!game.user?.isGM || electedGmId(data.userId) !== game.user.id) return;

  const actor = game.actors?.get?.(data.actorId) ?? null;
  let result = { ok: false, reason: "failed" };
  if (!actor) result = { ok: false, reason: "noActor" };
  else if (!game.modules?.get?.(IMPORTER_ID)?.active || !ddbImporterApi()?.importCharacter) {
    result = { ok: false, reason: "noImporter" };
  } else if (!readDdbCharacterId(actor)) result = { ok: false, reason: "noLink" };
  else if (!requesterMayPull(actor, data.userId)) result = { ok: false, reason: "noOwner" };
  else {
    try {
      result = await importLinkedActor(actor);
    } catch {
      result = { ok: false, reason: "failed" };
    }
  }

  game.socket?.emit?.(SOCKET_EVENT, {
    type: SOCKET_TYPE,
    requestId: data.requestId,
    reply: true,
    ...result
  });
}

export function bindDdbPullSocket() {
  if (socketBound || typeof game.socket?.on !== "function") return;
  socketBound = true;
  game.socket.on(SOCKET_EVENT, onDdbPullSocket);
}

/** Beyond → Foundry. Returns { ok, reason } and never throws. */
export async function pullActorFromDdb(actor) {
  if (!actor) return { ok: false, reason: "noActor" };
  if (!canPullActorFromDdb(actor)) {
    if (!game.modules?.get?.(IMPORTER_ID)?.active) return { ok: false, reason: "noImporter" };
    if (!actor.isOwner && !game.user?.isGM) return { ok: false, reason: "noOwner" };
    if (!readDdbCharacterId(actor)) return { ok: false, reason: "noLink" };
    return { ok: false, reason: "failed" };
  }

  if (game.user?.isGM) {
    try {
      return await importLinkedActor(actor);
    } catch {
      return { ok: false, reason: "failed" };
    }
  }

  if (!electedGmId(game.user?.id)) return { ok: false, reason: "noGm" };
  return requestRemotePull(actor.id);
}
