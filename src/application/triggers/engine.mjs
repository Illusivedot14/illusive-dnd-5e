/**
 * Trigger engine — runs declarations (src/domain/triggers) at moments.
 *
 *   passive      runPassiveTriggers: evaluated in the moment, patches returned to the
 *                consumer, writes go through the write gateway and are journaled
 *   soft / hard  declarationSpecsForWindow: offered as reaction-registry specs, so
 *                they share the reaction window's prompt, wait and pause
 *
 * Moments map 1:1 onto reaction windows (domain/triggers/moments.mjs); the
 * window calls runPassiveTriggers before it prompts anyone. Turn moments are
 * published by the primary writer from the combatTurnChange hook.
 *
 * Undo: every write's inverse lands in the game log — onto the causing
 * resolution when there is one, else on a system row. A declaration that comes
 * from an active effect depends on the row that created that effect, so undoing
 * the effect's cause also undoes what the effect did since.
 */

import { MODULE_ID } from "../../constants.mjs";
import { featureEnabled } from "../levels.mjs";
import { momentForWindow as windowMoment } from "../../domain/triggers/moments.mjs";
import { evaluateCondition } from "../../domain/triggers/conditions.mjs";
import { stepDef, defaultSelector } from "../../domain/triggers/steps.mjs";
import { onceKey } from "../../domain/triggers/declarations.mjs";
import { expandRefs, averageDice, hasDice, evaluateArithmetic } from "../../domain/triggers/formula.mjs";
import { isElementalType } from "../../domain/combat/activity-kind.mjs";
import { declarationsFor, allDeclarations, bindTriggerIndex } from "./index.mjs";
import { createFactReader, selectActors } from "./facts.mjs";
import { derivedRollData, offeredActivities, usesItem } from "./derived.mjs";
import { createMomentScope, candidateContext } from "../reactions/candidates.mjs";
import { counterspellPatches } from "../reactions/counterspell.mjs";
import { rollVisible } from "../dice.mjs";
import { writeNextD20Advantage, writePendingHitRider } from "../reactions/reaction-state.mjs";
import { tokenForActor, tokenUuidOf } from "../../foundry/token-lookup.mjs";
import { debugLog, DEBUG_CHANNELS } from "../../foundry/debug.mjs";
import {
  applyActorDamage,
  toggleActorStatus,
  createEmbedded,
  deleteDocs,
  setDocFlag,
  updateDoc
} from "../../foundry/write-gateway.mjs";

export const momentForWindow = windowMoment;

const USED_FLAG = "triggersUsed";

/* ------------------------------------------------------------- once / turn */

function currentStamp(scope) {
  const combat = globalThis.game?.combat;
  if (!combat?.started && !combat?.round) return null;
  return onceKey(combat.round ?? 0, combat.turn ?? 0, scope);
}

function usedThisPeriod(actor, entry) {
  if (!entry.decl.once) return false;
  const stamp = currentStamp(entry.decl.once);
  if (!stamp) return false;
  const used = actor?.getFlag?.(MODULE_ID, USED_FLAG) ?? actor?.flags?.[MODULE_ID]?.[USED_FLAG] ?? {};
  return used?.[entry.key] === stamp;
}

async function markUsed(actor, entry) {
  if (!entry.decl.once) return [];
  const stamp = currentStamp(entry.decl.once);
  if (!stamp) return [];
  const prev = actor?.getFlag?.(MODULE_ID, USED_FLAG) ?? {};
  const result = await setDocFlag(actor, MODULE_ID, USED_FLAG, { ...prev, [entry.key]: stamp });
  return result.undo ?? [];
}

/* ---------------------------------------------------------------- formulas */

function sourceLevel(entry) {
  const effect = entry.effect;
  const fromFlags = Number(effect?.flags?.dnd5e?.spellLevel ?? effect?.flags?.[MODULE_ID]?.spellLevel);
  if (Number.isFinite(fromFlags) && fromFlags > 0) return fromFlags;
  let item = entry.item;
  if (!item && effect?.origin) {
    try {
      item = globalThis.fromUuidSync?.(effect.origin) ?? null;
    } catch {
      item = null;
    }
  }
  const base = Number(item?.system?.level) || 0;
  const scaling = Number(effect?.flags?.dnd5e?.scaling) || 0;
  return Math.max(1, base + scaling);
}

