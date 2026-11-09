/**
 * Illusive automation hooks.
 */

import { MODULE_ID } from "../constants.mjs";
import { route, listRoutes, markRouterStarted } from "./router.mjs";
import { refreshHud } from "../hud/lib/render/core.mjs";
import { ILLUSIVE_DND_RENDER } from "../hud/lib/render/scopes.mjs";
import {
  noteRoll,
  getActiveResolutionId,
  getResolution,
  resumePending,
  getLastTargetUuids,
  submitEvent
} from "../application/combat.mjs";
import {
  previewTokenMoveOpportunity,
  promptOpportunityReactions,
  stashPendingMove
} from "../application/opportunity-attack.mjs";
import { enforceCombatMovementBudget } from "../application/token-movement.mjs";
import { applyDamageRolls } from "../application/damage-apply.mjs";
import { wasDamageApplied, markDamageApplied } from "../application/resolve-activity.mjs";
import {
  handleTemplateCreated,
  isOwnedTemplateResolve
} from "../application/template-saves.mjs";
import { featureEnabled } from "../application/levels.mjs";
import { syncAllAuras } from "../application/aura-effects.mjs";
import { onCombatTurnChange } from "../application/overtime.mjs";
import {
  onCombatTurnChangeSpecial,
  expireOnCombatEnd,
  expireOnRest
} from "../application/special-duration.mjs";
import { clearPassiveRidersUsed } from "../application/feature-toggles.mjs";
import { bindIllusiveTemplatePlacer } from "../application/template-placer.mjs";
import { noteFall, takeFallFor, resolveFallDamage } from "../application/falling.mjs";
import { offerReadiedMoveTrigger } from "../application/readied-triggers.mjs";
import { publishTurnMoments, bindTriggerIndexHooks } from "../application/triggers/engine.mjs";
import { isPrimaryWriter } from "./gm-query.mjs";

const AURA_SYNC_DEBOUNCE_MS = 120;

let bound = false;

function serializeRolls(rolls) {
  return (rolls ?? []).map((roll) => ({
    formula: roll?.formula ?? null,
    total: Number.isFinite(roll?.total) ? roll.total : null,
    options: roll?.options ? { type: roll.options.type, properties: roll.options.properties } : null
  }));
}

function damageTargetUuids() {
  const id = getActiveResolutionId();
  const state = id ? getResolution(id) : null;
  const fromState = (state?.targets ?? []).map((t) => t.uuid).filter(Boolean);
  if (fromState.length) return fromState;
  const remembered = getLastTargetUuids();
  if (remembered.length) return remembered;
  return null;
}

