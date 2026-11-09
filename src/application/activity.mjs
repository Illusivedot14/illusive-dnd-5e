/**
 * Launch and target-resolution for HUD-driven activities.
 */

import { settingOn } from "../hud/lib/hud-settings.mjs";
import { illusiveDnd } from "../i18n/index.mjs";
import {
  getLinkedSpell,
  getTargetConfig,
  listActivities,
  requiresCanvasTargets
} from "./ability.mjs";
import { clearUserTargets } from "../foundry/token-actions.mjs";
import { getAbilityAttackCount, isSingleUseMultiHit, padTargetUuids } from "../domain/combat/attack-count.mjs";
import { getConcentrationEffect } from "../foundry/dnd5e-adapter.mjs";
import { startHudAction, getResolution } from "./combat.mjs";
import { evaluate as evaluateCover } from "./cover.mjs";
import { featureEnabled } from "./levels.mjs";
import { checkAbilityRange } from "./targeting.mjs";

export { getConcentrationEffect };
export {
  activityRangeFeet,
  checkAbilityRange,
  resolveRangeSpec
} from "./targeting.mjs";

export function getEffectiveTargetType(activity) {
  let effectiveTargetType = activity?.target?.affects?.type ?? activity?.target?.type;
  if (activity?.type !== "cast") return effectiveTargetType;

  const override = activity._source?.target?.override ?? activity.target?.override;
  if (override) return effectiveTargetType;

  const spellActivities = listActivities(getLinkedSpell(activity));
  const spellActivity = spellActivities.find((entry) => entry.canUse) ?? spellActivities[0];
  return spellActivity?.target?.affects?.type ?? spellActivity?.target?.type ?? effectiveTargetType;
}

function tokenUuid(token) {
  return token?.document?.uuid ?? token?.uuid ?? null;
}

export function resolveTriggerTokenUuid(options = {}, existing = null) {
  return options.workflow?.tokenUuid
    ?? options.triggerTokenUuid
    ?? options.tokenUuid
    ?? existing?.triggerTokenUuid
    ?? existing?.options?.workflow?.tokenUuid
    ?? existing?.options?.triggerTokenUuid
    ?? existing?.options?.tokenUuid
    ?? null;
}

export function resolveActivityTargetUuids(token, activity, context = {}, section = null) {
  if (!token) return [];

  const targetConfig = getTargetConfig(activity?.item ?? activity?.parent, activity);
  if (targetConfig?.template?.type) return [];

  const effectiveTargetType = getEffectiveTargetType(activity);
  if (effectiveTargetType === "self") {
    const selfUuid = tokenUuid(token);
    return selfUuid ? [selfUuid] : [];
  }

  const triggerUuid = resolveTriggerTokenUuid(context.options ?? {}, context);
  if ((context.reactionKeys || section === "reaction") && triggerUuid) return [triggerUuid];
  if (Array.isArray(context.targetUuids)) return [...context.targetUuids];

  const targets = [...(game.user.targets ?? [])];
  if (!targets.length) return [];

  const uuids = targets.map((entry) => entry.document?.uuid ?? entry.uuid).filter(Boolean);
  const item = activity?.item ?? activity?.parent;
  if (isSingleUseMultiHit(item, activity)) {
    return padTargetUuids(uuids, getAbilityAttackCount(token.actor, item, activity));
  }
  return uuids;
}

export function buildHudUseOptions(token, activity, section, context = {}) {
  const targetUuids = resolveActivityTargetUuids(token, activity, context, section);
  const isReaction = section === "reaction";
  return foundry.utils.mergeObject({
    configureDialog: isReaction ? true : settingOn("configureDialog"),
    targetUuids,
    isReaction
  }, isReaction ? (context.options ?? {}) : {});
}

function validateHudTargets(token, item, activity, section) {
  if (section === "reaction") return { ok: true };
  if (!requiresCanvasTargets(item, activity)) return { ok: true };

  const count = game.user.targets?.size ?? 0;
  if (count === 0) {
    ui.notifications.warn(illusiveDnd.warning("needTarget"));
    return { ok: false };
  }

  const range = checkAbilityRange(token, item, activity);
  if (!range.inRange) {
    ui.notifications.warn(range.reason === "noLOS" ? illusiveDnd.target("noLOS") : illusiveDnd.target("outOfRange"));
    return { ok: false };
  }

  if (featureEnabled("coverMatrix") && activity?.type === "attack") {
    const attackerUuid = tokenUuid(token);
    for (const target of game.user.targets ?? []) {
      const targetUuid = tokenUuid(target);
      const cover = evaluateCover({ attackerUuid, targetUuid });
      if (cover?.level === "total" || cover?.canTarget === false) {
        ui.notifications.warn(illusiveDnd.target("totalCover"));
        return { ok: false };
      }
    }
  }
  return { ok: true };
}

/** Launch an activity from the HUD via the combat application. */
export async function useActivityFromHud(token, item, activity, section, event, context = {}, options = {}) {
  if (options.validateTargets !== false && activity && !validateHudTargets(token, item, activity, section).ok) {
    return false;
  }

  const useOptions = buildHudUseOptions(token, activity, section, context);
  if (options.spellLevel != null) useOptions.spellLevel = options.spellLevel;

  const resolutionId = await startHudAction({ token, item, activity, section, event, useOptions });
  if (options.clearTargets === true) clearUserTargets();
  const phase = getResolution(resolutionId)?.phase;
  return phase !== "cancelled" || getResolution(resolutionId)?.cancelReason === "countered";
}

export function buildTargetListLabel() {
  const targets = [...(game.user.targets ?? [])];
  if (!targets.length) return "";
  return illusiveDnd.target("list", { names: targets.map((t) => t.name).join(", ") });
}
