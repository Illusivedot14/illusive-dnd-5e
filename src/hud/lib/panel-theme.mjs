import { MODULE_ID } from "../../constants.mjs";
import { settingOn } from "./hud-settings.mjs";
import { refreshHud } from "./render/core.mjs";
import { ILLUSIVE_DND_RENDER } from "./render/scopes.mjs";

export function applyPanelTheme() {
  const root = document.documentElement;
  const theme = game.settings.get(MODULE_ID, "hudTheme") ?? "bg3";
  const ornate = settingOn("showOrnateFrames");
  const partyOpacity = (game.settings.get(MODULE_ID, "partyRailOpacity") ?? 100) / 100;
  const tokenOpacity = (game.settings.get(MODULE_ID, "tokenPanelOpacity") ?? 100) / 100;
  const partySize = game.settings.get(MODULE_ID, "partySize") ?? "normal";

  document.body.classList.toggle("illusive-dnd-theme-minimal", theme === "minimal");
  document.body.classList.toggle("illusive-dnd-theme-bg3", theme !== "minimal");
  document.body.classList.toggle("illusive-dnd-ornate-disabled", !ornate);
  document.body.classList.remove("illusive-dnd-active-pulse-off");
  document.body.dataset.illusiveDndPartySize = partySize;

  root.style.setProperty("--illusive-dnd-party-opacity", String(partyOpacity));
  root.style.setProperty("--illusive-dnd-token-opacity", String(tokenOpacity));
}

let hooksBound = false;

export function bindPanelThemeHooks() {
  applyPanelTheme();
  if (hooksBound) return;
  hooksBound = true;

  Hooks.on("changeSetting", (data) => {
    if (data.namespace !== MODULE_ID) return;
    const themeKeys = new Set([
      "hudTheme", "showOrnateFrames", "partyRailOpacity", "tokenPanelOpacity",
      "partySize"
    ]);
    if (themeKeys.has(data.key)) {
      applyPanelTheme();
      refreshHud(ILLUSIVE_DND_RENDER.THEME);
    }
  });
}
