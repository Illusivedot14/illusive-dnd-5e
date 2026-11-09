import { illusiveDndLocalize } from "./core.mjs";

export function illusiveDndSetting(settingKey, field) {
  return illusiveDndLocalize(`settings.${settingKey}.${field}`);
}

export function illusiveDndMenu(menuKey, field) {
  return illusiveDndLocalize(`settings.menus.${menuKey}.${field}`);
}

export function illusiveDndSectionLabel(sectionId) {
  return illusiveDndLocalize(`sections.${sectionId}`);
}

export function illusiveDndSettingChoices(settingKey, choiceKeys) {
  return Object.fromEntries(choiceKeys.map((choice) => [choice, illusiveDndSetting(settingKey, choice)]));
}

export function illusiveDndMainSettingLabels(settingKey) {
  return {
    name: illusiveDndSetting(settingKey, "name"),
    hint: illusiveDndSetting(settingKey, "hint")
  };
}