function rollDataFor(actor, entry, ctx) {
  let data = {};
  try {
    data = typeof actor?.getRollData === "function" ? { ...actor.getRollData() } : { ...(actor?.system ?? {}) };
  } catch {
    data = { ...(actor?.system ?? {}) };
  }
  Object.assign(data, derivedRollData(actor, entry, ctx));
  data.prof = Number(actor?.system?.attributes?.prof) || 0;
  data.sourceLevel = sourceLevel(entry);
  return data;
}

/**
 * A step value: a number, or a formula rolled with Foundry's Roll (dice post a
 * chat roll). Without Roll, dice count as their average.
 * @returns {Promise<{ value: number, formula?: string }>}
 */
async function resolveValue(value, actor, entry, label, ctx = {}) {
  if (typeof value === "number") return { value };
  if (value == null) return { value: 0 };
  const data = rollDataFor(actor, entry, ctx);
  const expanded = expandRefs(value, data);
  const formula = hasDice(expanded) ? expanded : undefined;
  if (globalThis.Roll) {
    try {
      const roll = await rollVisible(expanded, { actor, data, flavor: label });
      const total = Number(roll?.total);
      if (Number.isFinite(total)) return { value: total, formula };
    } catch {
      /* fall through to the arithmetic evaluator */
    }
  }
  return { value: evaluateArithmetic(averageDice(expanded)) ?? 0, formula };
}

/** Damage types a step names: a list, every type of the moment, or its elemental ones. */
function typesFor(types, ctx) {
  if (Array.isArray(types)) return [...types];
  const all = [...new Set(ctx.damageTypes ?? [])];
  return types === "elemental" ? all.filter(isElementalType) : all;
}

function damageTypeFor(damageType, ctx) {
  if (damageType === "trigger" || damageType === "elemental") return typesFor(damageType, ctx)[0] ?? null;
  return damageType ?? null;
}

function isAttackRerollMoment(ctx) {
  return ctx.windowId === "on-attack-hit" || ctx.momentId === "isHit";
}

/* --------------------------------------------------------------- selection */

function targetUuidsFor(selector, ctx, scope) {
  switch (selector) {
    case "trigger": return scope.triggerUuid ? [scope.triggerUuid] : [];
    case "target": return scope.targetList.slice(0, 1);
    case "targets": return [...scope.targetList];
    case "damaged": return [...scope.damaged];
    case "nearTarget": return ctx.nearTargetUuid ? [ctx.nearTargetUuid] : [];
    case "ally": return ctx.allyUuid ? [ctx.allyUuid] : selfUuids(ctx);
    case "self":
    default:
      return selfUuids(ctx);
  }
}

function selfUuids(ctx) {
  return ctx.tokenUuid ? [ctx.tokenUuid] : (ctx.actor?.uuid ? [ctx.actor.uuid] : []);
}

/* ------------------------------------------------------------------- steps */

async function runPatchStep(step, def, ctx, scope, entry, label) {
  const source = entry.decl.id;
  if (step.step === "counterspell") return counterspellPatches(ctx, source);
  if (step.step === "reroll") {
    const keep = step.keep === "new" ? "new" : "lower";
    if (isAttackRerollMoment(ctx)) return [{ type: "rerollAttack", keep, source }];
    return [{ type: "rerollD20", keep, advantage: Boolean(step.advantage), source }];
  }
  const resolved = def.params.includes("value")
    ? await resolveValue(step.value, ctx.actor, entry, label, ctx)
    : { value: undefined };
  const extra = resolved.formula ? { formula: resolved.formula } : {};
  if (def.patch === "resistTypes") {
    const types = typesFor(step.types, ctx);
    return targetUuidsFor(step.to ?? defaultSelector(step), ctx, scope)
      .map((targetUuid) => ({ type: "resistTypes", targetUuid, value: types, source }));
  }
  if (def.targeted) {
    return targetUuidsFor(step.to ?? defaultSelector(step), ctx, scope)
      .map((targetUuid) => ({ type: def.patch, targetUuid, value: resolved.value, source, ...extra }));
  }
  return [{ type: def.patch, value: resolved.value, source, ...extra }];
}

