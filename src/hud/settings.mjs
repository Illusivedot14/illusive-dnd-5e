import { MODULE_ID } from "../constants.mjs";
import { ILLUSIVE_DND_RENDER } from "./lib/render/scopes.mjs";
import { applyTurnTrackerMinimized } from "./components/turn-tracker/turn-tracker-minimize.mjs";
import { BossBar } from "./components/boss-bar/boss-bar-init.mjs";
import { applyPartyRailMinimized } from "./components/party-status/party-status-minimize.mjs";
import { applyActionBarMinimized } from "./components/action-bar/action-bar-minimize.mjs";
import { syncFoundryUiVisibility } from "./components/action-bar/action-bar-foundry-ui.mjs";
import {
  illusiveDndMainSettingLabels,
  illusiveDndSettingChoices,
  registerSettingsSubmenu
} from "../i18n/index.mjs";
import { DISPLAY_PROFILE_CHOICES } from "./lib/hud-bounds.mjs";
import { isIllusiveMobileMode } from "./lib/mobile-client.mjs";

function whenDesktop(load) {
  if (isIllusiveMobileMode()) return;
  void load().catch((err) => console.error(`${MODULE_ID} | desktop refresh failed`, err));
}

function repositionHud() {
  whenDesktop(async () => {
    const { repositionHud: run } = await import("./lib/render/core.mjs");
    run();
  });
}

function refreshHud(mask, options) {
  whenDesktop(async () => {
    const { refreshHud: run } = await import("./lib/render/core.mjs");
    run(mask, options);
  });
}

function applyLayoutVariables() {
  whenDesktop(async () => {
    const { applyLayoutVariables: run } = await import("./lib/layout.mjs");
    run();
  });
}

function applyPanelTheme() {
  whenDesktop(async () => {
    const { applyPanelTheme: run } = await import("./lib/panel-theme.mjs");
    run();
  });
}

function refreshCameraPad() {
  void import("./components/camera-pad/camera-pad.mjs")
    .then((m) => m.refreshCameraPad())
    .catch((err) => console.error(`${MODULE_ID} | camera pad failed`, err));
}
const DISPLAY_KEYS = ["displayProfile", "tabletopUser", "tabletopCameraUser"];

const PARTY_KEYS = [
  "partyMaxPortraits",
  "partyScroll"
];

const TURN_TRACKER_KEYS = [
  "turnTrackerMaxCards",
  "turnTrackerScroll",
  "showTurnCardHpNumbers",
  "hideDefeatedCombatants",
  "carouselTurnAnimation",
  "enableTurnHelpers"
];

const BOSS_BAR_KEYS = [
  "bossBarResetPosition",
  "bossBarCurrentHpPath",
  "bossBarMaxHpPath",
  "bossBarWoundsSystem"
];

const ACTION_BAR_KEYS = [
  "enableTokenStatuses",
  "hudAnimation",
  "configureDialog"
];

const CAMERA_PAD_KEYS = ["cameraPadVisibleTo"];

const MOBILE_KEYS = [
  "mobileClientMode",
  "mobileBackgroundEnabled",
  "mobileBackground",
  "mobileAccentColor",
  "mobileMuteChatPopups"
];

function registerHidden(key, config) {
  game.settings.register(MODULE_ID, key, {
    scope: "client",
    config: false,
    ...config
  });
}

function registerWorldHidden(key, config) {
  game.settings.register(MODULE_ID, key, {
    scope: "world",
    config: false,
    ...config
  });
}

function registerMain(key, config) {
  game.settings.register(MODULE_ID, key, {
    scope: "client",
    config: true,
    ...illusiveDndMainSettingLabels(key),
    ...config
  });
}

function registerWorld(key, config) {
  game.settings.register(MODULE_ID, key, {
    scope: "world",
    config: true,
    ...illusiveDndMainSettingLabels(key),
    ...config
  });
}

