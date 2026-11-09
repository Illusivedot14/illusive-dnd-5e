/**
 * Foundry hook registration map
 *
 * hooks/index.mjs          bindCanvasHooks() — call once from init
 * hooks/scene-selection    No mass token select on world join / scene load
 * hooks/touch-table        Touchscreen account: HUD focus without ownership
 * foundry/spell-regions    GM: delete instant spell areas, tie concentration areas to their effect
 * token-aura               Colored circles on tokens from HUD (flags in foundry/token-aura)
 *
 * render/hooks.mjs         HUD repaint (party, action bar, combat) — bindRenderHooks()
 * main.mjs                 init / setup / ready lifecycle only
 *
 * Feature hooks live next to their UI:
 *   action-bar.mjs, mobile-sheet.mjs, boss-bar, connection-qr, combat-turn.mjs, …
 */

import { bindSceneLoadDeselect } from "./scene-selection.mjs";
import { bindTouchTableClient } from "./touch-table.mjs";
import { bindSpellRegionCleanup } from "../../../foundry/spell-regions.mjs";
import { bindCameraPad } from "../../components/camera-pad/camera-pad.mjs";
import { bindTokenAuras } from "../../components/token-aura/token-aura.mjs";

/** Canvas + token behavior (register during init, before canvasReady). */
export function bindCanvasHooks() {
  bindSceneLoadDeselect();
  bindTouchTableClient();
  bindSpellRegionCleanup();
  bindCameraPad();
  bindTokenAuras();
}
