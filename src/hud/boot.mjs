/**
 * Existing Illusive D&D HUD initialization (formerly main.mjs).
 */
import { MODULE_ID, MODULE_PATH, illusiveDndLoadTemplates } from "../constants.mjs";
import { initI18n, bindI18nHooks } from "../i18n/index.mjs";
import { bindRenderHooks, refreshHud, ILLUSIVE_DND_RENDER } from "./lib/render.mjs";
import { registerSettings } from "./settings.mjs";
import { bindActionBarInteractions } from "./components/action-bar/action-bar.mjs";
import { bindTokenStatusInteractions } from "./components/token-statuses/token-statuses.mjs";
import { bindLayoutHooks } from "./lib/layout.mjs";
import { bindCombatTurnHooks } from "../foundry/combat-turn.mjs";
import { bindPanelThemeHooks } from "./lib/panel-theme.mjs";
import { migrateStalePartyPlayerPrefs } from "./lib/party-player-prefs.mjs";
import { initBossBar, onBossBarReady } from "./components/boss-bar/boss-bar-init.mjs";
import { bindMobileSheet, MOBILE_SHEET_TEMPLATE } from "./components/mobile-sheet/mobile-sheet.mjs";
import { bootMobileClientUi } from "./components/mobile-sheet/mobile-carousel.mjs";
import { bindMobileSheetDiceBroadcast } from "./components/mobile-sheet/mobile-sheet-dsn.mjs";
import {
  bindMobileClientHooks,
  isIllusiveMobileMode,
  syncMobileClientSettings,
  suppressMobileClientNotices
} from "./lib/mobile-client.mjs";
import { applyEarlyMobileBootClass, persistMobileBootFlag } from "./lib/mobile-boot.mjs";
import { bindTokenStepSocket } from "../foundry/token-step.mjs";
import { bindReactionRelay } from "../application/reactions/window.mjs";
import { bindDdbPullSocket } from "../foundry/ddb-pull.mjs";
import { bindCanvasHooks } from "./lib/hooks/index.mjs";
import { bindOverlayGuardHooks } from "./lib/overlay-guard.mjs";
import { bindConnectionQrOverlay, showConnectionQrs, purgeConnectionQrTiles } from "./components/connection-qr/connection-qr-overlay.mjs";

applyEarlyMobileBootClass();

export function bindHudInit() {
  Hooks.once("init", async () => {
    await initI18n();
    bindI18nHooks();
    bindCanvasHooks();
    bindOverlayGuardHooks();
    registerSettings();

    if (isIllusiveMobileMode()) {
      persistMobileBootFlag(true);
      document.documentElement.classList.remove("illusive-dnd-mobile-force-desktop");
    } else {
      persistMobileBootFlag(false);
      document.documentElement.classList.add("illusive-dnd-mobile-force-desktop");
    }

    initBossBar();
    await illusiveDndLoadTemplates([
      `${MODULE_PATH}/src/hud/components/party-status/party-status.hbs`,
      `${MODULE_PATH}/src/hud/components/token-statuses/token-statuses.hbs`,
      `${MODULE_PATH}/src/hud/components/token-statuses/set-duration.hbs`,
      `${MODULE_PATH}/src/hud/components/action-bar/action-bar-full.hbs`,
      `${MODULE_PATH}/src/hud/components/turn-tracker/turn-tracker.hbs`,
      `${MODULE_PATH}/src/hud/components/turn-tracker/add-event.hbs`,
      `${MODULE_PATH}/src/hud/components/action-bar/action-bar-abilities.hbs`,
      `${MODULE_PATH}/src/hud/templates/settings-submenu.hbs`,
      MOBILE_SHEET_TEMPLATE
    ]);

    if (isIllusiveMobileMode()) {
      persistMobileBootFlag(true);
      try {
        const have = game.settings.get("core", "noCanvas") === true;
        if (!have) {
          await game.settings.set("core", "noCanvas", true);
          await game.settings.set(MODULE_ID, "illusiveDndManagedNoCanvas", true);
        }
      } catch (err) {
        console.warn(`${MODULE_ID} | init noCanvas sync failed`, err);
      }
    }
  });

  Hooks.once("setup", () => {
    if (isIllusiveMobileMode()) persistMobileBootFlag(true);
    suppressMobileClientNotices();
  });

  Hooks.once("ready", async () => {
    bindMobileClientHooks();
    bindConnectionQrOverlay();
    const mod = game.modules.get(MODULE_ID);
    if (mod) mod.api = { ...(mod.api ?? {}), showConnectionQrs, purgeConnectionQrTiles };
    if (await syncMobileClientSettings()) return;

    bindMobileSheet();
    bindMobileSheetDiceBroadcast();
    bindTokenStepSocket();
    bindReactionRelay();
    bindDdbPullSocket();
    await bootMobileClientUi();

    import("./components/camera-pad/camera-pad.mjs")
      .then((m) => m.refreshCameraPad())
      .catch((err) => console.error(`${MODULE_ID} | camera pad failed to show`, err));

    if (isIllusiveMobileMode()) {
      console.info(`${MODULE_ID} | mobile sheets-only active | noCanvas=${game.settings.get("core", "noCanvas")}`);
      return;
    }

    bindLayoutHooks();
    bindPanelThemeHooks();
    try {
      await migrateStalePartyPlayerPrefs();
    } catch (err) {
      console.error(`${MODULE_ID} | party prefs migrate failed`, err);
    }
    try {
      await onBossBarReady();
    } catch (err) {
      console.error(`${MODULE_ID} | boss bar ready failed`, err);
    }
    bindRenderHooks();
    bindTokenStatusInteractions();
    bindActionBarInteractions();
    bindCombatTurnHooks();
    refreshHud(ILLUSIVE_DND_RENDER.ALL);
  });
}

export default bindHudInit;
