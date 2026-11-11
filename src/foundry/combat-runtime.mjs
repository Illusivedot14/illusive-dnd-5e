/**
 * One startup for the combat engine, its hooks, and animations.
 * Desktop starts it on ready. A sheets-only phone starts it on the first
 * use, attack, damage roll, or incoming reaction.
 */

import { MODULE_ID } from "../constants.mjs";
import { bindReactionSocket, deliverReaction } from "./reaction-socket.mjs";

let pending = null;
let lazyBound = false;

export function ensureCombatRuntime() {
  if (!pending) {
    pending = start().catch((err) => {
      pending = null;
      throw err;
    });
  }
  return pending;
}

/** Activity use and the target list. Loads the runtime first so hooks are listening. */
export async function loadCombatUse() {
  await ensureCombatRuntime();
  const [activity, ability, reactionContext, targeting] = await Promise.all([
    import("../application/activity.mjs"),
    import("../application/ability.mjs"),
    import("../application/reaction-context.mjs"),
    import("../application/targeting.mjs")
  ]);
  return {
    useActivityFromHud: activity.useActivityFromHud,
    requiresCanvasTargets: ability.requiresCanvasTargets,
    getRequiredTargetCount: ability.getRequiredTargetCount,
    findTokenForActor: reactionContext.findTokenForActor,
    listTargetsInRange: targeting.listTargetsInRange,
    tokenId: targeting.tokenId
  };
}

/**
 * Listen for reaction traffic without loading the engine.
 * The first prompt or decision starts the runtime, then the real handler runs.
 */
export function bindLazyReactionRelay() {
  if (lazyBound) return;
  lazyBound = true;
  const wake = (kind, data) => {
    void ensureCombatRuntime()
      .then(() => deliverReaction(kind, data))
      .catch((err) => console.error(`${MODULE_ID} | combat runtime failed`, err));
  };
  bindReactionSocket({
    onPrompt: (data) => wake("prompt", data),
    onDecision: (data) => wake("decision", data)
  });
}

async function start() {
  const [
    hooks,
    animations,
    reactions,
    combatApp,
    activityApp,
    economyApp,
    movementApp,
    perceptionApp,
    lootApp,
    opportunityAttackApp,
    coverApp,
    levels,
    rules,
    fixtures,
    writeGateway,
    gmQuery,
    gameLog,
    triggerEngine,
    triggerIndex,
    declarations,
    moments,
    steps,
    content,
    debug
  ] = await Promise.all([
    import("./hooks.mjs"),
    import("../animation/bind.mjs"),
    import("../application/reactions/window.mjs"),
    import("../application/combat.mjs"),
    import("../application/activity.mjs"),
    import("../application/economy.mjs"),
    import("../application/movement.mjs"),
    import("../application/perception.mjs"),
    import("../application/loot.mjs"),
    import("../application/opportunity-attack.mjs"),
    import("../application/cover.mjs"),
    import("../application/levels.mjs"),
    import("../rules/catalog.mjs"),
    import("../application/dev-fixtures.mjs"),
    import("./write-gateway.mjs"),
    import("./gm-query.mjs"),
    import("../application/combat-game-log.mjs"),
    import("../application/triggers/engine.mjs"),
    import("../application/triggers/index.mjs"),
    import("../domain/triggers/declarations.mjs"),
    import("../domain/triggers/moments.mjs"),
    import("../domain/triggers/steps.mjs"),
    import("../content/declarations.mjs"),
    import("./debug.mjs")
  ]);

  hooks.bindAutomationHooks();
  animations.bindAnimations();
  reactions.bindReactionRelay();

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
      levels: {
        AUTOMATION_LEVELS: levels.AUTOMATION_LEVELS,
        getAutomationLevel: levels.getAutomationLevel,
        levelFeatures: levels.levelFeatures,
        featureEnabled: levels.featureEnabled
      },
      rules: { getRule: rules.getRule, RULES: rules.RULES },
      writes: { ...writeGateway, isPrimaryWriter: gmQuery.isPrimaryWriter, activeGm: gmQuery.activeGm },
      journal: { journalChanges: gameLog.journalChanges },
      triggers: {
        ...triggerEngine,
        declarationsOn: triggerIndex.allDeclarations,
        refresh: triggerIndex.invalidateAll,
        validate: declarations.declarationErrors,
        MOMENTS: moments.MOMENTS,
        STEPS: steps.STEPS,
        CONTENT: content.CONTENT
      },
      diagnostics: {
        listRoutes: hooks.listRoutes,
        debugLog: debug.debugLog,
        isDebugLoggingEnabled: debug.isDebugLoggingEnabled,
        DEBUG_CHANNELS: debug.DEBUG_CHANNELS
      },
      fixtures: { createSpellOmnibusNpc: fixtures.createSpellOmnibusNpc }
    };
  }

  console.info(`${MODULE_ID} | combat runtime | routes=${hooks.listRoutes().length}`);
}
