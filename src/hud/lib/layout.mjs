import { MODULE_ID } from "../../constants.mjs";
import {
  applyHudBandVariables,
  computeActionBarScale,
  computeDisplayFactor,
  computeHudFitScale,
  getHudBand,
  resolveDisplayViewport
} from "./hud-bounds.mjs";
import { repositionHud } from "./render/core.mjs";
import { getEffectivePartyRailLayout } from "./party-player-prefs.mjs";
import { syncFoundryUiVisibility } from "../components/action-bar/action-bar-foundry-ui.mjs";

const DEFAULTS = {
  partyOffsetX: 0,
  partyOffsetY: 0,
  partyScale: 100,
  tokenOffsetX: 0,
  tokenOffsetY: 0
};

const LAYOUT_KEYS = new Set([
  "partyOffsetX", "partyOffsetY", "partyScale",
  "tokenOffsetX", "tokenOffsetY",
  "partyPlayerPrefs",
  "displayProfile"
]);

/**
 * @param {{ fitScale?: number, actionBarScale?: number } | null} [scales]
 *   Reuse values from {@link applyHudBandVariables} when available.
 */
export function getLayoutSettings(scales = null) {
  const party = getEffectivePartyRailLayout();
  let globalScale = scales?.fitScale;
  let actionBarScale = scales?.actionBarScale;

  if (globalScale == null || actionBarScale == null) {
    const band = getHudBand();
    const viewport = resolveDisplayViewport();
    const factor = computeDisplayFactor(viewport);
    globalScale ??= computeHudFitScale(viewport);
    actionBarScale ??= computeActionBarScale(band, factor, viewport.profileKey);
  }

  return {
    partyOffsetX: party.partyOffsetX,
    partyOffsetY: party.partyOffsetY,
    partyScale: party.partyScale,
    tokenOffsetX: game.settings.get(MODULE_ID, "tokenOffsetX") ?? DEFAULTS.tokenOffsetX,
    tokenOffsetY: game.settings.get(MODULE_ID, "tokenOffsetY") ?? DEFAULTS.tokenOffsetY,
    globalScale,
    actionBarScale
  };
}

export function applyLayoutVariables() {
  const scales = applyHudBandVariables();
  const layout = getLayoutSettings(scales);
  const root = document.documentElement;

  root.style.setProperty("--illusive-dnd-party-offset-x", `${layout.partyOffsetX}px`);
  root.style.setProperty("--illusive-dnd-party-offset-y", `${layout.partyOffsetY}px`);
  root.style.setProperty("--illusive-dnd-party-scale", `${layout.partyScale}`);
  root.style.setProperty("--illusive-dnd-token-offset-x", `${layout.tokenOffsetX}px`);
  root.style.setProperty("--illusive-dnd-token-offset-y", `${layout.tokenOffsetY}px`);
  syncFoundryUiVisibility();
}

let hooksBound = false;

export function bindLayoutHooks() {
  applyLayoutVariables();

  if (hooksBound) return;
  hooksBound = true;

  Hooks.on("changeSetting", (data) => {
    if (data.namespace === MODULE_ID && LAYOUT_KEYS.has(data.key)) {
      applyLayoutVariables();
      repositionHud();
    }
  });
}
