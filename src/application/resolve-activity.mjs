/**
 * Illusive activity resolution — the module's combat engine.
 *
 * Consumes dnd5e for item data + dice. Illusive owns:
 * economy spend, hit adjudication, damage application to tokens, change trail.
 * Every HP write goes through applyDamageWithTrail (docs/combat-engine.md §7).
 */

import { evaluateAttackTargets } from "../domain/combat/attack-outcome.mjs";
import { getWeaponAttackCount } from "../domain/combat/attack-count.mjs";
import {
  listActivities,
  pickPrimarySpellActivity,
  isMeleeAttack,
  isRangedAttack,
  isSpellUse,
  isElementalType,
  primaryDamageType
} from "../domain/combat/activity-kind.mjs";
import { useActivity as foundryUseActivity } from "../foundry/dnd5e-adapter.mjs";
import { tokenFromUuid, tokenUuidOf } from "../foundry/token-lookup.mjs";
import { applyDamageWithTrail, flatDamageRoll } from "./damage-apply.mjs";
import { markEconomyUsed, resolveEconomySection } from "./economy.mjs";
import { spendLegendaryAction, spendLairAction, isTokenInCombat } from "./action-economy.mjs";
import { resolveSaveActivity } from "./save-resolve.mjs";
import { checkAbilityRange } from "./range.mjs";
import { evaluateForCombat as evaluateCover } from "./cover.mjs";
import { bakeCoverIntoAc } from "../domain/combat/cover.mjs";
import { applyWeaponMastery, consumeVexAdvantage, consumeSapDisadvantage } from "./mastery.mjs";
import { offerHitRiders } from "./hit-riders.mjs";
import { openReactionWindow, damageTargetsFromPatches } from "./reactions/window.mjs";
import { emitCombatFx } from "./combat-fx.mjs";
import {
  collectAttackModifiers,
  collectAbilityCheckModifiers,
  rageDamageBonus,
  consumeHelpAdvantage,
  consumeRollAdvantage
} from "./roll-modifiers.mjs";
import { takePendingHitRiders } from "./reactions/reaction-state.mjs";
import { rollVisible } from "./dice.mjs";
import {
  expireOnAttack,
  expireOnAttacked,
  expireOnDamaged
} from "./special-duration.mjs";
import {
  listPassiveHitRiders,
  wasPassiveRiderUsed,
  markPassiveRiderUsed,
  hasRecklessAttack
} from "./feature-toggles.mjs";
import { MODULE_ID } from "../constants.mjs";
import { applyActivityEffects } from "./effect-apply.mjs";
import { placeActivityTemplates } from "./template-placer.mjs";
import {
  resolveTemplateArea,
  beginOwnedTemplateResolve,
  endOwnedTemplateResolve,
  collectTemplateTargetUuids
} from "./template-saves.mjs";
import { getLinkedSpell } from "./ability.mjs";
import { beginOwnedResolve, endOwnedResolve } from "./owned-resolve.mjs";

/** Resolutions that already applied damage this chain (prevents double-apply). */
const appliedResolutionIds = new Set();

export function markDamageApplied(resolutionId) {
  if (resolutionId) appliedResolutionIds.add(resolutionId);
}

export function wasDamageApplied(resolutionId) {
  return Boolean(resolutionId && appliedResolutionIds.has(resolutionId));
}

export function clearDamageApplied(resolutionId) {
  if (resolutionId) appliedResolutionIds.delete(resolutionId);
}

function describeTargets(targetUuids = []) {
  return targetUuids.map((uuid) => {
    const token = tokenFromUuid(uuid);
    const actor = token?.actor;
    return {
      uuid,
      name: token?.name ?? actor?.name ?? null,
      ac: actor?.system?.attributes?.ac?.value ?? null,
      actor
    };
  }).filter((t) => t.uuid);
}

/** Activities Illusive fully drives after use() (Illusive rolls; suppress system follow-ups). */
function isDrivenType(type) {
  return type === "attack" || type === "damage" || type === "heal" || type === "save"
    || type === "check" || type === "summon" || type === "forward";
}

/** Suppress dnd5e subsequentActions only when Illusive rolls attack/damage/save itself. */
function suppressSubsequentActions(type) {
  return type === "attack" || type === "damage" || type === "heal" || type === "save"
    || type === "forward";
}

/**
 * Unwrap a CastActivity into { consumptionItem/Activity, item, activity }.
 * consumption* is what we call .use() on (slot / feature uses);
 * item/activity are what Illusive drives (template, attack, save).
 */
