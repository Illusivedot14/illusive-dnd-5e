/**
 * Reaction registry — windows, mode, trigger conditions, rewrite patches.
 * See docs/combat-engine.md §9. Citations: src/rules/catalog.mjs combat.reaction.*.
 */

import {
  listActivities,
  isPhysicalType,
  isElementalType,
  isMeleeAttack
} from "../../domain/combat/activity-kind.mjs";
import { MODULE_ID } from "../../constants.mjs";
import { actorFromUuid } from "../../foundry/token-lookup.mjs";
import { createEmbedded, updateDoc } from "../../foundry/write-gateway.mjs";
import {
  grantNextD20Advantage,
  addPendingHitRider,
  getReadiedAction,
  setReadiedAction
} from "./reaction-state.mjs";

function nameOf(item) {
  return String(item?.name ?? "");
}

function idOf(item) {
  return String(item?.system?.identifier ?? item?.identifier ?? "").toLowerCase();
}

function matcher({ names = [], ids = [] }) {
  return (item) => ids.includes(idOf(item)) || names.some((re) => re.test(nameOf(item)));
}

/** 2014 and 2024 share names where only the 2024 feature is a Reaction (Countercharm, Hunter's Defense). */
function usesReaction(item) {
  if (item?.system?.activation?.type === "reaction") return true;
  return listActivities(item).some((a) => a?.activation?.type === "reaction");
}

function reactionMatcher(spec) {
  const base = matcher(spec);
  return (item) => base(item) && usesReaction(item);
}

const isDeflectMissiles = matcher({ names: [/deflect\s*missiles/i], ids: ["deflect-missiles"] });
const isDeflectAttacks = matcher({ names: [/deflect\s*attacks/i], ids: ["deflect-attacks"] });
const isDeflectEnergy = matcher({ names: [/deflect\s*energy/i], ids: ["deflect-energy"] });
const isRiposte = matcher({ names: [/riposte/i], ids: ["riposte"] });
const isRetaliation = matcher({ names: [/^retaliation$/i], ids: ["retaliation"] });

/** 60 ft sight-range reactions (Counterspell, Silvery Barbs, Cutting Words, Hellish Rebuke, Feather Fall). */
const SIXTY = 60;

/** Ready trigger → the window that releases it. */
export const READY_TRIGGER_WINDOWS = Object.freeze({
  move: "after-move",
  cast: "on-cast",
  attack: "on-attack-declared"
});

function hasItem(actor, test) {
  return [...(actor?.items ?? [])].some((item) => test(item));
}

/** Melee weapon attacks the actor can make as a reaction (Retaliation, Riposte). */
function meleeWeaponAttacks(actor) {
  const out = [];
  for (const item of actor?.items ?? []) {
    if (item.type !== "weapon") continue;
    if (item.system?.equipped === false) continue;
    for (const act of listActivities(item)) {
      if (act?.type !== "attack" || !isMeleeAttack(act, item)) continue;
      act.item = item;
      out.push(act);
    }
  }
  return out;
}

function wieldsShield(actor) {
  return hasItem(actor, (i) => i.type === "equipment"
    && i.system?.type?.value === "shield"
    && i.system?.equipped !== false);
}

/**
 * Context passed to match / eligible / offer:
 * { windowId, actor, isTarget, isTrigger, hostile, canSeeTrigger, distanceToTrigger,
 *   nearTargetUuid, nearTargetFeet, attackRoll, melee, ranged, weaponAttack, elemental,
 *   damageTypes, isDamaged, charmOrFear }
 *
 * @typedef {{
 *   id: string,
 *   window?: string,
 *   windows?: string[],
 *   mode: "hard"|"soft",
 *   rule: string,
 *   rewriteKeys: string[],
 *   match: (item: object, ctx?: object) => boolean,
 *   offer?: (actor: object, ctx: object) => object[],
 *   eligible?: (ctx: object) => boolean,
 *   rangeFeet?: number|null,
 *   needsSight?: boolean,
 *   selfTrigger?: boolean,
 *   beforeUse?: (actor: object, item: object) => Promise<void>,
 *   afterUse?: (actor: object, item: object) => Promise<void>
 * }} ReactionSpec
 */

