import { MODULE_ID, MODULE_PATH } from "../../../constants.mjs";

export const BOSS_BAR_PATH = `${MODULE_PATH}/src/hud/components/boss-bar`;
export const BOSS_BAR_FLAG = "bossBarActors";

const LEGACY_BOSSBAR_MODULE = "bossbar";

/** True only when the standalone bossbar module is installed and enabled. */
export function isLegacyBossBarActive() {
  return !!game.modules.get(LEGACY_BOSSBAR_MODULE)?.active;
}

/** Scene actor list from the legacy bossbar module, or [] when it is not active. */
export function getLegacyBossBarActors(scene) {
  if (!isLegacyBossBarActive()) return [];
  return scene.getFlag(LEGACY_BOSSBAR_MODULE, "actors") ?? [];
}

/** Prefer ILLUSIVE_DND scene flags; fall back to legacy bossbar flags when that module is active. */
export function getSceneBossBarActors(scene) {
  const illusiveDnd = scene.getFlag(MODULE_ID, BOSS_BAR_FLAG) ?? [];
  if (illusiveDnd.length) return illusiveDnd;
  return getLegacyBossBarActors(scene);
}

/** @param {string} rel Path under resources/ */
export function bossBarResource(rel) {
  return `${BOSS_BAR_PATH}/resources/${rel}`;
}

/** @param {string} name Template filename */
export function bossBarTemplate(name) {
  return `${BOSS_BAR_PATH}/templates/${name}`;
}