export function unwrapCastActivity(item, activity) {
  if (activity?.type !== "cast") {
    return { item, activity, consumptionItem: item, consumptionActivity: activity, unwrapped: false };
  }
  const spell = getLinkedSpell(activity);
  const primary = pickPrimarySpellActivity(listActivities(spell));
  if (!spell || !primary) {
    return { item, activity, consumptionItem: item, consumptionActivity: activity, unwrapped: false };
  }
  if (!primary.item) {
    try { primary.item = spell; } catch { /* sealed */ }
  }
  return {
    item: spell,
    activity: primary,
    consumptionItem: item,
    consumptionActivity: activity,
    unwrapped: true
  };
}

function siblingActivities(item, activity) {
  return listActivities(item).filter((a) => a.id !== activity?.id && a._id !== activity?._id);
}

/** Find a linked save/damage "other" activity (Ice Knife blast, etc.). */
function findFollowupActivity(item, activity) {
  const siblings = siblingActivities(item, activity);
  return siblings.find((a) => a.type === "save")
    ?? siblings.find((a) => a.type === "damage")
    ?? siblings.find((a) => a.type === "forward")
    ?? null;
}

function d20Of(roll) {
  return roll?.d20
    ?? roll?.dice?.find?.((d) => d.faces === 20)
    ?? roll?.terms?.find?.((t) => t.faces === 20);
}

/** Natural crit / threshold from a finished attack D20Roll. */
export function readAttackCritical(roll, activity = null) {
  if (!roll) return false;
  if (roll.isCritical === true || roll.options?.isCritical === true) return true;
  if (roll.isCriticalSuccess === true) return true;

  const d20 = d20Of(roll);
  const face = Number(
    d20?.results?.[0]?.result
    ?? d20?.results?.[0]?.faces
    ?? d20?.total
    ?? d20?.values?.[0]
  );
  if (!Number.isFinite(face)) return false;

  const threshold = Number(
    activity?.criticalThreshold
    ?? activity?.attack?.critical?.threshold
    ?? 20
  );
  return face >= (Number.isFinite(threshold) ? threshold : 20);
}

export function readAttackFumble(roll) {
  if (!roll) return false;
  if (roll.isFumble === true || roll.options?.isFumble === true) return true;
  if (roll.isCriticalFailure === true) return true;
  const d20 = d20Of(roll);
  const face = Number(d20?.results?.[0]?.result ?? d20?.total ?? d20?.values?.[0]);
  return face === 1;
}

/** Hit adjudication over covered targets; total cover is an automatic miss. */
function adjudicate(coveredTargets, attack, acBonusByTarget = null) {
  const open = coveredTargets.filter((t) => !t.blocked).map((t) => {
    const bonus = acBonusByTarget?.get?.(t.uuid) ?? 0;
    return bonus ? { ...t, ac: (Number(t.ac) || 0) + bonus, shielded: true } : t;
  });
  const outcomes = evaluateAttackTargets(open, attack);
  for (const outcome of outcomes) {
    if (!outcome.hit && open.find((t) => t.uuid === outcome.uuid)?.shielded) outcome.reason = "shield-ac";
  }
  for (const blocked of coveredTargets.filter((t) => t.blocked)) {
    outcomes.push({
      uuid: blocked.uuid,
      name: blocked.name,
      ac: blocked.ac,
      hit: false,
      critical: false,
      fumble: false,
      reason: "total-cover"
    });
  }
  return outcomes;
}

function rollList(rolls) {
  return Array.isArray(rolls) ? rolls.filter(Boolean) : rolls ? [rolls] : [];
}

function damageTypesOf(rolls) {
  return [...new Set(rolls.map((r) => r?.options?.type).filter(Boolean))];
}

/**
 * The one damage step: on-damage-known window (hard), then the trail write.
 * @param {{ rollsByTarget: Map<string, object[]>, resolutionId, token, attackRoll, ranged, weaponAttack, melee }} input
 */
async function applyDamageStep({
  rollsByTarget,
  resolutionId,
  token,
  attackRoll = false,
  ranged = false,
  weaponAttack = false,
  melee = false,
  tag = null
}) {
  const uuids = [...rollsByTarget.keys()].filter((u) => rollsByTarget.get(u)?.length);
  if (!uuids.length) return { changes: [], damagedUuids: [] };
  const allRolls = uuids.flatMap((u) => rollsByTarget.get(u));
  const damageTypes = damageTypesOf(allRolls);

  let patches = null;
  if (resolutionId) {
    patches = await openReactionWindow({
      parentId: resolutionId,
      windowId: "on-damage-known",
      baseCtx: {
        triggerTokenUuid: tokenUuidOf(token),
        targetUuids: uuids,
        attackRoll,
        ranged,
        weaponAttack,
        elemental: damageTypes.some(isElementalType),
        damageTypes
      }
    });
  }

  const targets = damageTargetsFromPatches(
    uuids.map((uuid) => ({ uuid, rolls: rollsByTarget.get(uuid) })),
    patches
  );
  const out = await applyDamageWithTrail({ targets, melee, tag });
  markDamageApplied(resolutionId);
  for (const uuid of out.damagedUuids) {
    const actor = tokenFromUuid(uuid)?.actor;
    if (actor) await expireOnDamaged(actor);
  }
  return { ...out, patches };
}