async function runWriteStep(step, ctx, scope, entry, label) {
  const actors = selectActors(step.to ?? defaultSelector(step), ctx, scope);
  const changes = [];
  const push = (result) => { if (result?.undo?.length) changes.push(...result.undo); };

  switch (step.step) {
    case "damage":
    case "heal":
    case "tempHp": {
      const value = Math.max(0, (await resolveValue(step.value, ctx.actor, entry, label, ctx)).value);
      if (!value) break;
      const type = step.step === "damage" ? (step.damageType ?? undefined)
        : step.step === "heal" ? "healing" : "temphp";
      for (const actor of actors) push(await applyActorDamage(actor, [{ value, type }]));
      break;
    }
    case "applyStatus":
    case "removeStatus":
      for (const actor of actors) {
        push(await toggleActorStatus(actor, step.status, { active: step.step === "applyStatus" }));
      }
      break;
    case "applyEffect":
      for (const actor of actors) {
        const data = {
          name: label,
          img: entry.item?.img ?? entry.effect?.img ?? undefined,
          ...step.effect,
          origin: step.effect?.origin ?? entry.item?.uuid ?? entry.effect?.origin ?? undefined,
          flags: {
            ...(step.effect?.flags ?? {}),
            [MODULE_ID]: { ...(step.effect?.flags?.[MODULE_ID] ?? {}), trigger: entry.key }
          }
        };
        push(await createEmbedded(actor, "ActiveEffect", [data]));
      }
      break;
    case "endEffect":
      for (const actor of actors) {
        const name = String(step.name).toLowerCase();
        const hits = [...(actor?.effects ?? [])].filter((e) => String(e?.name ?? "").toLowerCase() === name);
        if (hits.length) push(await deleteDocs(hits));
      }
      break;
    case "setFlag":
      for (const actor of actors) push(await setDocFlag(actor, MODULE_ID, step.key, step.value ?? true));
      break;
    case "spendUses": {
      const item = step.item ? usesItem(ctx.actor, step.item) : entry.item;
      const amount = Number(step.amount ?? 1) || 1;
      if (item?.system?.uses) {
        push(await updateDoc(item, { "system.uses.spent": (Number(item.system.uses.spent) || 0) + amount }));
      }
      break;
    }
    case "grantAdvantage":
      for (const actor of actors) push(await writeNextD20Advantage(actor, { source: entry.decl.id }));
      break;
    case "hitRider": {
      const data = rollDataFor(ctx.actor, entry, ctx);
      const formula = expandRefs(step.formula, data);
      const damageType = damageTypeFor(step.damageType, ctx);
      if (step.damageType && !damageType) break;
      for (const actor of actors) {
        push(await writePendingHitRider(actor, {
          source: entry.decl.id,
          label: entry.decl.label ?? entry.item?.name ?? entry.decl.id,
          formula,
          ...(damageType ? { damageType } : {}),
          meleeOnly: Boolean(step.meleeOnly),
          ownTurnOnly: Boolean(step.ownTurnOnly)
        }));
      }
      break;
    }
    case "resistEffect": {
      const types = typesFor(step.types, ctx);
      if (!types.length) break;
      for (const actor of actors) {
        push(await createEmbedded(actor, "ActiveEffect", [{
          name: label,
          img: entry.item?.img ?? "icons/magic/defensive/shield-barrier-glowing-blue.webp",
          transfer: false,
          changes: types.map((t) => ({ key: "system.traits.dr.value", type: "add", value: t })),
          flags: { [MODULE_ID]: { specialDuration: [step.until], source: entry.decl.id, trigger: entry.key } }
        }]));
      }
      break;
    }
    case "note": {
      const ChatCls = globalThis.ChatMessage;
      if (ChatCls?.create) {
        try {
          await ChatCls.create({
            content: `<p><strong>${label}</strong>: ${step.text}</p>`,
            speaker: ChatCls.getSpeaker?.({ actor: ctx.actor }) ?? undefined
          });
        } catch { /* chat optional */ }
      }
      break;
    }
    default:
      break;
  }
  return changes;
}

