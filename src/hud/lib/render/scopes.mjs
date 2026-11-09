/** @typedef {{ party?: boolean, actionBar?: boolean, turn?: boolean, layout?: boolean }} IllusiveDndRenderMask */

export const ILLUSIVE_DND_RENDER = Object.freeze({
  ALL: "all",
  LAYOUT: "layout",
  PARTY: "party",
  TOKEN: "token",
  ACTION_BAR: "actionBar",
  TURN: "turn",
  SELECTION: "selection",
  HOTBAR: "hotbar",
  COMBAT_TURN: "combatTurn",
  EFFECTS: "effects",
  THEME: "theme"
});

/** @type {Record<string, IllusiveDndRenderMask>} */
const PRESETS = {
  [ILLUSIVE_DND_RENDER.ALL]: { party: true, actionBar: true, turn: true },
  [ILLUSIVE_DND_RENDER.LAYOUT]: { layout: true },
  [ILLUSIVE_DND_RENDER.PARTY]: { party: true },
  [ILLUSIVE_DND_RENDER.TOKEN]: { actionBar: true },
  [ILLUSIVE_DND_RENDER.ACTION_BAR]: { actionBar: true },
  [ILLUSIVE_DND_RENDER.TURN]: { turn: true },
  [ILLUSIVE_DND_RENDER.SELECTION]: { party: true, actionBar: true },
  [ILLUSIVE_DND_RENDER.HOTBAR]: { layout: true, actionBar: true },
  [ILLUSIVE_DND_RENDER.COMBAT_TURN]: { party: true, actionBar: true, turn: true },
  [ILLUSIVE_DND_RENDER.EFFECTS]: { party: true, actionBar: true },
  [ILLUSIVE_DND_RENDER.THEME]: { party: true, actionBar: true, turn: true, layout: true }
};

/**
 * @param {string | IllusiveDndRenderMask} scope
 * @returns {IllusiveDndRenderMask}
 */
export function resolveRenderMask(scope) {
  if (scope && typeof scope === "object") return scope;
  return PRESETS[scope] ?? PRESETS[ILLUSIVE_DND_RENDER.ALL];
}
