import { MODULE_ID } from "../../../constants.mjs";
import { BOSS_BAR_FLAG, getLegacyBossBarActors, isLegacyBossBarActive } from "./boss-bar-paths.mjs";
import { initBossBarConfig } from "./boss-bar-config.mjs";
import { migrateBossBarSettings, registerBossBarSettings } from "./boss-bar-settings.mjs";
import { setBossBarHooks, BossBar } from "./app/BossBar.mjs";
import { BossBarSocket } from "./lib/socket.mjs";

export function initBossBar() {
  registerBossBarSettings();
  initBossBarConfig();
  setBossBarHooks();

  BossBarSocket.register("cameraPan", ({ uuid, scale, duration }) => {
    const token = fromUuidSync(uuid);
    if (token.parent !== canvas?.scene) return;
    canvas.animatePan({
      ...token.object.center,
      scale,
      duration
    });
  });
}

/** Copy scene actor lists from the legacy bossbar module when ILLUSIVE_DND has none. */
export async function migrateBossBarSceneFlags() {
  if (!game.user.isGM || !isLegacyBossBarActive()) return;

  for (const scene of game.scenes) {
    const legacy = getLegacyBossBarActors(scene);
    const current = scene.getFlag(MODULE_ID, BOSS_BAR_FLAG);
    if (legacy.length && !current?.length) {
      await scene.setFlag(MODULE_ID, BOSS_BAR_FLAG, legacy);
    }
  }
}

export async function onBossBarReady() {
  await migrateBossBarSettings();
  await migrateBossBarSceneFlags();
  BossBar.update();
}

export { BossBar };
