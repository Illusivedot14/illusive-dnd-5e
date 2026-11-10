/**
 * Reaction registry — reactions that are not item rules, plus the shared
 * activity listing and patch merge every reaction window uses.
 *
 * Item reactions (Shield, Counterspell, Deflect, Riposte, …) are declarations in
 * src/content/declarations.mjs, offered through triggers/engine.mjs
 * declarationSpecsForWindow. Ready stays here: it reads the readier's flag, not an item.
 * See docs/combat-engine.md §9. Citations: src/rules/catalog.mjs.
 */

import { listActivities } from "../../domain/combat/activity-kind.mjs";
import { MODULE_ID } from "../../constants.mjs";
import { runSoftDeclarationUse } from "../triggers/engine.mjs";
import { getReadiedAction, setReadiedAction } from "./reaction-state.mjs";

/** Ready trigger → the window that releases it. */
export const READY_TRIGGER_WINDOWS = Object.freeze({
  move: "after-move",
  cast: "on-cast",
  attack: "on-attack-declared"
});

/**
 * @typedef {{
 *   id: string,
 *   window?: string,
 *   windows?: string[],
 *   mode: "hard"|"soft",
 *   rule: string,
 *   rewriteKeys: string[],
 *   match: (item: object, ctx?: object) => boolean,
 *   offer?: (actor: object, ctx: object) => object[],
 *   eligible?: (ctx: object, scope?: object) => boolean,
 *   rangeFeet?: number|null,
 *   needsSight?: boolean,
 *   selfTrigger?: boolean,
 *   buildPatches?: (ctx: object, scope?: object) => Promise<object[]>,
 *   beforeUse?: (actor: object, item: object) => Promise<void>,
 *   afterUse?: (actor: object, item: object) => Promise<void>
 * }} ReactionSpec
 */

/** @type {Record<string, ReactionSpec>} */
export const REACTION_REGISTRY = Object.freeze({
  ready: {
    id: "ready",
    windows: Object.values(READY_TRIGGER_WINDOWS),
    mode: "soft",
    rule: "combat.action.ready",
    rewriteKeys: [],
    match: () => false,
    offer: (actor, ctx) => readiedActivities(actor, ctx),
    afterUse: async (actor) => {
      await setReadiedAction(actor, null);
    }
  }
});

export function getReactionSpec(id) {
  return REACTION_REGISTRY[id] ?? null;
}

export function specWindows(spec) {
  return spec?.windows ?? (spec?.window ? [spec.window] : []);
}

export function listReactionsForWindow(windowId) {
  return Object.values(REACTION_REGISTRY).filter((s) => specWindows(s).includes(windowId));
}

/** Activities on actor matching a spec (registry or declaration). */
export function listMatchingActivities(actor, spec, ctx = undefined) {
  if (!spec || !actor?.items) return [];
  if (typeof spec.offer === "function") return spec.offer(actor, ctx ?? {}) ?? [];
  const out = [];
  for (const item of actor.items) {
    if (!spec.match(item, ctx)) continue;
    const list = listActivities(item);
    for (const act of list) {
      act.item = item;
      out.push(act);
    }
    if (!list.length) out.push({ id: item.id, item, type: "utility", name: item.name });
  }
  return out;
}

/** The readied activity, when this window releases the readier's trigger. */
function readiedActivities(actor, ctx = {}) {
  const readied = getReadiedAction(actor);
  if (!readied?.itemId || READY_TRIGGER_WINDOWS[readied.trigger] !== ctx.windowId) return [];
  if (ctx.isTrigger || ctx.hostile === false) return [];
  const range = Number(readied.rangeFeet);
  if (Number.isFinite(range) && range > 0 && ctx.distanceToTrigger != null && ctx.distanceToTrigger > range) {
    return [];
  }
  const item = actor.items?.get?.(readied.itemId);
  const act = (readied.activityId ? item?.system?.activities?.get?.(readied.activityId) : null)
    ?? listActivities(item)[0];
  if (!act) return [];
  act.item = item;
  return [act];
}

/**
 * Pre/post use hooks for soft reactions: registry hooks (Ready clears its flag)
 * and, before the use, the steps of the soft declarations the prompt offered.
 * @param {object} [options] the prompt options (triggerIds, triggerTokenUuid, targetUuids, windowId, parentId)
 */
export async function runReactionUseHooks(phase, triggerIds = [], actor, item, options = {}) {
  const key = phase === "before" ? "beforeUse" : "afterUse";
  for (const id of triggerIds) {
    const fn = REACTION_REGISTRY[id]?.[key];
    if (typeof fn !== "function") continue;
    try {
      await fn(actor, item);
    } catch {
      /* hooks are best-effort */
    }
  }
  if (phase !== "before") return;
  try {
    await runSoftDeclarationUse(actor, item, { ...options, triggerIds });
  } catch (err) {
    console.warn(`${MODULE_ID} | soft reaction steps failed`, err);
  }
}

/** Merge patches into one outcome bag for the parent pipeline. */
export function mergePatches(patches = []) {
  const out = {
    cancelCast: false,
    refundSlot: false,
    rerollAttack: false,
    /** @type {null|{ keep: "lower"|"new", advantage: boolean }} */
    rerollD20: null,
    attackPenalty: 0,
    attackBonus: 0,
    attackAdvantage: false,
    attackDisadvantage: false,
    acBonusByTarget: new Map(),
    damageMultiplierByTarget: new Map(),
    damageReduceByTarget: new Map(),
    resistTypesByTarget: new Map(),
    notes: [],
    sources: []
  };
  for (const p of patches) {
    if (!p?.type) continue;
    out.sources.push(p.source ?? p.type);
    const key = p.targetUuid ?? p.actorUuid ?? null;
    switch (p.type) {
      case "cancelCast":
        out.cancelCast = true;
        if (p.refundSlot) out.refundSlot = true;
        break;
      case "rerollAttack":
        out.rerollAttack = true;
        break;
      case "rerollD20":
        out.rerollD20 = { keep: p.keep === "new" ? "new" : "lower", advantage: Boolean(p.advantage) };
        break;
      case "attackPenalty":
        out.attackPenalty += Number(p.value) || 0;
        break;
      case "attackBonus":
        out.attackBonus += Number(p.value) || 0;
        break;
      case "attackAdvantage":
        out.attackAdvantage = true;
        break;
      case "attackDisadvantage":
        out.attackDisadvantage = true;
        break;
      case "acBonus":
        if (key) out.acBonusByTarget.set(key, (out.acBonusByTarget.get(key) ?? 0) + (Number(p.value) || 0));
        break;
      case "damageMultiplier":
        if (key) {
          const value = Number(p.value);
          out.damageMultiplierByTarget.set(key, (out.damageMultiplierByTarget.get(key) ?? 1) * (Number.isFinite(value) ? value : 1));
        }
        break;
      case "damageReduce":
        if (key) out.damageReduceByTarget.set(key, (out.damageReduceByTarget.get(key) ?? 0) + (Number(p.value) || 0));
        break;
      case "resistTypes":
        if (key) {
          const prev = out.resistTypesByTarget.get(key) ?? [];
          out.resistTypesByTarget.set(key, [...new Set([...prev, ...(p.value ?? [])])]);
        }
        break;
      case "note":
        out.notes.push(p);
        break;
      default:
        break;
    }
  }
  return out;
}