/** @type {Record<string, ReactionSpec>} */
export const REACTION_REGISTRY = Object.freeze({
  shield: {
    id: "shield",
    window: "on-attack-hit",
    mode: "hard",
    rule: "combat.reaction.shield",
    rewriteKeys: ["acBonus"],
    match: matcher({ names: [/^shield$/i], ids: ["shield"] }),
    eligible: (ctx) => Boolean(ctx.isTarget && ctx.attackRoll !== false)
  },
  parry: {
    id: "parry",
    window: "on-attack-hit",
    mode: "hard",
    rule: "combat.reaction.parry",
    rewriteKeys: ["acBonus"],
    match: matcher({ names: [/^parry$/i], ids: ["parry"] }),
    eligible: (ctx) => Boolean(ctx.isTarget && ctx.melee)
  },
  counterspell: {
    id: "counterspell",
    window: "on-cast",
    mode: "hard",
    rule: "combat.reaction.counterspell",
    rewriteKeys: ["cancelCast"],
    rangeFeet: SIXTY,
    needsSight: true,
    match: matcher({ names: [/counterspell/i], ids: ["counterspell"] }),
    eligible: (ctx) => ctx.hostile !== false
  },
  "silvery-barbs": {
    id: "silvery-barbs",
    windows: ["on-attack-hit", "on-save-success", "on-check-success"],
    mode: "hard",
    rule: "combat.reaction.silvery-barbs",
    rewriteKeys: ["rerollAttack", "rerollD20"],
    rangeFeet: SIXTY,
    needsSight: true,
    match: matcher({ names: [/silvery\s*barbs/i], ids: ["silvery-barbs"] }),
    eligible: (ctx) => ctx.hostile !== false && !ctx.isTarget
  },
  "cutting-words": {
    id: "cutting-words",
    window: "on-attack-hit",
    mode: "hard",
    rule: "combat.reaction.cutting-words",
    rewriteKeys: ["attackPenalty"],
    rangeFeet: SIXTY,
    needsSight: true,
    match: matcher({ names: [/cutting\s*words/i], ids: ["cutting-words"] }),
    eligible: (ctx) => ctx.hostile !== false
  },
  protection: {
    id: "protection",
    window: "on-attack-declared",
    mode: "hard",
    rule: "combat.reaction.protection",
    rewriteKeys: ["attackDisadvantage"],
    needsSight: true,
    match: matcher({ names: [/^(fighting\s*style:\s*)?protection$/i], ids: ["protection"] }),
    eligible: (ctx) => Boolean(!ctx.isTarget && ctx.nearTargetUuid && ctx.hostile !== false
      && wieldsShield(ctx.actor))
  },
  countercharm: {
    id: "countercharm",
    window: "on-save-fail",
    mode: "hard",
    rule: "combat.reaction.countercharm",
    rewriteKeys: ["rerollD20"],
    rangeFeet: 30,
    selfTrigger: true,
    match: reactionMatcher({ names: [/countercharm/i], ids: ["countercharm"] }),
    eligible: (ctx) => Boolean(ctx.charmOrFear && ctx.hostile === false)
  },
  "uncanny-dodge": {
    id: "uncanny-dodge",
    window: "on-damage-known",
    mode: "hard",
    rule: "combat.reaction.uncanny-dodge",
    rewriteKeys: ["damageMultiplier"],
    needsSight: true,
    match: matcher({ names: [/uncanny\s*dodge/i], ids: ["uncanny-dodge"] }),
    eligible: (ctx) => Boolean(ctx.isTarget && ctx.attackRoll)
  },
  "absorb-elements": {
    id: "absorb-elements",
    window: "on-damage-known",
    mode: "hard",
    rule: "combat.reaction.absorb-elements",
    rewriteKeys: ["resistTypes", "pendingHitRider"],
    match: matcher({ names: [/absorb\s*elements/i], ids: ["absorb-elements"] }),
    eligible: (ctx) => Boolean(ctx.isTarget && ctx.elemental)
  },
  deflect: {
    id: "deflect",
    window: "on-damage-known",
    mode: "hard",
    rule: "combat.reaction.deflect",
    rewriteKeys: ["damageReduce"],
    // 2014 Deflect Missiles: ranged weapon attack. 2024 Deflect Attacks: attack dealing
    // B/P/S. Deflect Energy (Monk 13): any damage type from an attack.
    match: (item, ctx) => {
      if (!ctx) return isDeflectMissiles(item) || isDeflectAttacks(item) || isDeflectEnergy(item);
      if (!ctx.attackRoll) return false;
      if (isDeflectEnergy(item)) return true;
      if (isDeflectAttacks(item)) return (ctx.damageTypes ?? []).some(isPhysicalType);
      if (isDeflectMissiles(item)) return Boolean(ctx.ranged && ctx.weaponAttack !== false);
      return false;
    },
    eligible: (ctx) => Boolean(ctx.isTarget)
  },
  "stones-endurance": {
    id: "stones-endurance",
    window: "on-damage-known",
    mode: "hard",
    rule: "combat.reaction.stones-endurance",
    rewriteKeys: ["damageReduce"],
    match: matcher({ names: [/stone'?s\s*endurance/i], ids: ["stones-endurance", "stone-s-endurance"] }),
    eligible: (ctx) => Boolean(ctx.isTarget)
  },
  "superior-hunters-defense": {
    id: "superior-hunters-defense",
    window: "on-damage-known",
    mode: "hard",
    rule: "combat.reaction.superior-hunters-defense",
    rewriteKeys: ["resistTypes"],
    match: reactionMatcher({
      names: [/superior\s*hunter'?s\s*defen[cs]e/i],
      ids: ["superior-hunters-defense", "superior-hunter-s-defense"]
    }),
    eligible: (ctx) => Boolean(ctx.isTarget && (ctx.damageTypes ?? []).length)
  },
  interception: {
    id: "interception",
    window: "on-damage-known",
    mode: "hard",
    rule: "combat.reaction.interception",
    rewriteKeys: ["damageReduce"],
    needsSight: true,
    match: matcher({ names: [/^(fighting\s*style:\s*)?interception$/i], ids: ["interception"] }),
    eligible: (ctx) => Boolean(ctx.attackRoll && !ctx.isTarget && ctx.nearTargetUuid && ctx.hostile !== false)
  },
  "feather-fall": {
    id: "feather-fall",
    window: "on-fall",
    mode: "hard",
    rule: "combat.reaction.feather-fall",
    rewriteKeys: ["damageMultiplier"],
    rangeFeet: SIXTY,
    needsSight: true,
    selfTrigger: true,
    match: matcher({ names: [/feather\s*fall/i], ids: ["feather-fall"] })
  },
  "slow-fall": {
    id: "slow-fall",
    window: "on-fall",
    mode: "hard",
    rule: "combat.reaction.slow-fall",
    rewriteKeys: ["damageReduce"],
    selfTrigger: true,
    match: matcher({ names: [/slow\s*fall/i], ids: ["slow-fall"] }),
    eligible: (ctx) => Boolean(ctx.isTrigger)
  },
  "hellish-rebuke": {
    id: "hellish-rebuke",
    window: "after-damage-applied",
    mode: "soft",
    rule: "combat.reaction.hellish-rebuke",
    rewriteKeys: [],
    rangeFeet: SIXTY,
    needsSight: true,
    match: matcher({ names: [/hellish\s*rebuke/i], ids: ["hellish-rebuke"] }),
    eligible: (ctx) => Boolean(ctx.isDamaged)
  },
  "storms-thunder": {
    id: "storms-thunder",
    window: "after-damage-applied",
    mode: "soft",
    rule: "combat.reaction.storms-thunder",
    rewriteKeys: [],
    rangeFeet: SIXTY,
    match: matcher({ names: [/storm'?s\s*thunder/i], ids: ["storms-thunder", "storm-s-thunder"] }),
    eligible: (ctx) => Boolean(ctx.isDamaged)
  },
  "wrath-of-the-storm": {
    id: "wrath-of-the-storm",
    window: "after-damage-applied",
    mode: "soft",
    rule: "combat.reaction.wrath-of-the-storm",
    rewriteKeys: [],
    rangeFeet: 5,
    needsSight: true,
    match: matcher({ names: [/wrath\s*of\s*the\s*storm/i], ids: ["wrath-of-the-storm"] }),
    eligible: (ctx) => Boolean(ctx.isDamaged && ctx.attackRoll)
  },
  retaliation: {
    id: "retaliation",
    window: "after-damage-applied",
    mode: "soft",
    rule: "combat.reaction.retaliation",
    rewriteKeys: [],
    rangeFeet: 5,
    match: isRetaliation,
    offer: (actor) => (hasItem(actor, isRetaliation) ? meleeWeaponAttacks(actor) : []),
    eligible: (ctx) => Boolean(ctx.isDamaged)
  },
  riposte: {
    id: "riposte",
    window: "on-attack-miss",
    mode: "soft",
    rule: "combat.reaction.riposte",
    rewriteKeys: ["pendingHitRider"],
    rangeFeet: 5,
    match: isRiposte,
    offer: (actor) => (hasItem(actor, isRiposte) && superiorityDiceLeft(actor) !== 0
      ? meleeWeaponAttacks(actor)
      : []),
    eligible: (ctx) => Boolean(ctx.isTarget && ctx.melee),
    beforeUse: async (actor) => {
      await spendSuperiorityDie(actor);
      await addPendingHitRider(actor, { source: "riposte", formula: superiorityDie(actor), meleeOnly: true });
    }
  },
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

/** Activities on actor matching a registry spec (ctx-aware for edition variants). */
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

/** Pre/post use hooks for soft reactions (resource spend, readied flag clear). */
export async function runReactionUseHooks(phase, triggerIds = [], actor, item) {
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
}

function rollData(actor) {
  try {
    return typeof actor?.getRollData === "function" ? actor.getRollData() : (actor?.system ?? {});
  } catch {
    return {};
  }
}

/** Evaluate a formula; deterministic average fallback when Roll is unavailable (tests). */
async function evalFormula(formula, actor, fallback) {
  const RollCls = globalThis.Roll;
  if (RollCls) {
    try {
      const roll = await new RollCls(String(formula), rollData(actor)).evaluate();
      if (typeof roll?.toMessage === "function") {
        try { await roll.toMessage({ flavor: formula }); } catch { /* chat optional */ }
      }
      const total = Number(roll?.total);
      if (Number.isFinite(total)) return total;
    } catch {
      /* fall through */
    }
  }
  return fallback;
}

function monkLevel(actor) {
  const fromClasses = actor?.classes?.monk?.system?.levels;
  const fromData = rollData(actor)?.classes?.monk?.levels;
  return Number(fromClasses ?? fromData) || 0;
}

function abilityMod(actor, key) {
  return Number(actor?.system?.abilities?.[key]?.mod) || 0;
}

function profBonus(actor) {
  return Number(actor?.system?.attributes?.prof) || 2;
}

function dieFromScale(entry) {
  const die = entry?.formula ?? entry?.die ?? (typeof entry === "string" ? entry : null);
  if (!die) return null;
  return String(die).startsWith("d") ? `1${die}` : String(die);
}

function bardicDie(actor) {
  const scale = rollData(actor)?.scale?.bard ?? actor?.system?.scale?.bard ?? {};
  return dieFromScale(scale["bardic-inspiration"] ?? scale.inspiration ?? scale["bardic-die"]) ?? "1d6";
}

function superiorityDie(actor) {
  const scale = rollData(actor)?.scale ?? {};
  for (const group of [scale["battle-master"], scale.fighter, scale["combat-superiority"]]) {
    const die = dieFromScale(group?.["combat-superiority-die"] ?? group?.["superiority-die"] ?? group?.die);
    if (die) return die;
  }
  return "1d8";
}

function superiorityDiceItem(actor) {
  return [...(actor?.items ?? [])].find((i) => /superiority/i.test(nameOf(i))
    && Number(i.system?.uses?.max) > 0) ?? null;
}

/** Remaining superiority dice, or null when the actor tracks none. */
function superiorityDiceLeft(actor) {
  const item = superiorityDiceItem(actor);
  if (!item) return null;
  const uses = item.system.uses;
  return Number(uses.value ?? (Number(uses.max) - (Number(uses.spent) || 0))) || 0;
}

async function spendSuperiorityDie(actor) {
  const item = superiorityDiceItem(actor);
  if (!item?.update) return false;
  const result = await updateDoc(item, { "system.uses.spent": (Number(item.system.uses.spent) || 0) + 1 });
  return Boolean(result.ok);
}

/** Monster Parry: "adds N to its AC"; falls back to proficiency bonus (2014 stat blocks). */
function parryBonus(actor) {
  const item = [...(actor?.items ?? [])].find((i) => /^parry$/i.test(nameOf(i)) || idOf(i) === "parry");
  const text = String(item?.system?.description?.value ?? "");
  const m = /adds?\s*(\d+)\s*to\s*(?:its|their|his|her)\s*AC/i.exec(text);
  return m ? Number(m[1]) : profBonus(actor);
}

function editionOf(ctx) {
  return ctx?.rulesContext?.legacy || ctx?.rulesContext?.edition === "2014" ? "2014" : "2024";
}

/**
 * Counterspell outcome.
 * 2024 (PHB 2024 Counterspell): caster makes a Con save vs reactor's spell save DC;
 *   on failure the spell fails, its action is wasted, and its slot is not expended.
 * 2014 (PHB 2014 Counterspell): auto-success if spell level <= the counter slot level (3+);
 *   otherwise reactor makes a spellcasting ability check DC 10 + spell level.
 */
export async function resolveCounterspell({ reactor, caster, spellLevel = 0, ctx = {} } = {}) {
  const edition = editionOf(ctx);
  if (edition === "2014") {
    const level = Number(spellLevel) || 0;
    const counterLevel = Math.max(3, Number(ctx.counterSlotLevel) || 3);
    if (level <= counterLevel) return { countered: true, edition, auto: true, counterLevel };
    const ability = reactor?.system?.attributes?.spellcasting || "int";
    const dc = 10 + level;
    let total = null;
    try {
      const rolls = await reactor?.rollAbilityCheck?.({ ability, target: dc }, { configure: false });
      total = Number((Array.isArray(rolls) ? rolls[0] : rolls)?.total);
    } catch {
      total = null;
    }
    if (!Number.isFinite(total)) total = 10 + abilityMod(reactor, ability);
    return { countered: total >= dc, edition, dc, total, counterLevel };
  }

  const dc = Number(reactor?.system?.attributes?.spell?.dc) || 13;
  let total = null;
  try {
    const rolls = await caster?.rollSavingThrow?.({ ability: "con", target: dc }, { configure: false });
    total = Number((Array.isArray(rolls) ? rolls[0] : rolls)?.total);
  } catch {
    total = null;
  }
  if (!Number.isFinite(total)) return { countered: true, edition, dc, total: null };
  return { countered: total < dc, edition, dc, total, refundSlot: total < dc };
}

/** Resistance to the triggering types until the end of the current turn (Superior Hunter's Defense). */
async function resistUntilTurnEnd(actor, types, source) {
  if (!actor?.createEmbeddedDocuments || !types.length) return null;
  try {
    const { docs: [effect] = [] } = await createEmbedded(actor, "ActiveEffect", [{
      name: "Superior Hunter's Defense",
      img: "icons/magic/defensive/shield-barrier-glowing-blue.webp",
      transfer: false,
      changes: types.map((t) => ({ key: "system.traits.dr.value", type: "add", value: t })),
      flags: { [MODULE_ID]: { specialDuration: ["currentTurnEnd"], source } }
    }]);
    return effect ?? null;
  } catch {
    return null;
  }
}

/**
 * Patches a used reaction emits for the parent pipeline.
 * Side effects that outlive the window (Silvery Barbs advantage, Absorb Elements rider,
 * Hunter's Defense resistance) are written here.
 * @param {string} triggerId
 * @param {{ reactor?: object, caster?: object, targetUuid?: string, spellLevel?: number,
 *   slotLevel?: number, allyUuid?: string, windowId?: string, nearTargetUuid?: string,
 *   damageTypes?: string[], rulesContext?: object }} ctx
 */
export async function buildReactionPatches(triggerId, ctx = {}) {
  const targetUuid = ctx.targetUuid ?? ctx.targetUuids?.[0] ?? null;
  const reactor = ctx.reactor ?? null;
  const source = triggerId;

  switch (triggerId) {
    case "shield":
      return [{ type: "acBonus", targetUuid, value: 5, source }];
    case "parry":
      return [{ type: "acBonus", targetUuid, value: parryBonus(reactor), source }];
    case "counterspell": {
      const outcome = await resolveCounterspell({
        reactor,
        caster: ctx.caster,
        spellLevel: ctx.spellLevel,
        ctx
      });
      return outcome.countered
        ? [{ type: "cancelCast", source, refundSlot: Boolean(outcome.refundSlot), detail: outcome }]
        : [{ type: "note", source, detail: { ...outcome, countered: false } }];
    }
    case "silvery-barbs": {
      const ally = (ctx.allyUuid ? actorFromUuid(ctx.allyUuid) : null) ?? reactor;
      if (ally) await grantNextD20Advantage(ally, { source });
      const reroll = ctx.windowId === "on-attack-hit"
        ? { type: "rerollAttack", source, keep: "lower" }
        : { type: "rerollD20", source, keep: "lower" };
      return [reroll, { type: "note", source, detail: { advantageTo: ally?.uuid ?? null } }];
    }
    case "countercharm":
      return [{ type: "rerollD20", source, keep: "new", advantage: true }];
    case "cutting-words": {
      const formula = bardicDie(reactor);
      const value = await evalFormula(formula, reactor, 3);
      return [{ type: "attackPenalty", value, source, formula }];
    }
    case "protection":
      return [{ type: "attackDisadvantage", source }];
    case "uncanny-dodge":
      return [{ type: "damageMultiplier", targetUuid, value: 0.5, source }];
    case "absorb-elements": {
      const types = (ctx.damageTypes ?? []).filter(isElementalType);
      const dice = Math.max(1, Number(ctx.slotLevel) || 1);
      if (reactor && types[0]) {
        await addPendingHitRider(reactor, {
          source,
          formula: `${dice}d6`,
          damageType: types[0],
          meleeOnly: true,
          ownTurnOnly: true
        });
      }
      return [{ type: "resistTypes", targetUuid, value: types, source }];
    }
    case "deflect": {
      const formula = `1d10 + ${abilityMod(reactor, "dex")} + ${monkLevel(reactor)}`;
      const value = await evalFormula(formula, reactor, 5 + abilityMod(reactor, "dex") + monkLevel(reactor));
      return [{ type: "damageReduce", targetUuid, value: Math.max(0, value), source, formula }];
    }
    case "stones-endurance": {
      const formula = `1d12 + ${abilityMod(reactor, "con")}`;
      const value = await evalFormula(formula, reactor, 6 + abilityMod(reactor, "con"));
      return [{ type: "damageReduce", targetUuid, value: Math.max(0, value), source, formula }];
    }
    case "superior-hunters-defense": {
      const types = [...new Set(ctx.damageTypes ?? [])];
      await resistUntilTurnEnd(reactor, types, source);
      return [{ type: "resistTypes", targetUuid, value: types, source }];
    }
    case "interception": {
      const formula = `1d10 + ${profBonus(reactor)}`;
      const value = await evalFormula(formula, reactor, 5 + profBonus(reactor));
      return [{ type: "damageReduce", targetUuid: ctx.nearTargetUuid ?? targetUuid, value: Math.max(0, value), source, formula }];
    }
    case "feather-fall":
      return [{ type: "damageMultiplier", targetUuid: ctx.targetUuids?.[0] ?? targetUuid, value: 0, source }];
    case "slow-fall":
      return [{ type: "damageReduce", targetUuid, value: 5 * monkLevel(reactor), source }];
    default:
      return [];
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
