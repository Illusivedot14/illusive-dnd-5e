/**
 * Existing Illusive D&D HUD initialization (formerly main.mjs).
 */
import { MODULE_ID, MODULE_PATH, illusiveDndLoadTemplates } from "../constants.mjs";
import { initI18n, bindI18nHooks } from "../i18n/index.mjs";
import { registerSettings } from "./settings.mjs";
import { bindCombatTurnHooks } from "../foundry/combat-turn.mjs";
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
import { bindLazyReactionRelay } from "../foundry/combat-runtime.mjs";
import { bindDdbPullSocket } from "../foundry/ddb-pull.mjs";
import { bindCanvasHooks } from "./lib/hooks/index.mjs";
import { bindOverlayGuardHooks } from "./lib/overlay-guard.mjs";
import { bindConnectionQrOverlay, showConnectionQrs, purgeConnectionQrTiles } from "./components/connection-qr/connection-qr-overlay.mjs";

applyEarlyMobileBootClass();

export function bindHudInit() {
  Hooks.once("init", async () => {
    await initI18n();
    bindI18nHooks();
    bindOverlayGuardHooks();
    registerSettings();
    await bindCanvasHooks();

    if (isIllusiveMobileMode()) {
      persistMobileBootFlag(true);
      document.documentElement.classList.remove("illusive-dnd-mobile-force-desktop");
    } else {
      persistMobileBootFlag(false);
      document.documentElement.classList.add("illusive-dnd-mobile-force-desktop");
    }

    initBossBar();
    const desktopTemplates = [
      `${MODULE_PATH}/src/hud/components/party-status/party-status.hbs`,
      `${MODULE_PATH}/src/hud/components/token-statuses/token-statuses.hbs`,
      `${MODULE_PATH}/src/hud/components/token-statuses/set-duration.hbs`,
      `${MODULE_PATH}/src/hud/components/action-bar/action-bar-full.hbs`,
      `${MODULE_PATH}/src/hud/components/turn-tracker/turn-tracker.hbs`,
      `${MODULE_PATH}/src/hud/components/turn-tracker/add-event.hbs`,
      `${MODULE_PATH}/src/hud/components/action-bar/action-bar-abilities.hbs`
    ];
    await illusiveDndLoadTemplates([
      ...(isIllusiveMobileMode() ? [] : desktopTemplates),
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
    bindDdbPullSocket();
    if (isIllusiveMobileMode()) bindLazyReactionRelay();
    await bootMobileClientUi();

    import("./components/camera-pad/camera-pad.mjs")
      .then((m) => m.refreshCameraPad())
      .catch((err) => console.error(`${MODULE_ID} | camera pad failed to show`, err));

    if (isIllusiveMobileMode()) {
      console.info(`${MODULE_ID} | mobile sheets-only active | noCanvas=${game.settings.get("core", "noCanvas")}`);
      return;
    }

    const [{ bindLayoutHooks }, { bindPanelThemeHooks }] = await Promise.all([
      import("./lib/layout.mjs"),
      import("./lib/panel-theme.mjs")
    ]);
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
    const [render, tokenStatuses, actionBar] = await Promise.all([
      import("./lib/render.mjs"),
      import("./components/token-statuses/token-statuses.mjs"),
      import("./components/action-bar/action-bar.mjs")
    ]);
    render.bindRenderHooks();
    tokenStatuses.bindTokenStatusInteractions();
    actionBar.bindActionBarInteractions();
    bindCombatTurnHooks();
    render.refreshHud(render.ILLUSIVE_DND_RENDER.ALL);
  });
}

export default bindHudInit;