/* ------------------------------------------------------------- evaluation */

/**
 * Range, sight, once and the condition — the whole "does this fire?" test.
 * An unmeasurable distance blocks a passive rule but still offers a prompt.
 */
export function entryHolds(entry, ctx, scope) {
  const decl = entry.decl;
  if (decl.range != null && !ctx.isTrigger) {
    const feet = ctx.distanceToTrigger;
    if (feet == null ? decl.mode === "passive" : feet > Number(decl.range)) return false;
  }
  if (decl.sight && !ctx.canSeeTrigger) return false;
  if (usedThisPeriod(ctx.actor, entry)) return false;
  return evaluateCondition(decl.if, createFactReader(ctx, scope, entry));
}

/**
 * Run one declaration's steps.
 * @returns {Promise<{ patches: object[], changes: object[] }>}
 */
export async function runEntry(entry, ctx, scope, { parentId = null } = {}) {
  const label = entry.decl.label ?? entry.decl.id;
  const patches = [];
  const changes = [];
  for (const step of entry.decl.do) {
    const def = stepDef(step.step);
    if (!def) continue;
    if (def.kind === "patch") patches.push(...await runPatchStep(step, def, ctx, scope, entry, label));
    else changes.push(...await runWriteStep(step, ctx, scope, entry, label));
  }
  changes.push(...await markUsed(ctx.actor, entry));

  if (changes.length) {
    try {
      const { journalChanges, entriesForEffects } = await import("../combat-game-log.mjs");
      await journalChanges({
        changes,
        label,
        detail: entry.decl.rule ?? null,
        resolutionId: parentId,
        actorUuid: ctx.actor?.uuid ?? null,
        tokenUuid: ctx.tokenUuid ?? null,
        dependsOn: entry.effect?.uuid ? entriesForEffects([entry.effect.uuid]) : []
      });
    } catch (err) {
      console.warn(`${MODULE_ID} | trigger journal failed`, entry.key, err);
    }
  }
  debugLog(DEBUG_CHANNELS.COMBAT, "trigger.fired", {
    key: entry.key,
    actor: ctx.actor?.name,
    patches: patches.map((p) => p.type),
    changes: changes.length
  });
  try {
    globalThis.Hooks?.callAll?.(`${MODULE_ID}.triggerFired`, {
      key: entry.key,
      declaration: entry.decl,
      actor: ctx.actor,
      patches,
      changes
    });
  } catch { /* listeners are optional */ }
  return { patches, changes };
}

function tokens() {
  return globalThis.canvas?.tokens?.placeables ?? [];
}

/**
 * Passive declarations for a moment, across every creature on the scene.
 * Creatures with nothing listening to the moment are skipped before any
 * distance or sight is computed.
 * @returns {Promise<object[]>} patches for the moment's consumer
 */
export async function runPassiveTriggers(momentId, { baseCtx = {}, parentId = null, scope = null } = {}) {
  if (!momentId || !featureEnabled("declaredTriggers")) return [];
  let momentScope = scope;
  const patches = [];
  for (const token of tokens()) {
    const actor = token?.actor;
    if (!actor) continue;
    const entries = declarationsFor(actor, momentId).filter((e) => e.decl.mode === "passive");
    if (!entries.length) continue;
    momentScope ??= createMomentScope(baseCtx);
    const ctx = candidateContext(momentScope, token, { momentId });
    for (const entry of entries) {
      if (!entryHolds(entry, ctx, momentScope)) continue;
      const out = await runEntry(entry, ctx, momentScope, { parentId });
      patches.push(...out.patches);
    }
  }
  return patches;
}

/**
 * Prompted (soft / hard) declarations on one actor as reaction specs, so the
 * window offers them beside the registry. They need a source item: the prompt
 * uses that item's activity (or the `offer` list), which also spends the reaction.
 * The spec id is the declaration id ("shield"), which is also the patch source.
 */