export function bindAutomationHooks() {
  if (bound) return;
  bound = true;

  route("ready", "Resume pending combat resolutions", () => {
    void resumePending();
  }, { once: true });

  route("dnd5e.rollAttackV2", "Trace attack roll", (rolls) => {
    if (!featureEnabled("resolutionTrace")) return;
    void noteRoll({ kind: "attack", rolls: serializeRolls(rolls), summary: "Attack roll" });
  });

  // Saves / cast riders / anything Illusive did not drive in resolveActivity.
  route("dnd5e.rollDamageV2", "Apply damage rolls to targets", (rolls) => {
    const id = getActiveResolutionId();
    if (featureEnabled("resolutionTrace")) {
      void noteRoll({ kind: "damage", rolls: serializeRolls(rolls), summary: "Damage roll" });
    }
    // dnd5e plummet: fall damage belongs to the creature that fell, not the last targets.
    const fall = takeFallFor(rolls);
    if (fall) {
      void resolveFallDamage(fall, rolls);
      return;
    }
    // Template AoE save path applies scaled damage itself — do not full-apply here.
    if (isOwnedTemplateResolve()) return;
    if (wasDamageApplied(id)) return;
    void applyDamageRolls({
      rolls,
      targetUuids: damageTargetUuids(),
      clearTargets: true
    }).then((result) => {
      if (!(result?.applied > 0)) return;
      markDamageApplied(id);
      if (id && getResolution(id) && result.changes?.length) {
        void submitEvent({
          resolutionId: id,
          event: { type: "recordChange", changes: result.changes, summary: "Damage applied", rule: "combat.activity-use" }
        });
      }
    });
  });

  route("dnd5e.postUseActivity", "Refresh HUD after activity use", () => {
    refreshHud(ILLUSIVE_DND_RENDER.ACTION_BAR);
  });

  route(`${MODULE_ID}.economyChanged`, "Refresh HUD on economy change", () => {
    refreshHud(ILLUSIVE_DND_RENDER.ACTION_BAR);
  });

  route(`${MODULE_ID}.resolutionUpdated`, "Refresh HUD on resolution update", () => {
    refreshHud(ILLUSIVE_DND_RENDER.ACTION_BAR);
  });

  route("preUpdateToken", "Block over-budget combat movement", (tokenDoc, changes, options) => {
    if (!enforceCombatMovementBudget(tokenDoc, changes, options)) return false;
  });

  route("preUpdateToken", "Hold leave-reach moves for opportunity attacks", (tokenDoc, changes, options) => {
    if (!featureEnabled("opportunityAttacks")) return;
    if (changes?.x == null && changes?.y == null) return;
    const preview = previewTokenMoveOpportunity({ tokenDoc, changes, options });
    if (!preview.provoked) return;
    stashPendingMove(tokenDoc, changes, options);
    void promptOpportunityReactions(preview);
    return false;
  });

  // Mechanical auras (Aura of Protection, Courage, Devotion): one writer, coalesced.
  let auraTimer = null;
  const syncAuras = () => {
    if (!isPrimaryWriter()) return;
    if (auraTimer) clearTimeout(auraTimer);
    auraTimer = setTimeout(() => {
      auraTimer = null;
      void syncAllAuras();
    }, AURA_SYNC_DEBOUNCE_MS);
  };
  route("canvasReady", "Sync mechanical auras", syncAuras);
  route("updateToken", "Resync auras on move", (doc, changes) => {
    if (changes?.x != null || changes?.y != null || changes?.elevation != null) syncAuras();
  });
  route("updateToken", "Remember dnd5e falls for fall damage", (doc, _changes, options, userId) => {
    noteFall(doc, options, userId);
  });
  route("updateToken", "Release readied move triggers", (doc, changes, options, userId) => {
    void offerReadiedMoveTrigger(doc, changes, options, userId);
  });
  route("createToken", "Resync auras on token create", syncAuras);
  route("deleteToken", "Resync auras on token delete", syncAuras);
  route("updateActor", "Resync auras on actor change", syncAuras);
  route("createItem", "Resync auras when features change", syncAuras);
  route("deleteItem", "Resync auras when features change", syncAuras);
  const isAuraCopy = (effect) => effect?.flags?.[MODULE_ID]?.kind === "aura-buff";
  for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
    route(hook, "Resync auras when effects change", (effect) => {
      if (!isAuraCopy(effect)) syncAuras();
    });
  }
  route("updateCombat", "Resync combat-only auras", syncAuras);
  route("deleteCombat", "Resync combat-only auras", syncAuras);
  route("combatTurnChange", "Resync auras on turn change", syncAuras);

  // Over-time ticks + special durations on turn change. combatTurnChange fires on
  // every client; only the primary writer ticks, or damage would land once per client.
  route("combatTurnChange", "Over-time and special durations", (combat, prior, current) => {
    if (!isPrimaryWriter()) return;
    void (async () => {
      await onCombatTurnChangeSpecial(combat, prior, current);
      await onCombatTurnChange(combat, prior, current);
      const currentActor = current?.actor ?? combat?.combatant?.actor;
      if (currentActor) {
        try {
          await currentActor.unsetFlag?.("illusive-dnd-5e", "recklessOpen");
        } catch { /* ignore */ }
        await clearPassiveRidersUsed(currentActor);
      }
      await publishTurnMoments(combat, prior, current);
      syncAuras();
    })();
  });

  route("deleteCombat", "Expire combatEnd special durations", (combat) => {
    if (!isPrimaryWriter()) return;
    void expireOnCombatEnd(combat);
  });

  route("dnd5e.restCompleted", "Expire rest special durations", (actor, result) => {
    void expireOnRest(actor, { long: Boolean(result?.long) });
  });

  // Declarations are indexed per actor; item/effect edits invalidate that actor only.
  bindTriggerIndexHooks(route);

  // DAS-style placer: Illusive owns the preview and creates the area Region on confirm.
  bindIllusiveTemplatePlacer();

  // Area placed outside a driven use → auto saves for tokens in the area
  route("createRegion", "Auto-save tokens in spell areas", (regionDoc, _options, userId) => {
    void handleTemplateCreated(regionDoc, { userId });
  });

  markRouterStarted();
}

export { listRoutes };
