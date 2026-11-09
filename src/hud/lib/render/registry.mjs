/**
 * HUD panel registry.
 *
 * Leaf module: it imports nothing panel-specific, so the render queue in core.mjs
 * can iterate panels without statically importing them. That inversion is what
 * lets panels (action-bar, current-token, …) import `refreshHud` from core without
 * creating an import cycle.
 */

/**
 * @typedef {object} HudPanel
 * @property {string} id                        root element id
 * @property {string} mask                       render-mask key that gates this panel
 * @property {(options?: object) => unknown} paint
 * @property {() => void} unmount
 * @property {() => void} [position]
 */

/** @type {HudPanel[]} */
const panels = [];

/** @param {HudPanel} panel */
export function registerHudPanel(panel) {
  if (panels.some((existing) => existing.id === panel.id)) return;
  panels.push(panel);
}

/** @returns {HudPanel[]} Panels in registration (paint) order. */
export function getHudPanels() {
  return panels;
}
