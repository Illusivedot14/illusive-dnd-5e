/**
 * Client-gated diagnostic logger.
 *
 * Off by default. Enable **Configure Settings → Illusive D&D 5e → Debug logging**.
 * Filter DevTools by `[illusive-dnd-5e:<channel>]`.
 */

import { MODULE_ID } from "../constants.mjs";

export const DEBUG_SETTING_KEY = "debugLogging";

/** Known channels (any string is allowed; these are the common ones). */
export const DEBUG_CHANNELS = Object.freeze({
  TEMPLATE: "template",
  GAME_LOG: "game-log",
  MOVEMENT: "movement",
  COMBAT: "combat"
});

export function isDebugLoggingEnabled() {
  try {
    if (typeof game === "undefined" || !game?.settings?.get) return false;
    return Boolean(game.settings.get(MODULE_ID, DEBUG_SETTING_KEY));
  } catch {
    return false;
  }
}

/**
 * @param {string} channel  e.g. "template", "game-log"
 * @param {string} tag      short event name
 * @param {unknown} [data]
 */
export function debugLog(channel, tag, data = undefined) {
  if (!isDebugLoggingEnabled()) return;
  const prefix = `[${MODULE_ID}:${channel}] ${tag}`;
  try {
    if (data === undefined) {
      console.log(prefix);
      return;
    }
    if (data !== null && typeof data === "object") {
      console.log(prefix, JSON.stringify(data));
      return;
    }
    console.log(prefix, data);
  } catch {
    try {
      console.log(prefix, data);
    } catch {
      /* ignore */
    }
  }
}

/** Register the client toggle (call from Hooks.once("init")). */
export function registerDebugSettings() {
  game.settings.register(MODULE_ID, DEBUG_SETTING_KEY, {
    name: `${MODULE_ID}.settings.debugLogging.name`,
    hint: `${MODULE_ID}.settings.debugLogging.hint`,
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });
}
