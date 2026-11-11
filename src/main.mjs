/**
 * Illusive D&D 5e composition root.
 */

import { MODULE_ID } from "./constants.mjs";
import {
  registerDebugSettings
} from "./foundry/debug.mjs";
import { bindHudInit } from "./hud/boot.mjs";
import * as writeGateway from "./foundry/write-gateway.mjs";
import { bindGameLogJournal } from "./application/combat-game-log.mjs";
import { bindOwnerRolls } from "./application/dice.mjs";
import { isIllusiveMobileMode } from "./hud/lib/mobile-client.mjs";
import { ensureCombatRuntime } from "./foundry/combat-runtime.mjs";

bindHudInit();

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "workflowStore", {
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });
  game.settings.register(MODULE_ID, "reactionTimeout", {
    scope: "world",
    config: false,
    type: Number,
    default: 12
  });
  game.settings.register(MODULE_ID, "gmResolutionChat", {
    name: "GM resolution chat",
    hint: "When an activity finishes, whisper a short resolution summary to GMs only.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  registerDebugSettings();
  // Query handlers must exist before any other client asks.
  writeGateway.bindWriteGateway();
  bindGameLogJournal();
  bindOwnerRolls();
});

Hooks.once("ready", () => {
  if (isIllusiveMobileMode()) {
    console.info(`${MODULE_ID} | ready | combat deferred`);
    return;
  }
  void ensureCombatRuntime();
});
