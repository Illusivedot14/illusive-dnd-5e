import { MODULE_ID } from "../../../constants.mjs";

export { MODULE_ID };

export const BOSS_BAR_I18N = `${MODULE_ID}.bossBar`;

export const BAR_STYLES = {
  CLASSIC: 0,
  MATCHING_IMAGES: 1
};

export const BAR_STYLE_SELECT = {
  0: `${BOSS_BAR_I18N}.settings.barStyle.classic`,
  1: `${BOSS_BAR_I18N}.settings.barStyle.matchingImages`
};

export const TEXT_ALIGN = {
  left: `${BOSS_BAR_I18N}.settings.textAlign.left`,
  center: `${BOSS_BAR_I18N}.settings.textAlign.center`,
  right: `${BOSS_BAR_I18N}.settings.textAlign.right`
};