export function registerSettings() {
  const saveRollChoices = ["physical", "manual", "automated"];
  registerWorldHidden("playerSaveRolls", {
    type: Object,
    default: {}
  });
  registerSettingsSubmenu("playerMenu", {
    menuId: "player",
    titleKey: "settings.menus.player.title",
    icon: "fas fa-users",
    settingKeys: ["playerSaveRolls"],
    restricted: true
  });
  registerWorld("gmSaveRolls", {
    type: String,
    default: "automated",
    choices: illusiveDndSettingChoices("gmSaveRolls", saveRollChoices)
  });

  const layoutRefresh = () => repositionHud();
  const displayRefresh = () => {
    applyLayoutVariables();
    repositionHud();
  };
  const refreshParty = () => refreshHud(ILLUSIVE_DND_RENDER.PARTY);
  const refreshActionBar = () => refreshHud(ILLUSIVE_DND_RENDER.ACTION_BAR);
  const refreshActionBarLayout = () => refreshHud({ actionBar: true, layout: true });
  const refreshTurn = () => refreshHud(ILLUSIVE_DND_RENDER.TURN);
  const refreshTheme = () => {
    applyPanelTheme();
    refreshHud(ILLUSIVE_DND_RENDER.THEME);
  };

  const syncTabletop = () => {
    import("../tabletop/index.mjs")
      .then((mod) => {
        mod.syncTabletopClient();
        refreshCameraPad();
      })
      .catch((err) => console.error(`${MODULE_ID} | tabletop sync failed`, err));
  };

  registerHidden("displayProfile", {
    type: String,
    default: "auto",
    choices: illusiveDndSettingChoices("displayProfile", [...DISPLAY_PROFILE_CHOICES]),
    onChange: displayRefresh
  });

  registerWorldHidden("tabletopUser", {
    type: String,
    default: "",
    onChange: syncTabletop
  });

  registerWorldHidden("tabletopCameraUser", {
    type: String,
    default: "",
    onChange: syncTabletop
  });

  registerSettingsSubmenu("displayMenu", {
    menuId: "display",
    titleKey: "settings.menus.display.title",
    icon: "fas fa-desktop",
    settingKeys: DISPLAY_KEYS
  });

  const layoutNumber = (key, def, min, max, onChange = layoutRefresh, scope = "client") => {
    const register = scope === "world" ? registerWorldHidden : registerHidden;
    register(key, {
      type: Number,
      default: def,
      range: { min, max, step: 1 },
      onChange
    });
  };

  const registerBool = (key, { default: def = true, onChange } = {}) => {
    registerHidden(key, { type: Boolean, default: def, onChange });
  };

  registerHidden("showResourceBar", { type: Boolean, default: true, onChange: refreshActionBar });
  registerHidden("actionBarLastTokenId", { type: String, default: "", config: false });
  registerHidden("configureDialog", {
    type: Boolean,
    default: false,
    onChange: refreshActionBar
  });
  registerHidden("enableTokenStatuses", {
    type: Boolean,
    default: true,
    onChange: refreshActionBarLayout
  });
  registerHidden("showActionResourceStrip", { type: Boolean, default: true });
  registerHidden("partyRailAnimation", { type: Boolean, default: true });
  const refreshTurnResize = () => refreshHud(ILLUSIVE_DND_RENDER.TURN, { recenter: true });

  registerHidden("turnTrackerMaxCards", {
    type: Number,
    default: 9,
    range: { min: 1, max: 16, step: 1 },
    onChange: refreshTurnResize
  });
  registerBool("turnTrackerScroll", { default: true, onChange: refreshTurnResize });
  registerHidden("turnTrackerMinimized", {
    type: Boolean,
    default: false,
    onChange: () => applyTurnTrackerMinimized()
  });
  registerHidden("actionBarMinimized", {
    type: Boolean,
    default: false,
    onChange: () => {
      applyActionBarMinimized();
      syncFoundryUiVisibility();
      repositionHud();
    }
  });

  layoutNumber("partyOffsetX", 0, -300, 300, layoutRefresh, "world");
  layoutNumber("partyOffsetY", 0, -300, 300, layoutRefresh, "world");
  layoutNumber("partyScale", 100, 75, 125, layoutRefresh, "world");
  layoutNumber("tokenOffsetX", 0, -300, 300);
  layoutNumber("tokenOffsetY", 0, -300, 300);

  registerHidden("hudTheme", {
    type: String,
    choices: illusiveDndSettingChoices("hudTheme", ["bg3", "minimal"]),
    default: "bg3",
    onChange: refreshTheme
  });

  registerBool("showOrnateFrames", { onChange: refreshTheme });
  registerBool("showTokenAcSpeed", { onChange: refreshActionBar });
  registerBool("showTokenTempHp", { onChange: refreshActionBar });
  registerBool("colorHpBarByHealth", { onChange: refreshActionBar });
  registerBool("showYourTurnBanner", { onChange: refreshActionBar });
  registerBool("showResourceLabel", { onChange: refreshActionBar });

  registerHidden("tokenPanelOpacity", {
    type: Number,
    default: 100,
    range: { min: 50, max: 100, step: 5 },
    onChange: refreshTheme
  });

  registerHidden("partySortOrder", {
    type: String,
    choices: illusiveDndSettingChoices("partySortOrder", ["fixed", "initiative", "turnOrder", "alphabetical"]),
    default: "fixed",
    onChange: refreshParty
  });

  registerHidden("partyPlayerPrefs", {
    type: Object,
    default: {},
    onChange: () => {
      layoutRefresh();
      applyPartyRailMinimized();
      refreshParty();
    }
  });

  registerHidden("partyMinimized", {
    type: Boolean,
    default: false,
    onChange: () => applyPartyRailMinimized()
  });

  // Per-client action-bar minimize/expand animation (GM and players).
  registerHidden("hudAnimation", {
    type: Boolean,
    default: true,
    onChange: () => applyActionBarMinimized()
  });

  registerHidden("partyRailOpacity", {
    type: Number,
    default: 100,
    range: { min: 50, max: 100, step: 5 },
    onChange: refreshTheme
  });

  // Per-client so GMs and players can each set max visible / scrolling.
  registerHidden("partyMaxPortraits", {
    type: Number,
    default: 4,
    range: { min: 1, max: 8, step: 1 },
    onChange: refreshParty
  });
  registerHidden("partyScroll", {
    type: Boolean,
    default: true,
    onChange: refreshParty
  });

  registerWorldHidden("partySize", {
    type: String,
    choices: illusiveDndSettingChoices("partySize", ["compact", "normal", "large"]),
    default: "normal",
    onChange: refreshTheme
  });

  // World / GM-only turn tracker options.
  registerWorldHidden("hideDefeatedCombatants", { type: Boolean, default: false, onChange: refreshTurn });
  registerWorldHidden("showTurnCardHpNumbers", { type: Boolean, default: true, onChange: refreshTurn });
  registerBool("carouselTurnAnimation", { default: true });
  registerBool("enableTurnHelpers", { default: true });

  game.settings.register(MODULE_ID, "eventHistory", {
    name: "Recent Combat Events",
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  // Main config order (DOM also reordered): enable → menu for each feature.
  registerMain("enablePartyStatus", {
    type: Boolean,
    default: true,
    onChange: refreshParty
  });

  registerSettingsSubmenu("partyMenu", {
    menuId: "party",
    titleKey: "settings.menus.party.title",
    icon: "fas fa-users",
    settingKeys: PARTY_KEYS
  });

  registerMain("enableTurnTracker", {
    type: Boolean,
    default: true,
    onChange: refreshTurn
  });

  registerSettingsSubmenu("turnTrackerMenu", {
    menuId: "turnTracker",
    titleKey: "settings.menus.turnTracker.title",
    icon: "fas fa-circle-notch",
    settingKeys: TURN_TRACKER_KEYS
  });

  registerMain("enableActionBar", {
    type: Boolean,
    default: true,
    onChange: refreshActionBar
  });

  registerSettingsSubmenu("actionBarMenu", {
    menuId: "actionBar",
    titleKey: "settings.menus.actionBar.title",
    icon: "fas fa-hand-fist",
    settingKeys: ACTION_BAR_KEYS
  });

  registerMain("enableBossBar", {
    type: Boolean,
    default: true,
    onChange: () => BossBar.update()
  });

  registerSettingsSubmenu("bossBarMenu", {
    menuId: "bossBar",
    titleKey: "settings.menus.bossBar.title",
    icon: "fas fa-pastafarianism",
    settingKeys: BOSS_BAR_KEYS
  });

  registerMain("enableCameraPad", {
    type: Boolean,
    default: true,
    onChange: () => refreshCameraPad()
  });

  registerWorldHidden("cameraPadVisibleTo", {
    type: Array,
    default: null,
    onChange: () => refreshCameraPad()
  });

  registerSettingsSubmenu("cameraPadMenu", {
    menuId: "cameraPad",
    titleKey: "settings.menus.cameraPad.title",
    icon: "fas fa-up-down-left-right",
    settingKeys: CAMERA_PAD_KEYS,
    restricted: true
  });

  registerMain("enableMobileSheet", {
    type: Boolean,
    default: true,
    onChange: () => {
      import("./lib/mobile-client.mjs")
        .then((m) => m.syncMobileClientSettings())
        .catch((err) => console.error(`${MODULE_ID} | mobile sheet toggle failed`, err));
    }
  });

  registerHidden("mobileClientMode", {
    type: String,
    default: "auto",
    choices: illusiveDndSettingChoices("mobileClientMode", ["auto", "forceMobile", "forceDesktop"]),
    onChange: () => {
      import("./lib/mobile-client.mjs")
        .then((m) => m.syncMobileClientSettings())
        .catch((err) => console.error(`${MODULE_ID} | mobile mode change failed`, err));
    }
  });

  // Tracks whether Illusive set core.noCanvas so we can undo it on desktop.
  registerHidden("illusiveDndManagedNoCanvas", {
    type: Boolean,
    default: false
  });

  // Mobile backdrop + accent live in the Mobile Sheet Settings submenu.
  game.settings.register(MODULE_ID, "mobileBackgroundEnabled", {
    ...illusiveDndMainSettingLabels("mobileBackgroundEnabled"),
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
    onChange: () => {
      import("./components/mobile-sheet/mobile-background.mjs")
        .then((m) => m.renderMobileBackground())
        .catch((err) => console.error(`${MODULE_ID} | mobile background toggle failed`, err));
    }
  });

  game.settings.register(MODULE_ID, "mobileBackground", {
    ...illusiveDndMainSettingLabels("mobileBackground"),
    scope: "world",
    config: false,
    type: String,
    default: "",
    filePicker: "image",
    onChange: () => {
      import("./components/mobile-sheet/mobile-background.mjs")
        .then((m) => m.renderMobileBackground())
        .catch((err) => console.error(`${MODULE_ID} | mobile background change failed`, err));
    }
  });

  game.settings.register(MODULE_ID, "mobileMuteChatPopups", {
    ...illusiveDndMainSettingLabels("mobileMuteChatPopups"),
    scope: "client",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "mobileAccentColor", {
    ...illusiveDndMainSettingLabels("mobileAccentColor"),
    scope: "client",
    config: false,
    type: String,
    default: "#b794f6",
    onChange: (value) => {
      import("./components/mobile-sheet/mobile-accent.mjs")
        .then((m) => m.applyMobileAccentColor(value))
        .catch((err) => console.error(`${MODULE_ID} | mobile accent change failed`, err));
    }
  });

  registerSettingsSubmenu("mobileMenu", {
    menuId: "mobile",
    titleKey: "settings.menus.mobile.title",
    icon: "fas fa-mobile-screen",
    settingKeys: MOBILE_KEYS
  });

  // Ephemeral pulse: show connection QR overlay on one player's client.
  registerWorldHidden("connectionQrPulse", {
    type: Object,
    default: { show: false, targetId: null, at: 0 }
  });
}
