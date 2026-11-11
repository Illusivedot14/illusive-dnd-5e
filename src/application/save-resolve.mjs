/**
 * Save activity resolution using only dnd5e APIs:
 *   actor.rollSavingThrow → activity.rollDamage → actor.applyDamage
 *
 * Same apply shape as ChatMessage5e.applyChatCardDamage.
 */

import {
  damageFactorOnSave,
  evaluateSaveVsDc
} from "../domain/combat/save-outcome.mjs";
import { damagesFromRolls, applyDamageWithTrail } from "./damage-apply.mjs";
import { applyActivityEffects } from "./effect-apply.mjs";
import { evaluateForCombat as evaluateCover } from "./cover.mjs";
import { bakeCoverIntoDexSave } from "../domain/combat/cover.mjs";
import { collectSaveModifiers, evasionDamageFactor, consumeRollAdvantage } from "./roll-modifiers.mjs";
import { beginOwnedResolve, endOwnedResolve } from "./owned-resolve.mjs";
import { tokenFromUuid } from "../foundry/token-lookup.mjs";
import { isElementalType } from "../domain/combat/activity-kind.mjs";
import { openReactionWindow, damageTargetsFromPatches } from "./reactions/window.mjs";
import { rollAsOwner } from "./dice.mjs";

function saveAbility(activity) {
  const set = activity?.save?.ability;
  if (!set) return "dex";
  if (typeof set.first === "function") return set.first() ?? "dex";
  if (Array.isArray(set)) return set[0] ?? "dex";
  if (typeof set[Symbol.iterator] === "function") return [...set][0] ?? "dex";
  return "dex";
}

function saveDc(activity) {
  const value = Number(activity?.save?.dc?.value);
  return Number.isFinite(value) ? value : null;
}

/**
 * Cover bonus for Dexterity saves (half +2 / three-quarters +5).
 * Origin is the spell point of origin (caster token or template).
 * Soft half/¾ band prompts the GM when ambiguous.
 */
export async function coverBonusForSave({ ability, originUuid, targetUuid } = {}) {
  if (!originUuid || !targetUuid) return { bonus: 0, cover: null };
  const cover = await evaluateCover({ attackerUuid: originUuid, targetUuid });
  return { bonus: bakeCoverIntoDexSave(ability, cover), cover };
}

/** Save effects that Countercharm (2024) can answer: Charmed or Frightened. */
export function appliesCharmOrFear(activity) {
  const CONDITIONS = ["charmed", "frightened"];
  for (const entry of activity?.effects ?? []) {
    const effect = entry?.effect ?? activity.item?.effects?.get?.(entry?._id);
    const statuses = effect?.statuses;
    if (statuses && CONDITIONS.some((s) => statuses.has?.(s) || (Array.isArray(statuses) && statuses.includes(s)))) {
      return true;
    }
  }
  return /charm|fear|frighten/i.test(String(activity?.item?.name ?? ""));
}

/**
 * dnd5e Actor5e.rollSavingThrow — same args as SaveActivity.#rollSave.
 * With a resolution and the saver's token, opens on-save-success (Silvery Barbs: reroll,
 * keep the lower) or on-save-fail (Countercharm: reroll with advantage, keep the new roll).
 */
export async function rollActivitySave(actor, activity, {
  event = null,
  coverBonus = 0,
  resolutionId = null,
  tokenUuid = null,
  charmOrFear = false
} = {}) {
  if (!actor || typeof actor.rollSavingThrow !== "function") {
    return { total: null, success: false, reason: "no-roller", coverBonus: 0 };
  }
  const ability = saveAbility(activity);
  const dc = saveDc(activity);
  const mods = collectSaveModifiers({ actor, ability });
  const bonus = Number(coverBonus) || 0;
  const rollConfig = {
    event,
    ability,
    target: Number.isFinite(dc) ? dc : undefined
  };
  if (mods.disadvantage && !mods.advantage) {
    rollConfig.disadvantage = true;
    rollConfig.advantage = false;
  } else if (mods.advantage && !mods.disadvantage) {
    rollConfig.advantage = true;
    rollConfig.disadvantage = false;
  }
  if (bonus) {
    rollConfig.parts = [String(bonus)];
  }

  const rollOnce = async (overrides = {}) => {
    const roll = await rollAsOwner(actor, "save", { ...rollConfig, ...overrides });
    let total = Number(roll?.total);
    // If the roll API ignored parts, nudge the total for DC comparison only.
    // A physical save was already judged against the DC, cover included.
    if (bonus && Number.isFinite(total) && !roll?.physical) {
      const formula = String(roll?.formula ?? "");
      if (!formula.includes(String(bonus))) total += bonus;
    }
    return { roll, total };
  };

  let { roll, total } = await rollOnce();
  await consumeRollAdvantage(actor, mods.reasons);
  let outcome = roll?.physical
    ? { success: Boolean(roll.success), reason: roll.success ? "saved" : "failed" }
    : evaluateSaveVsDc({ total, dc });
  const reactions = [];

  if (resolutionId && tokenUuid && Number.isFinite(dc) && Number.isFinite(total)) {
    const patches = await openReactionWindow({
      parentId: resolutionId,
      windowId: outcome.success ? "on-save-success" : "on-save-fail",
      baseCtx: { triggerTokenUuid: tokenUuid, charmOrFear }
    });
    if (patches.rerollD20) {
      const next = await rollOnce(patches.rerollD20.advantage ? { advantage: true } : {});
      if (Number.isFinite(next.total) && (patches.rerollD20.keep === "new" || next.total < total)) {
        roll = next.roll;
        total = next.total;
        outcome = evaluateSaveVsDc({ total, dc });
      }
      reactions.push(...patches.sources);
    }
  }

  return {
    total: Number.isFinite(total) ? total : null,
    success: outcome.success,
    reason: outcome.reason,
    ability,
    dc,
    coverBonus: bonus,
    roll,
    reactions
  };
}