/** Soft after-damage-applied window (Hellish Rebuke, Retaliation) — never blocks the parent. */
async function offerAfterDamage({ changes = [], token, resolutionId, attackRoll = false }) {
  const damagedActorUuids = changes
    .filter((c) => c.type === "actor-hp")
    .flatMap((c) => [c.actorUuid, c.tokenUuid])
    .filter(Boolean);
  if (!damagedActorUuids.length || !resolutionId) return;
  const droppedUuids = changes
    .filter((c) => c.type === "actor-hp" && Number(c.prior?.value) > 0 && Number(c.next?.value) <= 0)
    .map((c) => c.tokenUuid ?? c.actorUuid)
    .filter(Boolean);
  await openReactionWindow({
    parentId: resolutionId,
    windowId: "after-damage-applied",
    baseCtx: { triggerTokenUuid: tokenUuidOf(token), damagedActorUuids, droppedUuids, attackRoll }
  });
}

function spellLevelOf(item, useOptions) {
  const level = Number(useOptions?.spellLevel ?? useOptions?.slotLevel ?? item?.system?.level);
  return Number.isFinite(level) ? level : 0;
}

const SLOT_VALUE_PATH = /^system\.spells\.([^.]+)\.value$/;

/**
 * 2024 Counterspell: a countered spell's slot is not expended (other costs stay spent).
 * Prefers dnd5e's recorded consumption deltas via Activity#refund.
 */
