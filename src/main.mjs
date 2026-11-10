/**
 * Illusive D&D 5e composition root.
 */

import { MODULE_ID } from "./constants.mjs";
import { bindAutomationHooks, listRoutes } from "./foundry/hooks.mjs";
import {
  registerDebugSettings,
  isDebugLoggingEnabled,
  debugLog,
  DEBUG_CHANNELS
} from "./foundry/debug.mjs";
import { bindHudInit } from "./hud/boot.mjs";
import * as combatApp from "./application/combat.mjs";
import * as activityApp from "./application/activity.mjs";
import * as economyApp from "./application/economy.mjs";
import * as movementApp from "./application/movement.mjs";
import * as perceptionApp from "./application/perception.mjs";
import * as lootApp from "./application/loot.mjs";
import * as opportunityAttackApp from "./application/opportunity-attack.mjs";
import * as coverApp from "./application/cover.mjs";
import {
  AUTOMATION_LEVELS,
  getAutomationLevel,
  levelFeatures,
  featureEnabled
} from "./application/levels.mjs";
import { getRule, RULES } from "./rules/catalog.mjs";
import { createSpellOmnibusNpc } from "./application/dev-fixtures.mjs";
import * as writeGateway from "./foundry/write-gateway.mjs";
import { isPrimaryWriter, activeGm } from "./foundry/gm-query.mjs";
import { bindGameLogJournal, journalChanges } from "./application/combat-game-log.mjs";
import { bindOwnerRolls } from "./application/dice.mjs";
import { bindAnimations } from "./animation/bind.mjs";
import * as triggerEngine from "./application/triggers/engine.mjs";
import { allDeclarations, invalidateAll as refreshTriggerIndex } from "./application/triggers/index.mjs";
import { declarationErrors } from "./domain/triggers/declarations.mjs";
import { MOMENTS } from "./domain/triggers/moments.mjs";
import { STEPS } from "./domain/triggers/steps.mjs";
import { CONTENT } from "./content/declarations.mjs";

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
  bindAutomationHooks();
  bindAnimations();

  const mod = game.modules.get(MODULE_ID);
  if (mod) {
    mod.api = {
      ...(mod.api ?? {}),
      combat: combatApp,
      activity: activityApp,
      economy: economyApp,
      movement: movementApp,
      perception: perceptionApp,
      loot: lootApp,
      opportunityAttack: opportunityAttackApp,
      cover: coverApp,
      levels: { AUTOMATION_LEVELS, getAutomationLevel, levelFeatures, featureEnabled },
      rules: { getRule, RULES },
      writes: { ...writeGateway, isPrimaryWriter, activeGm },
      journal: { journalChanges },
      triggers: {
        ...triggerEngine,
        declarationsOn: allDeclarations,
        refresh: refreshTriggerIndex,
        validate: declarationErrors,
        MOMENTS,
        STEPS,
        CONTENT
      },
      diagnostics: {
        listRoutes,
        debugLog,
        isDebugLoggingEnabled,
        DEBUG_CHANNELS
      },
      fixtures: { createSpellOmnibusNpc }
    };
  }

  console.info(`${MODULE_ID} | ready | routes=${listRoutes().length}`);
});
