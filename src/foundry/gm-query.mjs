/**
 * GM authority — Foundry queries (CONFIG.queries / User#query) to the active GM.
 *
 * Players never write documents they do not own: the write gateway and the
 * game-log journal ask the active GM to do it. One client (the primary writer)
 * runs shared side effects such as turn-change ticks and aura sync.
 */

import { MODULE_ID } from "../constants.mjs";

const DEFAULT_TIMEOUT_MS = 15000;

export function queryName(name) {
  return `${MODULE_ID}.${name}`;
}

/** Register a GM-side query handler. Call during init. */
export function registerQuery(name, handler) {
  const config = globalThis.CONFIG ?? (globalThis.CONFIG = {});
  if (!config.queries || typeof config.queries !== "object") config.queries = {};
  config.queries[queryName(name)] = async (data = {}) => handler(data ?? {});
  return true;
}

export function activeGm() {
  return globalThis.game?.users?.activeGM ?? null;
}

export function isActiveGm() {
  const gm = activeGm();
  return Boolean(gm && gm.isSelf);
}

/**
 * The single client that runs shared side effects (turn ticks, auras, expiries):
 * the active GM, else the lowest-id active player. Headless (tests): true.
 */
export function isPrimaryWriter() {
  const game = globalThis.game;
  if (!game?.user) return true;
  const gm = activeGm();
  if (gm) return Boolean(gm.isSelf);
  const active = [...(game.users ?? [])].filter((u) => u?.active);
  if (!active.length) return true;
  active.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return active[0].id === game.user.id;
}

/** True when a GM other than this client can run a query for us. */
export function canAskGm() {
  const gm = activeGm();
  return Boolean(gm && !gm.isSelf && typeof gm.query === "function");
}

/**
 * Run a query on the active GM's client.
 * @returns {Promise<any>} handler result; rejects on timeout / no GM.
 */
export async function askGm(name, data = {}, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
  const gm = activeGm();
  if (!gm || typeof gm.query !== "function") throw new Error("illusive-dnd-5e: no active GM");
  return gm.query(queryName(name), { ...data, fromUserId: globalThis.game?.user?.id ?? null }, { timeout });
}
