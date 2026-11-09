/**
 * Ability use command — economy gates, target requirements, fire.
 * HUD only supplies token/item ids + UI callbacks (cast slot pick, target pick).
 */

import { illusiveDnd } from "../i18n/index.mjs";
import {
  allowsExtraAttackSwing,
  shouldForceTargetPick,
  getRequiredTargetCount
} from "./ability.mjs";
import { isEconomyAvailable, resolveEconomySection } from "./economy.mjs";
import { useAbility } from "./action-data.mjs";
import { executeStandardAction } from "./standard-actions.mjs";
import { clearUserTargets } from "../foundry/token-actions.mjs";
import { isTokenInCombat } from "./action-economy.mjs";
import { recordGameLogEvent } from "./combat-game-log.mjs";

const ECONOMY_KEYS = Object.freeze({ action: "A", bonus: "B", reaction: "R" });

function resolveItemActivity(actor, itemId, activityId) {
  const item = actor?.items?.get?.(itemId) ?? null;
  const activity = item && activityId ? item.system?.activities?.get?.(activityId) : null;
  return { item, activity };
}

/**
 * Decide what the HUD should do next for an ability click.
 * @returns {Promise<
 *   | { ok: false, reason: string, notify?: string }
 *   | { ok: true, action: "pick-targets", pick: object }
 *   | { ok: true, action: "fire", result: boolean }
 * >}
 */
export async function planAndUseAbility({
  token,
  itemId,
  activityId = "",
  section = "action",
  activationType = "",
  isStandard = false,
  event = null,
  abilityName = "Ability",
  pickCastSlotLevel = null,
  targetCount = null
} = {}) {
  const actor = token?.actor;
  if (!actor) return { ok: false, reason: "no-actor" };

  const inCombat = isTokenInCombat(token);
  const economyType = resolveEconomySection(section, activationType);

  if (isStandard && inCombat && !isEconomyAvailable(actor, "action")) {
    return {
      ok: false,
      reason: "economy",
      notify: illusiveDnd.warning("economySpent", { type: "A" })
    };
  }

  const { item, activity } = isStandard
    ? { item: null, activity: null }
    : resolveItemActivity(actor, itemId, activityId);

  if (inCombat && economyType && !isEconomyAvailable(actor, economyType)) {
    if (isStandard || !allowsExtraAttackSwing(item, activity, economyType, actor)) {
      return {
        ok: false,
        reason: "economy",
        notify: illusiveDnd.warning("economySpent", {
          type: ECONOMY_KEYS[economyType] ?? economyType
        })
      };
    }
  }

  if (isStandard) {
    const actionId = String(itemId).replace("standard:", "");
    const selected = targetCount ?? (game.user?.targets?.size ?? 0);
    if (actionId === "help" && selected === 0) {
      return {
        ok: true,
        action: "pick-targets",
        pick: {
          tokenId: token.id,
          actorId: actor.id,
          itemId,
          activityId: "",
          section,
          spellLevel: null,
          isStandard: true,
          actionId,
          required: 1,
          abilityName
        }
      };
    }
    const used = await executeStandardAction(token, actionId);
    if (used) clearUserTargets();
    return { ok: true, action: "fire", result: Boolean(used) };
  }

  let spellLevel = null;
  if (item && (activity?.type === "cast" || item.type === "spell") && typeof pickCastSlotLevel === "function") {
    const pick = await pickCastSlotLevel(actor, item, activity);
    if (pick?.cancelled) {
      if (inCombat) {
        recordGameLogEvent({
          kind: "skip",
          label: item?.name || abilityName,
          detail: "Cast cancelled",
          actorUuid: actor.uuid ?? null,
          tokenUuid: token.document?.uuid ?? token.uuid ?? null
        });
      }
      return { ok: false, reason: "cancelled" };
    }
    spellLevel = pick?.level ?? null;
  }

  const required = getRequiredTargetCount(item, activity, actor);
  const forcePick = shouldForceTargetPick(item, activity);
  const selected = targetCount ?? (game.user?.targets?.size ?? 0);
  if (required && (forcePick || selected === 0)) {
    return {
      ok: true,
      action: "pick-targets",
      pick: {
        tokenId: token.id,
        actorId: actor.id,
        itemId,
        activityId,
        section,
        spellLevel,
        isStandard: false,
        actionId: null,
        required,
        abilityName: item?.name || abilityName
      }
    };
  }

  const used = await useAbility(token, itemId, activityId, event, section, { spellLevel });
  return { ok: true, action: "fire", result: used !== false };
}

/** After target pick confirms — fire without re-planning. */
export async function fireAfterTargetPick({
  token,
  pending
} = {}) {
  if (!token?.actor || !pending) return false;
  if (pending.isStandard) {
    const used = await executeStandardAction(token, pending.actionId);
    if (used) clearUserTargets();
    return Boolean(used);
  }
  const used = await useAbility(
    token,
    pending.itemId,
    pending.activityId,
    null,
    pending.section,
    { spellLevel: pending.spellLevel }
  );
  return used !== false;
}
