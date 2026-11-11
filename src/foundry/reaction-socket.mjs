/**
 * Reaction prompt relay: the client resolving an action asks the reactor's
 * owning player to decide on their own client, and waits for the answer.
 */

import { MODULE_ID } from "../constants.mjs";

const SOCKET_EVENT = `module.${MODULE_ID}`;
const SOCKET_TYPE = "illusive-dnd-reaction";
let bound = false;
let handlers = { onPrompt: null, onDecision: null, onDismiss: null, onWatch: null };

function playerOwnsActor(actor, user) {
  if (!user?.active || user.isGM) return false;
  try {
    if (actor.testUserPermission?.(user, "OWNER") === true) return true;
  } catch {
    /* ownership map below */
  }
  const level = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
  const personal = actor.ownership?.[user.id];
  if (typeof personal === "number" && personal >= level) return true;
  // Assigned player character. The ownership map often lists only the GM.
  const character = user.character;
  return Boolean(character && (character.id === actor.id || character.uuid === actor.uuid));
}

/**
 * Who decides this creature's reaction: an active non-GM owner, else the active GM
 * (NPCs prompt the GM, not the player whose attack opened the window).
 * null means decide on this client.
 */
export function remoteOwnerFor(actor) {
  if (!actor) return null;
  const me = game.user?.id;
  const owners = [...(game.users ?? [])].filter((user) => playerOwnsActor(actor, user));
  if (!owners.length) {
    const gm = game.users?.activeGM ?? null;
    if (gm && !gm.isSelf && !game.user?.isGM && actor.isOwner === false) return gm;
    return null;
  }
  if (owners.some((u) => u.id === me)) return null;
  return owners.sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
}

export function canRelay() {
  return typeof game?.socket?.emit === "function";
}

/** Ask the owner's client to show the prompt. */
export function sendReactionPrompt(toUserId, payload) {
  if (!canRelay()) return false;
  game.socket.emit(SOCKET_EVENT, {
    type: SOCKET_TYPE,
    kind: "prompt",
    toUserId,
    fromUserId: game.user?.id ?? null,
    ...payload
  });
  return true;
}

/** Return a Pass / used decision to the client holding the hard window. */
export function sendReactionDecision(toUserId, payload) {
  return sendReactionControl(toUserId, "decision", payload);
}

/** Ask another client to close a prompt, or ask the GM to watch one. */
export function sendReactionControl(toUserId, kind, payload) {
  if (!canRelay() || !toUserId) return false;
  game.socket.emit(SOCKET_EVENT, {
    type: SOCKET_TYPE,
    kind,
    toUserId,
    fromUserId: game.user?.id ?? null,
    ...payload
  });
  return true;
}

function onMessage(data) {
  if (!data || data.type !== SOCKET_TYPE) return;
  if (data.toUserId && data.toUserId !== game.user?.id) return;
  deliverReaction(data.kind, data);
}

/** Run whatever handler is installed now. A lazy listener uses this after the runtime loads. */
export function deliverReaction(kind, data) {
  if (kind === "prompt") handlers.onPrompt?.(data);
  else if (kind === "decision") handlers.onDecision?.(data);
  else if (kind === "dismiss") handlers.onDismiss?.(data);
  else if (kind === "watch") handlers.onWatch?.(data);
}

export function bindReactionSocket({ onPrompt, onDecision, onDismiss, onWatch } = {}) {
  handlers = {
    onPrompt: onPrompt ?? handlers.onPrompt,
    onDecision: onDecision ?? handlers.onDecision,
    onDismiss: onDismiss ?? handlers.onDismiss,
    onWatch: onWatch ?? handlers.onWatch
  };
  if (bound || typeof game?.socket?.on !== "function") return;
  bound = true;
  game.socket.on(SOCKET_EVENT, onMessage);
}