/**
 * @returns {Promise<object>}
 */
export async function resolveSaveActivity({
  activity,
  targetUuids = [],
  event = null,
  damageRolls = null,
  originUuid = null,
  resolutionId = null
} = {}) {
  const result = {
    saveOutcomes: [],
    damageRolls: [],
    applied: [],
    effects: [],
    hitUuids: [],
    coverNotes: []
  };

  if (!activity || activity.type !== "save" || !targetUuids.length) {
    return result;
  }

  const casterUuid = originUuid
    ?? activity.item?.actor?.getActiveTokens?.(true)?.[0]?.document?.uuid
    ?? activity.item?.actor?.getActiveTokens?.(true)?.[0]?.uuid
    ?? canvas?.tokens?.placeables?.find((t) => t.actor?.uuid === (activity.item?.actor?.uuid ?? activity.actor?.uuid))
      ?.document?.uuid
    ?? null;

  // While owned, hooks.mjs must not also apply full damage on dnd5e.rollDamageV2.
  beginOwnedResolve();
  try {
    const savedByUuid = new Map();
    const rolledUuids = [];
    const charmOrFear = appliesCharmOrFear(activity);

    for (const uuid of targetUuids) {
      const token = tokenFromUuid(uuid);
      const actor = token?.actor;
      if (!actor) continue;

      const ability = saveAbility(activity);
      const { bonus: coverBonus, cover } = await coverBonusForSave({
        ability,
        originUuid: casterUuid,
        targetUuid: uuid
      });
      if (coverBonus || cover?.gmAdjudicated) {
        result.coverNotes.push({
          uuid,
          dexSaveBonus: coverBonus,
          level: cover?.level ?? "none",
          gmAdjudicated: Boolean(cover?.gmAdjudicated)
        });
      }

      const save = await rollActivitySave(actor, activity, {
        event,
        coverBonus,
        resolutionId,
        tokenUuid: uuid,
        charmOrFear
      });
      savedByUuid.set(uuid, save.success);
      rolledUuids.push(uuid);
      result.saveOutcomes.push({
        uuid,
        name: token?.name ?? actor.name,
        ...save
      });
    }

    let rolls = damageRolls;
    if (!rolls && typeof activity.rollDamage === "function") {
      try {
        rolls = (await activity.rollDamage({ event }, { configure: false }, {})) ?? [];
      } catch {
        rolls = [];
      }
    }
    result.damageRolls = Array.isArray(rolls) ? rolls : (rolls ? [rolls] : []);

    const damages = damagesFromRolls(result.damageRolls);
    const onSave = activity.damage?.onSave ?? "half";

    const targets = [];
    for (const uuid of rolledUuids) {
      const actor = tokenFromUuid(uuid)?.actor;
      if (!actor) continue;
      const saved = Boolean(savedByUuid.get(uuid));
      let multiplier = damageFactorOnSave({ saved, onSave });
      const ability = result.saveOutcomes.find((o) => o.uuid === uuid)?.ability;
      const evasion = evasionDamageFactor(actor, { ability, success: saved });
      if (evasion != null && damages.length) multiplier = evasion;
      if (multiplier > 0) targets.push({ uuid, multiplier, tag: { saved } });
    }

    let damagedUuids = [];
    if (damages.length && targets.length) {
      const damageTypes = damages.map((d) => d.type).filter(Boolean);
      const patches = resolutionId
        ? await openReactionWindow({
          parentId: resolutionId,
          windowId: "on-damage-known",
          baseCtx: {
            targetUuids: targets.map((t) => t.uuid),
            triggerTokenUuid: casterUuid,
            attackRoll: false,
            elemental: damageTypes.some(isElementalType),
            damageTypes
          }
        })
        : null;
      const trail = await applyDamageWithTrail({
        rolls: result.damageRolls,
        targets: damageTargetsFromPatches(targets, patches)
      });
      result.applied.push(...trail.changes);
      damagedUuids = trail.damagedUuids;
    }

    result.hitUuids = damages.length
      ? damagedUuids
      : rolledUuids.filter((uuid) => !savedByUuid.get(uuid));
    result.effects = await applyActivityEffects({
      activity,
      targetUuids: rolledUuids,
      savedByUuid
    });
  } finally {
    endOwnedResolve();
  }

  return result;
}
