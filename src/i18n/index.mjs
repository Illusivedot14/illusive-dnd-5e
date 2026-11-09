/**
 * Illusive internationalization entry point.
 *
 *   import { illusiveDnd, initI18n, illusiveDndSetting } from "../i18n/index.mjs";
 */

export { initI18n, illusiveDndLocalize, illusiveDndResolve, illusiveDndCore } from "./core.mjs";
export {
  illusiveDndSetting,
  illusiveDndMenu,
  illusiveDndSectionLabel,
  illusiveDndSettingChoices,
  illusiveDndMainSettingLabels
} from "./labels.mjs";
export { illusiveDnd } from "./catalog.mjs";
export {
  bindI18nHooks,
  buildSettingField,
  registerSettingsSubmenu,
  IllusiveDndSubsettingsForm
} from "./settings-ui.mjs";