async function refundSpellSlot(actor, usageResults, activity) {
  const deltas = usageResults?.message?.system?.deltas?.actor ?? [];
  const slotDeltas = [...deltas].filter((d) => SLOT_VALUE_PATH.test(d?.keyPath ?? ""));
  if (slotDeltas.length && typeof activity?.refund === "function") {
    try {
      await activity.refund({ actor: slotDeltas, item: {} });
      return true;
    } catch {
      /* fall back to the manual refund */
    }
  }
  const raw = usageResults?.updates?.actor;
  if (!actor || !raw) return false;
  const flat = globalThis.foundry?.utils?.flattenObject?.(raw) ?? raw;
  const update = {};
  for (const key of Object.keys(flat)) {
    const m = SLOT_VALUE_PATH.exec(key);
    if (!m) continue;
    const slot = actor.system?.spells?.[m[1]];
    const max = Number(slot?.max);
    const current = Number(slot?.value) || 0;
    update[key] = Number.isFinite(max) ? Math.min(max, current + 1) : current + 1;
  }
  if (!Object.keys(update).length) return false;
  try {
    await actor.update(update);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve one HUD/activity use.
 * @returns {Promise<object>}
 */
export async function resolveActivity({
  token,
  item: rawItem,
  activity: rawActivity,
  section = "action",
  event = null,
  useOptions = {},
  resolutionId = null
} = {}) {
  const unwrapped = unwrapCastActivity(rawItem, rawActivity);
  const item = unwrapped.item;
  const activity = unwrapped.activity;
  const consumptionItem = unwrapped.consumptionItem;
  const consumptionActivity = unwrapped.consumptionActivity;

  const actor = token?.actor ?? item?.actor ?? activity?.actor ?? rawItem?.actor;
  const targetUuids = Array.isArray(useOptions.targetUuids) ? [...useOptions.targetUuids] : [];
  const targets = describeTargets(targetUuids);
  const type = activity?.type ?? null;
  const attackerUuid = tokenUuidOf(token);
  // Utility+template is handled in the save/AoE branch below — must be driven or we
  // return early and never place/resolve the area (Fog Cloud, Darkness, etc.).
  const drive = isDrivenType(type)
    || Boolean(type === "utility" && activity?.target?.template?.type);

  const result = {
    attackRolls: [],
    damageRolls: [],
    outcomes: [],
    applied: [],
    hitUuids: [],
    driven: drive,
    economySpend: null,
    rangeBand: null,
    coverNotes: [],
    mastery: [],
    riders: [],
    reactions: [],
    attackMods: [],
    // So callers can label the log as Fireball, not Spellcasting.
    displayItem: item,
    displayName: item?.name ?? rawItem?.name ?? null
  };

  const economyType = resolveEconomySection(section);
  const isWeaponAttack = Boolean(
    economyType === "action"
    && (item?.type === "weapon" || type === "attack")
    && type !== "save"
    && type !== "heal"
  );
  const lightWeapon = Boolean(
    item?.system?.properties?.has?.("lgt")
    || (Array.isArray(item?.system?.properties) && item.system.properties.includes("lgt"))
    || item?.system?.properties?.lgt
  );
  if (actor && economyType && isTokenInCombat(token)) {
    result.economySpend = await markEconomyUsed(
      actor,
      economyType,
      {
        cost: economyType,
        weaponAttack: isWeaponAttack,
        lightWeapon
      },
      { attacksPerAction: isWeaponAttack ? getWeaponAttackCount(actor) : 1 }
    );
  }

  // Legendary / lair actions spend their creature resources (not A/B/R).
  if (actor && isTokenInCombat(token)) {
    if (section === "legendary" || activity?.activation?.type === "legendary"
      || activity?.activation?.type === "mythic") {
      await spendLegendaryAction(actor);
    }
    if (section === "lair" || activity?.activation?.type === "lair") {
      await spendLairAction(actor);
    }
  }

  const hasTemplate = Boolean(activity?.target?.template?.type);
  // Cast shells: consume the feature/slot via the CastActivity, then Illusive
  // drives the linked spell (template / attack / save). Never finish on "Spellcasting".
  const suppressFollowups = unwrapped.unwrapped
    || suppressSubsequentActions(type)
    || hasTemplate;
  const usageResults = await foundryUseActivity({
    item: consumptionItem,
    activity: consumptionActivity,
    event,
    useOptions: {
      ...useOptions,
      subsequentActions: suppressFollowups ? false : true,
      createMeasuredTemplate: hasTemplate ? false : undefined
    }
  });

  // dnd5e resolves undefined when the use was dismissed, refused, or failed to consume.
  if (usageResults == null || usageResults === false) {
    result.cancelled = true;
    return result;
  }

  // Hard on-cast: Counterspell may stop the spell before attack/save/template drive.
  if (resolutionId && isSpellUse(item, rawActivity)) {
    const castPatches = await openReactionWindow({
      parentId: resolutionId,
      windowId: "on-cast",
      baseCtx: { triggerTokenUuid: attackerUuid },
      patchCtx: { caster: actor, spellLevel: spellLevelOf(item, useOptions) }
    });
    if (castPatches.cancelCast) {
      result.countered = true;
      result.slotRefunded = castPatches.refundSlot
        ? await refundSpellSlot(actor, usageResults, consumptionActivity ?? activity)
        : false;
      result.reactions.push({ trigger: "counterspell", countered: true, slotRefunded: result.slotRefunded });
      return result;
    }
  }

  if (!drive || !activity) return result;

  if (type === "attack" && typeof activity.rollAttack === "function") {
    // Owned: the rollDamageV2 fallback in hooks.mjs must not apply our rolls again.
    beginOwnedResolve();
    try {
      await resolveAttack({ result, token, actor, item, activity, targets, targetUuids, event, resolutionId });
    } finally {
      endOwnedResolve();
    }
    return result;
  }

  if ((type === "damage" || type === "heal") && typeof activity.rollDamage === "function") {
    beginOwnedResolve();
    try {
      await resolveDamageActivity({ result, token, item, activity, targets, targetUuids, event, resolutionId });
    } finally {
      endOwnedResolve();
    }
    return result;
  }

  if (type === "save" || (activity?.target?.template?.type && (type === "utility" || type === "damage"))) {
    let applyTo = targetUuids.length ? targetUuids : targets.map((t) => t.uuid);
    let saveResult = null;

    // Template AoE: always place, then resolve only tokens in the area (ignore prior targets).
    if (activity?.target?.template?.type) {
      beginOwnedTemplateResolve();
      try {
        const placed = await placeActivityTemplates(activity);
        // Placer dismissed / failed — cancel instead of "Spellcasting finished".
        if (!placed?.length) {
          result.cancelled = true;
          return result;
        }
        result.templates = placed.map((d) => d?.uuid).filter(Boolean);
        applyTo = await collectTemplateTargetUuids(placed, {
          activity,
          casterToken: token,
          casterUuid: actor?.uuid
        });
        // Stay owned through save/damage so rollDamageV2 does not double-apply.
        saveResult = await resolveTemplateArea({
          activity,
          item,
          targetUuids: applyTo,
          templateDocs: placed,
          resolutionId
        });
      } finally {
        endOwnedTemplateResolve();
      }
      saveResult = { ...(saveResult ?? {}), hitUuids: saveResult?.hitUuids ?? applyTo };
    } else if (type === "save") {
      saveResult = await resolveSaveActivity({
        activity,
        targetUuids: applyTo,
        event,
        originUuid: attackerUuid,
        resolutionId
      });
    }

    if (saveResult) {
      result.saveOutcomes = saveResult.saveOutcomes;
      result.damageRolls = saveResult.damageRolls;
      result.applied = saveResult.applied;
      result.hitUuids = saveResult.hitUuids;
      result.effects = saveResult.effects;
      if (saveResult.coverNotes?.length) {
        result.coverNotes = [...(result.coverNotes ?? []), ...saveResult.coverNotes];
      }
      result.outcomes = (saveResult.saveOutcomes ?? []).map((o) => ({
        uuid: o.uuid,
        name: o.name,
        saved: o.success,
        hit: !o.success,
        total: o.total,
        dc: o.dc,
        ability: o.ability
      }));
      if (saveResult.applied?.length || saveResult.effects?.length) markDamageApplied(resolutionId);
      await offerAfterDamage({ changes: saveResult.applied ?? [], token, resolutionId });
    }
    if (activity?.target?.template?.type) return result;
  }

  if (type === "check") {
    await resolveCheck({ result, token, actor, activity, event, resolutionId });
  }

  if (type === "summon") {
    // Let dnd5e place the summon via subsequentActions (re-enabled above when not driven).
    result.summoned = true;
    emitCombatFx({
      kind: "summon",
      resolutionId,
      actorUuid: actor?.uuid ?? null,
      tokenUuid: attackerUuid,
      origin: { itemUuid: item?.uuid ?? null, activityId: activity?.id ?? null }
    });
  }

  if (type === "forward") {
    const next = siblingActivities(item, activity)
      .find((a) => a.type === "attack" || a.type === "save" || a.type === "damage");
    if (next) {
      next.item = item;
      result.forward = await resolveActivity({
        token,
        item,
        activity: next,
        section,
        event,
        useOptions,
        resolutionId
      });
    }
  }

  return result;
}

/**
 * Check activity: roll, then hard on-check-success (Silvery Barbs: reroll, keep the lower).
 */
async function resolveCheck({ result, token, actor, activity, event, resolutionId }) {
  const associated = [...(activity.check?.associated ?? [])];
  const skill = associated.find((key) => actor?.system?.skills?.[key]) ?? null;
  const ability = activity.check?.ability
    || (skill ? actor.system.skills[skill].ability : null)
    || "int";
  const dc = Number(activity.check?.dc?.value);
  const mods = collectAbilityCheckModifiers({ actor, ability, actorToken: token });
  const config = { ability, event, target: Number.isFinite(dc) ? dc : undefined };
  if (mods.advantage && !mods.disadvantage) config.advantage = true;
  else if (mods.disadvantage && !mods.advantage) config.disadvantage = true;
  const roll = async () => {
    if (skill && typeof actor?.rollSkill === "function") {
      return rollList(await actor.rollSkill({ ...config, skill }, { configure: false }, {}));
    }
    if (typeof actor?.rollAbilityCheck === "function") {
      return rollList(await actor.rollAbilityCheck(config, { configure: false }, {}));
    }
    return [];
  };
  result.checkRolls = await roll();
  if (result.checkRolls.length) await consumeRollAdvantage(actor, mods.reasons);

  const total = Number(result.checkRolls[0]?.total);
  if (!resolutionId || !Number.isFinite(dc) || !Number.isFinite(total) || total < dc) return;
  const patches = await openReactionWindow({
    parentId: resolutionId,
    windowId: "on-check-success",
    baseCtx: { triggerTokenUuid: tokenUuidOf(token) }
  });
  if (!patches.rerollD20) return;
  const reroll = await roll();
  const next = Number(reroll[0]?.total);
  if (Number.isFinite(next) && next < total) result.checkRolls = reroll;
  result.reactions.push({ trigger: patches.sources.join(","), rerolled: true, kept: Math.min(total, next) });
}

/** Damage / heal activity (no attack roll). Magic Missile-style rolls once per target. */
async function resolveDamageActivity({ result, token, item, activity, targets, targetUuids, event, resolutionId }) {
  const applyTo = targetUuids.length ? targetUuids : targets.map((t) => t.uuid);
  result.hitUuids = applyTo;
  const rollsByTarget = new Map();
  if (applyTo.length > 1 && /magic\s*missile/i.test(item?.name ?? "")) {
    for (const uuid of applyTo) {
      const rolls = rollList(await activity.rollDamage({ event }, { configure: false }));
      result.damageRolls.push(...rolls);
      rollsByTarget.set(uuid, rolls);
    }
  } else {
    result.damageRolls = rollList(await activity.rollDamage({ event }, { configure: false }));
    for (const uuid of applyTo) rollsByTarget.set(uuid, result.damageRolls);
  }
  const step = await applyDamageStep({ rollsByTarget, resolutionId, token });
  result.applied = step.changes;
  await offerAfterDamage({ changes: step.changes, token, resolutionId });
}

/** Attack roll → hard on-attack-hit window → mastery / riders → one damage step per target. */
async function resolveAttack({ result, token, actor, item, activity, targets, targetUuids, event, resolutionId }) {
  const attackerUuid = tokenUuidOf(token);
  const rangeCheck = checkAbilityRange(token, item, activity);
  result.rangeBand = rangeCheck.result;
  const attackOpts = { event };
  const primaryTargetUuid = targetUuids[0] ?? null;
  const defender = targets[0]?.actor;
  const defenderToken = tokenFromUuid(primaryTargetUuid);
  const mods = collectAttackModifiers({
    attacker: actor,
    defender,
    item,
    attackerToken: token,
    defenderToken
  });
  if (rangeCheck.result === "long") {
    mods.disadvantage = true;
    mods.reasons.push("long-range");
  }
  if (consumeVexAdvantage(actor, primaryTargetUuid)) {
    mods.advantage = true;
    mods.reasons.push("vex");
  }
  if (defender && consumeSapDisadvantage(defender)) {
    mods.disadvantage = true;
    mods.reasons.push("sap");
  }
  if (mods.reasons.includes("help") && defender) {
    await consumeHelpAdvantage(defender);
  }
  if (mods.advantage && !mods.disadvantage) {
    attackOpts.advantage = true;
    attackOpts.disadvantage = false;
  } else if (mods.disadvantage && !mods.advantage) {
    attackOpts.advantage = false;
    attackOpts.disadvantage = true;
    attackOpts.advantageMode = 0;
  }
  if (mods.attackBonus) {
    attackOpts.parts = [...(attackOpts.parts ?? []), String(mods.attackBonus)];
    attackOpts.bonus = mods.attackBonus;
  }
  result.attackMods = mods.reasons;

  const melee = isMeleeAttack(activity, item);
  const ranged = isRangedAttack(activity, item);
  const weaponAttack = item?.type === "weapon";

  // Hard on-attack-declared: Protection imposes disadvantage. Readied "attack" triggers prompt (soft).
  // Passive declarations (Blur, Protection from Evil and Good) patch the same roll.
  if (resolutionId && targetUuids.length) {
    const declared = await openReactionWindow({
      parentId: resolutionId,
      windowId: "on-attack-declared",
      baseCtx: { triggerTokenUuid: attackerUuid, targetUuids, attackRoll: true, melee, ranged, weaponAttack }
    });
    if (declared.attackAdvantage || declared.attackDisadvantage) {
      if (declared.attackAdvantage) mods.advantage = true;
      if (declared.attackDisadvantage) mods.disadvantage = true;
      mods.reasons.push(...declared.sources);
      const adv = mods.advantage && !mods.disadvantage;
      const dis = mods.disadvantage && !mods.advantage;
      attackOpts.advantage = adv;
      attackOpts.disadvantage = dis;
      if (dis) attackOpts.advantageMode = 0;
      else delete attackOpts.advantageMode;
    }
    if (declared.attackBonus) {
      mods.attackBonus = (Number(mods.attackBonus) || 0) + declared.attackBonus;
      attackOpts.parts = [...(attackOpts.parts ?? []).filter((p) => p !== String(attackOpts.bonus)), String(mods.attackBonus)];
      attackOpts.bonus = mods.attackBonus;
    }
  }

  // Reckless opens the attacker to advantage against them
  if (mods.reasons.includes("reckless") && hasRecklessAttack(actor)) {
    try { await actor.setFlag(MODULE_ID, "recklessOpen", true); } catch { /* ignore */ }
  }

  await expireOnAttack(actor);

  const readTotal = (roll) => {
    let total = Number(roll?.total);
    // If the roll API ignored parts, nudge total for the hit check only.
    if (mods.attackBonus && Number.isFinite(total) && !Number.isFinite(Number(roll?.options?.illusiveBonus))) {
      total += mods.attackBonus;
    }
    return total;
  };

  result.attackRolls = rollList(await activity.rollAttack(attackOpts));
  if (result.attackRolls.length) await consumeRollAdvantage(actor, mods.reasons);
  let primary = result.attackRolls[0];
  const attack = {
    attackTotal: readTotal(primary),
    isCritical: readAttackCritical(primary, activity),
    isFumble: readAttackFumble(primary)
  };
  const masteryKey = primary?.options?.mastery ?? item?.system?.mastery ?? null;

  const coveredTargets = [];
  for (const t of targets) {
    let ac = t.ac;
    let blocked = false;
    if (attackerUuid && t.uuid) {
      const cover = await evaluateCover({ attackerUuid, targetUuid: t.uuid });
      const baked = bakeCoverIntoAc(ac, cover);
      ac = baked.ac;
      if (baked.level === "total" || baked.canTarget === false) {
        blocked = true;
        result.coverNotes.push({
          uuid: t.uuid,
          level: "total",
          acBonus: 0,
          blocked: true,
          gmAdjudicated: Boolean(cover?.gmAdjudicated)
        });
      } else if (baked.level && baked.level !== "none") {
        result.coverNotes.push({
          uuid: t.uuid,
          level: baked.level,
          acBonus: baked.acBonus,
          gmAdjudicated: Boolean(cover?.gmAdjudicated)
        });
      } else if (cover?.gmAdjudicated) {
        result.coverNotes.push({ uuid: t.uuid, level: "none", acBonus: 0, gmAdjudicated: true });
      }
    }
    coveredTargets.push({ uuid: t.uuid, ac, name: t.name, blocked });
  }

  result.outcomes = adjudicate(coveredTargets, attack);
  result.hitUuids = result.outcomes.filter((o) => o.hit).map((o) => o.uuid);

  for (const t of targets) {
    if (t.actor) await expireOnAttacked(t.actor);
  }

  // Hard on-attack-hit: Shield / Silvery Barbs / Cutting Words before damage.
  if (result.hitUuids.length && resolutionId) {
    const hitPatches = await openReactionWindow({
      parentId: resolutionId,
      windowId: "on-attack-hit",
      baseCtx: {
        targetUuids: result.hitUuids,
        triggerTokenUuid: attackerUuid,
        attackRoll: true,
        melee,
        ranged
      }
    });
    result.reactionPatches = { onAttackHit: hitPatches };
    let changed = false;

    // Silvery Barbs: reroll the d20 and use the lower roll.
    if (hitPatches.rerollAttack) {
      const reroll = rollList(await activity.rollAttack(attackOpts))[0];
      const total = readTotal(reroll);
      if (reroll && Number.isFinite(total) && total < attack.attackTotal) {
        primary = reroll;
        result.attackRolls = [reroll];
        attack.attackTotal = total;
        attack.isCritical = readAttackCritical(reroll, activity);
        attack.isFumble = readAttackFumble(reroll);
      }
      changed = true;
    }
    // Cutting Words: subtract the Bardic Inspiration die (a natural 20 still hits).
    if (hitPatches.attackPenalty) {
      attack.attackTotal -= hitPatches.attackPenalty;
      changed = true;
    }
    // Shield: +5 AC until the start of the reactor's next turn (cannot turn a crit into a miss).
    if (hitPatches.acBonusByTarget.size) changed = true;
    if (changed) {
      result.outcomes = adjudicate(coveredTargets, attack, hitPatches.acBonusByTarget);
      result.hitUuids = result.outcomes.filter((o) => o.hit).map((o) => o.uuid);
    }
  }

  result.critical = attack.isCritical;
  result.fumble = attack.isFumble;
  const anyHit = result.hitUuids.length > 0;

  emitCombatFx({
    kind: anyHit ? "attackHit" : "attackMiss",
    subtype: masteryKey,
    resolutionId,
    actorUuid: actor?.uuid ?? null,
    tokenUuid: attackerUuid,
    targetUuids: anyHit ? result.hitUuids : targetUuids,
    outcome: { ...attack, mastery: masteryKey },
    origin: { itemUuid: item?.uuid ?? null, activityId: activity?.id ?? null }
  });

  // Soft on-attack-miss: Riposte against a melee attacker that missed.
  const missedUuids = result.outcomes.filter((o) => !o.hit && o.reason !== "total-cover").map((o) => o.uuid);
  if (melee && missedUuids.length && resolutionId) {
    await openReactionWindow({
      parentId: resolutionId,
      windowId: "on-attack-miss",
      baseCtx: { triggerTokenUuid: attackerUuid, targetUuids: missedUuids, attackRoll: true, melee }
    });
  }

  const stepOpts = { resolutionId, token, attackRoll: true, ranged, weaponAttack, melee };

  result.mastery = await applyWeaponMastery({
    mastery: masteryKey,
    hit: anyHit,
    fumble: attack.isFumble,
    actor,
    token,
    item,
    activity,
    targetUuids: anyHit ? result.hitUuids : targetUuids,
    resolutionId,
    attackTotal: attack.attackTotal
  });

  if (anyHit) {
    result.effects = await applyActivityEffects({
      activity,
      targetUuids: result.hitUuids,
      savedByUuid: new Map()
    });
  }

  if (anyHit && typeof activity.rollDamage === "function") {
    result.damageRolls = rollList(await activity.rollDamage(
      { event, isCritical: attack.isCritical },
      { configure: false, options: attack.isCritical ? { defaultButton: "critical" } : {} }
    ));
    const mainType = result.damageRolls[0]?.options?.type ?? primaryDamageType(item);
    const rollsByTarget = new Map(result.hitUuids.map((uuid) => [uuid, [...result.damageRolls]]));
    const firstHit = result.hitUuids[0];

    // Smite / Sneak / Hex / Hunter's Mark — one target per rider (marks only on the marked creature).
    const riders = await offerHitRiders({
      actor,
      hitUuids: result.hitUuids,
      critical: attack.isCritical,
      event,
      resolutionId,
      token
    });
    for (const rider of riders) {
      const uuid = rider.targetUuids[0];
      if (uuid && rider.rolls.length) rollsByTarget.get(uuid)?.push(...rider.rolls);
      result.riders.push({ rider: rider.rider, targetUuid: uuid ?? null, totals: rider.rolls.map((r) => r?.total) });
    }

    // Passive once-per-turn riders (Colossus Slayer / Divine Fury): first creature hit.
    const RollCls = globalThis.Roll;
    for (const rider of listPassiveHitRiders(actor)) {
      if (!RollCls || (rider.oncePerTurn && wasPassiveRiderUsed(actor, rider.id))) continue;
      try {
        const roll = await rollVisible(rider.formula, { actor, flavor: rider.item?.name ?? rider.id });
        const value = Number(roll.total) || 0;
        if (value <= 0) continue;
        rollsByTarget.get(firstHit)?.push(flatDamageRoll(value, rider.type || mainType, rider.formula));
        await markPassiveRiderUsed(actor, rider.id);
        result.riders.push({ rider: rider.id, targetUuid: firstHit, totals: [value] });
      } catch {
        /* ignore */
      }
    }

    // Reaction leftovers: Absorb Elements (next-turn melee hit), Riposte (superiority die).
    const ownTurn = Boolean(actor && globalThis.game?.combat?.combatant?.actor?.uuid === actor.uuid);
    for (const rider of await takePendingHitRiders(actor, { melee, ownTurn })) {
      if (!RollCls) break;
      try {
        const roll = await rollVisible(rider.formula, { actor, flavor: rider.label ?? rider.source });
        const value = Number(roll.total) || 0;
        if (value <= 0) continue;
        rollsByTarget.get(firstHit)?.push(flatDamageRoll(value, rider.damageType || mainType, rider.formula));
        result.riders.push({ rider: rider.source, targetUuid: firstHit, totals: [value] });
      } catch {
        /* ignore */
      }
    }

    // Rage / Great Weapon Master: same type as the weapon's damage.
    const bonusDamage = rageDamageBonus(actor, item) + (mods.damageBonus || 0);
    if (bonusDamage > 0) {
      for (const uuid of result.hitUuids) {
        rollsByTarget.get(uuid)?.push(flatDamageRoll(bonusDamage, mainType, `bonus ${bonusDamage}`));
      }
      result.riders.push({ rider: "bonus", totals: [bonusDamage] });
    }

    const step = await applyDamageStep({ rollsByTarget, ...stepOpts });
    result.applied = step.changes;
    result.reactionPatches = { ...(result.reactionPatches ?? {}), onDamageKnown: step.patches };
    emitCombatFx({
      kind: "damage",
      resolutionId,
      actorUuid: actor?.uuid ?? null,
      tokenUuid: attackerUuid,
      targetUuids: result.hitUuids,
      outcome: { totals: result.damageRolls.map((r) => r?.total) },
      origin: { itemUuid: item?.uuid ?? null, activityId: activity?.id ?? null }
    });
  }

  // Mastery writes (Push, Sap, Slow, Topple, Vex) join the undo trail.
  for (const entry of result.mastery) {
    if (entry?.undo?.length) result.applied.push(...entry.undo);
  }

  // Mastery damage: Graze (miss, no attack hit → no window) and Cleave (a new hit → window).
  for (const entry of result.mastery) {
    if (!entry?.rolls?.length || !entry.targetUuid) continue;
    const rollsByTarget = new Map([[entry.targetUuid, entry.rolls]]);
    const step = entry.attackHit
      ? await applyDamageStep({ rollsByTarget, ...stepOpts, tag: { mastery: entry.mastery } })
      : await applyDamageStep({ rollsByTarget, token, melee, tag: { mastery: entry.mastery } });
    result.applied.push(...step.changes);
  }

  await offerAfterDamage({ changes: result.applied, token, resolutionId, attackRoll: true });

  // Follow-up save/damage (Ice Knife blast, etc.)
  const followup = anyHit ? findFollowupActivity(item, activity) : null;
  if (followup) {
    followup.item = item;
    if (followup.type === "save") {
      result.followup = await resolveSaveActivity({
        activity: followup,
        targetUuids: result.hitUuids,
        event,
        originUuid: attackerUuid,
        resolutionId
      });
    } else if (followup.type === "damage" && typeof followup.rollDamage === "function") {
      const rolls = rollList(await followup.rollDamage({ event }, { configure: false }));
      const step = await applyDamageStep({
        rollsByTarget: new Map(result.hitUuids.map((uuid) => [uuid, rolls])),
        resolutionId,
        token
      });
      result.followup = { damageRolls: rolls, applied: step.changes };
    }
  }
}