export function declarationSpecsForWindow(windowId, actor) {
  const moment = windowMoment(windowId);
  if (!moment || !actor || !featureEnabled("declaredTriggers")) return [];
  return declarationsFor(actor, moment)
    .filter((e) => e.decl.mode !== "passive" && e.item)
    .map((entry) => ({
      id: entry.decl.id,
      declarationKey: entry.key,
      window: windowId,
      mode: entry.decl.mode,
      rule: entry.decl.rule ?? `trigger.${entry.decl.id}`,
      label: entry.decl.label ?? entry.decl.id,
      rewriteKeys: [],
      declaration: entry,
      selfTrigger: Boolean(entry.decl.selfTrigger),
      rangeFeet: entry.decl.range ?? null,
      needsSight: Boolean(entry.decl.sight),
      match: (item) => item?.id === entry.item.id,
      ...(entry.decl.offer ? { offer: (who) => offeredActivities(entry.decl.offer, who) } : {}),
      eligible: (ctx, scope) => entryHolds(entry, ctx, scope ?? createMomentScope(ctx)),
      buildPatches: async (ctx, scope) => {
        const out = await runEntry(entry, ctx, scope ?? createMomentScope(ctx), { parentId: ctx.parentId ?? null });
        return out.patches;
      }
    }));
}

function usedThroughEntry(entry, actor, item) {
  if (!item) return true;
  if (entry.decl.offer) return offeredActivities(entry.decl.offer, actor).some((a) => a.item?.id === item.id);
  return entry.item?.id === item.id;
}

/**
 * A soft prompt was answered with a use: run the steps of the soft declarations
 * it offered (Riposte spends a superiority die and arms its rider before the attack).
 * @param {object} options  the prompt options (triggerIds, triggerTokenUuid, targetUuids, windowId, parentId)
 */
export async function runSoftDeclarationUse(actor, item, options = {}) {
  if (!actor || !featureEnabled("declaredTriggers")) return;
  const ids = new Set(options.triggerIds ?? []);
  const entries = allDeclarations(actor).filter((e) => ids.has(e.decl.id)
    && e.decl.mode === "soft" && e.decl.do.length && usedThroughEntry(e, actor, item));
  if (!entries.length) return;
  const scope = createMomentScope({
    triggerTokenUuid: options.triggerTokenUuid ?? null,
    targetUuids: options.targetUuids ?? [],
    damageTypes: options.damageTypes ?? []
  });
  const token = tokenForActor(actor);
  const ctx = token
    ? candidateContext(scope, token, { windowId: options.windowId ?? null })
    : { ...scope.baseCtx, actor, windowId: options.windowId ?? null };
  for (const entry of entries) {
    await runEntry(entry, ctx, scope, { parentId: options.parentId ?? null });
  }
}

/**
 * Publish a moment that has no reaction window (turn start / end).
 * @returns {Promise<object[]>} patches (no consumer reads turn patches today)
 */
export async function publishMoment(momentId, baseCtx = {}, { parentId = null } = {}) {
  return runPassiveTriggers(momentId, { baseCtx, parentId });
}

function tokenUuidForCombatant(combat, combatantId) {
  const combatant = combatantId ? combat?.combatants?.get?.(combatantId) : null;
  const token = combatant?.token ?? null;
  return token ? (token.uuid ?? tokenUuidOf(token)) : null;
}

/** combatTurnChange (primary writer only): turnEnd for who just went, turnStart for who is up. */
export async function publishTurnMoments(combat, prior = {}, current = {}) {
  if (!featureEnabled("declaredTriggers")) return;
  try {
    const ended = tokenUuidForCombatant(combat, prior?.combatantId);
    if (ended) await publishMoment("turnEnd", { triggerTokenUuid: ended });
    const started = tokenUuidForCombatant(combat, current?.combatantId);
    if (started) await publishMoment("turnStart", { triggerTokenUuid: started });
  } catch (err) {
    console.warn(`${MODULE_ID} | turn triggers failed`, err);
  }
}

export function bindTriggerIndexHooks(route) {
  bindTriggerIndex(route);
}
