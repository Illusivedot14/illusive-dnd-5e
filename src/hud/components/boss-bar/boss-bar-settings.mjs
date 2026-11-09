import { MODULE_ID } from "../../../constants.mjs";
import { BOSS_BAR_I18N } from "./boss-bar-main.mjs";
import { bossBarResource, isLegacyBossBarActive } from "./boss-bar-paths.mjs";
import { BarStyleConfiguration } from "./app/BarStyleConfiguration.mjs";

function refreshBossBar() {
  import("./app/BossBar.mjs").then(({ BossBar }) => BossBar.update());
}

export const DEFAULT_BAR_STYLE = {
  name: "Classic - Red",
  id: "default",
  background: bossBarResource("Dark.webp"),
  bar: bossBarResource("Blood.webp"),
  foreground: "",
  tempBarColor: "#7e7e7e",
  tempBarAlpha: 0.5,
  barHeight: 20,
  textSize: 20,
  textAlign: "left",
  type: 0,
  font: "Times New Roman"
};

const PREDEFINED_BAR_STYLES = [
  {
    ...DEFAULT_BAR_STYLE,
    name: "Classic - Ice",
    id: "default-ice",
    bar: bossBarResource("Ice.webp")
  },
  {
    ...DEFAULT_BAR_STYLE,
    name: "Classic - Grass",
    id: "default-grass",
    bar: bossBarResource("Grass.webp")
  },
  {
    ...DEFAULT_BAR_STYLE,
    name: "Classic - Oak",
    id: "default-oak",
    bar: bossBarResource("Oak.webp")
  },
  {
    ...DEFAULT_BAR_STYLE,
    name: "Evil",
    id: "evil",
    foreground: bossBarResource("matching-images/evil/fg.png"),
    bar: bossBarResource("matching-images/evil/bar.png"),
    background: bossBarResource("matching-images/evil/bg.png"),
    type: 1
  },
  {
    ...DEFAULT_BAR_STYLE,
    name: "Gears",
    id: "gears",
    foreground: bossBarResource("matching-images/gears/fg.webp"),
    bar: bossBarResource("matching-images/gears/bar.webp"),
    background: bossBarResource("matching-images/gears/bg.webp"),
    type: 1
  },
  {
    ...DEFAULT_BAR_STYLE,
    name: "Ooze",
    id: "ooze",
    foreground: bossBarResource("matching-images/ooze/fg.webp"),
    bar: bossBarResource("matching-images/ooze/bar.webp"),
    background: bossBarResource("matching-images/ooze/bg.webp"),
    type: 1
  },
  {
    ...DEFAULT_BAR_STYLE,
    name: "Royal",
    id: "royal",
    foreground: bossBarResource("matching-images/royal/fg.png"),
    bar: bossBarResource("matching-images/royal/bar.png"),
    background: bossBarResource("matching-images/royal/bg.png"),
    type: 1
  },
  {
    ...DEFAULT_BAR_STYLE,
    name: "Segmented",
    id: "segmented",
    foreground: bossBarResource("matching-images/segmented/fg.png"),
    bar: bossBarResource("matching-images/segmented/bar.png"),
    background: bossBarResource("matching-images/segmented/bg.png"),
    type: 1
  },
  {
    ...DEFAULT_BAR_STYLE,
    name: "Steampunk",
    id: "steampunk",
    foreground: bossBarResource("matching-images/steampunk/fg.png"),
    bar: bossBarResource("matching-images/steampunk/bar.png"),
    background: bossBarResource("matching-images/steampunk/bg.png"),
    type: 1
  }
];

const LEGACY_BOSSBAR_MODULE = "bossbar";

const LEGACY_SETTING_MAP = {
  barStyles: "bossBarStyles",
  barPosition: "bossBarPosition",
  resetPosition: "bossBarResetPosition",
  currentHpPath: "bossBarCurrentHpPath",
  maxHpPath: "bossBarMaxHpPath",
  woundsSystem: "bossBarWoundsSystem"
};

export function registerBossBarSettings() {
  const settings = {
    bossBarStyles: {
      scope: "world",
      config: false,
      type: Array,
      default: [{ ...DEFAULT_BAR_STYLE }, ...PREDEFINED_BAR_STYLES],
      onChange: () => refreshBossBar()
    },
    bossBarPosition: {
      scope: "client",
      type: Object,
      default: {},
      config: false
    },
    bossBarResetPosition: {
      scope: "client",
      config: false,
      type: Boolean,
      default: false,
      name: `${BOSS_BAR_I18N}.settings.resetPosition.name`,
      hint: `${BOSS_BAR_I18N}.settings.resetPosition.hint`,
      onChange: (value) => {
        if (value) import("./app/BossBar.mjs").then(({ BossBar }) => BossBar.resetPosition());
      }
    },
    bossBarCurrentHpPath: {
      scope: "world",
      config: false,
      type: String,
      default: "attributes.hp.value",
      name: `${BOSS_BAR_I18N}.settings.currentHpPath.name`,
      hint: `${BOSS_BAR_I18N}.settings.currentHpPath.hint`,
      onChange: () => refreshBossBar()
    },
    bossBarMaxHpPath: {
      scope: "world",
      config: false,
      type: String,
      default: "attributes.hp.max",
      name: `${BOSS_BAR_I18N}.settings.maxHpPath.name`,
      hint: `${BOSS_BAR_I18N}.settings.maxHpPath.hint`,
      onChange: () => refreshBossBar()
    },
    bossBarWoundsSystem: {
      scope: "world",
      config: false,
      type: Boolean,
      default: false,
      name: `${BOSS_BAR_I18N}.settings.woundsSystem.name`,
      hint: `${BOSS_BAR_I18N}.settings.woundsSystem.hint`,
      onChange: () => refreshBossBar()
    }
  };

  for (const [key, value] of Object.entries(settings)) {
    game.settings.register(MODULE_ID, key, value);
  }

  game.settings.registerMenu(MODULE_ID, "bossBarStyleConfiguration", {
    name: `${BOSS_BAR_I18N}.settings.BarStyleConfiguration.name`,
    label: `${BOSS_BAR_I18N}.settings.BarStyleConfiguration.label`,
    icon: "fas fa-paint-brush",
    type: BarStyleConfiguration,
    restricted: true
  });
}

export function getBossBarSetting(key) {
  const mapped = LEGACY_SETTING_MAP[key] ?? key;
  return game.settings.get(MODULE_ID, mapped);
}

export async function setBossBarSetting(key, value) {
  const mapped = LEGACY_SETTING_MAP[key] ?? key;
  return game.settings.set(MODULE_ID, mapped, value);
}

/** Copy world/client settings from a standalone bossbar install when present. */
export async function migrateBossBarSettings() {
  if (!isLegacyBossBarActive()) return;

  for (const [legacyKey, illusiveDndKey] of Object.entries(LEGACY_SETTING_MAP)) {
    try {
      const legacy = game.settings.get(LEGACY_BOSSBAR_MODULE, legacyKey);
      const current = game.settings.get(MODULE_ID, illusiveDndKey);
      const defaults = game.settings.settings.get(`${MODULE_ID}.${illusiveDndKey}`)?.default;
      if (JSON.stringify(legacy) !== JSON.stringify(defaults)) {
        await game.settings.set(MODULE_ID, illusiveDndKey, legacy);
      }
    } catch {
      /* legacy setting missing */
    }
  }
}

