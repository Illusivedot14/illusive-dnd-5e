/**
 * Illusive D&D HUD — rendering (single entry point).
 *
 * Usage:
 *   import { refreshHud, bindRenderHooks, ILLUSIVE_DND_RENDER } from "./render.mjs";
 *   bindRenderHooks();
 *   refreshHud(ILLUSIVE_DND_RENDER.ALL);
 *   refreshHud(ILLUSIVE_DND_RENDER.SELECTION);
 */

export { ILLUSIVE_DND_RENDER, resolveRenderMask } from "./render/scopes.mjs";
export { refreshHud, repositionHud } from "./render/core.mjs";
export { bindRenderHooks } from "./render/hooks.mjs";
