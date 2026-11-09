/**
 * Apply damage via Foundry dnd5e Actor5e.applyDamage only.
 *
 * Conversion matches systems/dnd5e ChatMessage5e.applyChatCardDamage:
 *   { value, type, properties: Set } + { multiplier, isDelta: true }
 *
 * applyDamageWithTrail is the single write path for combat damage: it records
 * undo-trail changes, runs concentration on HP actually lost (after the system
 * applies immunity / resistance), and offers melee knock-out at 0 HP.
 */

import { clearUserTargets } from "../foundry/token-actions.mjs";
import { tokenFromUuid, actorFromUuid } from "../foundry/token-lookup.mjs";
import { featureEnabled } from "./levels.mjs";
import { challengeConcentrationAfterDamage } from "./combat-actions.mjs";
import { maybeOfferKnockOut } from "./knockout.mjs";
import { snapshotHp } from "./party-combat.mjs";
import { applyActorDamage } from "../foundry/write-gateway.mjs";

function healingTypes() {
  return globalThis.CONFIG?.DND5E?.healingTypes ?? {};
}

/**
 * @param {object[]} rolls  DamageRoll-like objects with .total and .options.type
 * @returns {{ value: number, type: string|null, properties: Set }[]}
 */
export function damagesFromRolls(rolls = []) {
  const list = Array.isArray(rolls) ? rolls : rolls ? [rolls] : [];
  const healing = healingTypes();

  return list.map((roll) => {
    const type = roll?.options?.type ?? null;
    const total = Number(roll?.total);
    const magnitude = Number.isFinite(total) ? Math.max(0, total) : 0;
    const value = type && type in healing ? -magnitude : magnitude;
    const props = roll?.options?.properties;
    return {
      value,
      type,
      properties: props instanceof Set ? props : new Set(Array.isArray(props) ? props : props ?? [])
    };
  }).filter((d) => d.value !== 0);
}

/** Synthetic DamageRoll-like entry for flat bonuses (Rage, Graze, GWM, passive riders). */
export function flatDamageRoll(total, type = null, formula = null) {
  return { total: Number(total) || 0, formula: formula ?? String(total), options: { type } };
}

function actorResists(actor, type) {
  const dr = actor?.system?.traits?.dr?.value;
  const di = actor?.system?.traits?.di?.value;
  const has = (set) => Boolean(set && (set.has?.(type) || (Array.isArray(set) && set.includes(type))));
  return has(dr) || has(di);
}

/**
 * Reaction rewrites before the system write: flat reduction, then resistance
 * to listed types (skipped when the actor already resists — resistance does not stack).
 */
export function adjustDamages(damages, { reduce = 0, resistTypes = [], actor = null } = {}) {
  let remaining = Math.max(0, Number(reduce) || 0);
  const resist = new Set((resistTypes ?? []).map((t) => String(t).toLowerCase()));
  return damages.map((d) => {
    let value = Number(d.value) || 0;
    if (value > 0 && remaining > 0) {
      const used = Math.min(value, remaining);
      value -= used;
      remaining -= used;
    }
    const type = d.type ? String(d.type).toLowerCase() : null;
    if (value > 0 && type && resist.has(type) && !actorResists(actor, type)) {
      value = Math.floor(value / 2);
    }
    return { ...d, value };
  }).filter((d) => d.value !== 0);
}

/**
 * Write damage through the gateway (the GM applies it to creatures this user does not own).
 * @param {Actor5e} actor
 * @param {{ value: number, type?: string|null, properties?: Set }[]} damages
 * @param {{ multiplier?: number }} [opts]
 * @returns {Promise<false|{ ok: true, prior: object, next: object }>}
 */
export async function applyDamagesToActor(actor, damages, { multiplier = 1 } = {}) {
  if (!actor || typeof actor.applyDamage !== "function") return false;
  if (!Array.isArray(damages) || !damages.length) return false;
  if (!(Number(multiplier) > 0)) return false;

  const payload = damages.map((d) => ({
    value: Number(d.value) || 0,
    type: d.type || undefined,
    properties: d.properties instanceof Set ? new Set(d.properties) : new Set(d.properties ?? [])
  })).filter((d) => d.value !== 0);

  if (!payload.length) return false;

  const result = await applyActorDamage(actor, payload, { multiplier: Number(multiplier) });
  if (!result?.ok) return false;
  return { ok: true, prior: result.prior ?? null, next: result.next ?? null };
}

function hpPool(snapshot) {
  return (Number(snapshot?.value) || 0) + (Number(snapshot?.temp) || 0);
}

/**
 * @typedef {{
 *   uuid?: string,
 *   actor?: object,
 *   rolls?: object[],
 *   multiplier?: number,
 *   reduce?: number,
 *   resistTypes?: string[],
 *   tag?: object
 * }} DamageTarget
 */

/**
 * Apply damage to each target and return undo-trail changes.
 * @param {{ rolls?: object[], targets: Array<string|DamageTarget>, melee?: boolean, tag?: object }} input
 * @returns {Promise<{ changes: object[], damagedUuids: string[], applied: number, concentration: object[], knockouts: object[] }>}
 */
export async function applyDamageWithTrail({ rolls = [], targets = [], melee = false, tag = null } = {}) {
  const out = { changes: [], damagedUuids: [], applied: 0, concentration: [], knockouts: [] };

  for (const raw of targets) {
    const spec = typeof raw === "string" ? { uuid: raw } : (raw ?? {});
    const token = spec.uuid ? tokenFromUuid(spec.uuid) : null;
    const actor = spec.actor ?? token?.actor ?? actorFromUuid(spec.uuid);
    if (!actor) continue;

    const multiplier = Number(spec.multiplier ?? 1);
    const base = damagesFromRolls(spec.rolls ?? rolls);
    const damages = adjustDamages(base, { reduce: spec.reduce, resistTypes: spec.resistTypes, actor });
    if (!damages.length || !(multiplier > 0)) continue;

    let prior = snapshotHp(actor);
    let written = false;
    try {
      written = await applyDamagesToActor(actor, damages, { multiplier });
    } catch (err) {
      console.warn("illusive-dnd-5e | applyDamage failed", actor?.uuid, err);
    }
    if (!written) continue;

    if (written.prior) prior = { ...prior, ...written.prior };
    const next = written.next ? { ...snapshotHp(actor), ...written.next } : snapshotHp(actor);
    const tokenUuid = spec.uuid ?? token?.document?.uuid ?? null;
    out.applied += 1;
    if (tokenUuid) out.damagedUuids.push(tokenUuid);
    out.changes.push({
      type: "actor-hp",
      tokenUuid,
      actorUuid: actor.uuid,
      prior,
      next,
      damages,
      factor: multiplier,
      ...(tag ?? {}),
      ...(spec.tag ?? {})
    });

    const lost = hpPool(prior) - hpPool(next);
    if (lost > 0) {
      const conc = await challengeConcentrationAfterDamage(actor, lost);
      if (conc) {
        out.concentration.push({ actorUuid: actor.uuid, ...conc });
        if (conc.dropped) {
          out.changes.push({
            type: "effect",
            actorUuid: actor.uuid,
            tokenUuid,
            detail: `Concentration dropped (DC ${conc.dc})`,
            concentrationDropped: true,
            effectUuids: []
          });
        } else if (conc.checked || conc.prompted) {
          out.changes.push({
            type: "note",
            actorUuid: actor.uuid,
            tokenUuid,
            detail: conc.prompted ? `Concentration check (DC ${conc.dc})` : `Concentration held (DC ${conc.dc})`
          });
        }
      }
    }

    if (melee && prior.value > 0 && next.value <= 0) {
      const ko = await maybeOfferKnockOut(actor, { melee: true, name: actor.name });
      if (ko?.knockedOut) {
        out.knockouts.push({ actorUuid: actor.uuid, effectUuids: ko.effectUuids ?? [], priorDeath: ko.priorDeath });
        out.changes.push({
          type: "knockout",
          actorUuid: actor.uuid,
          effectUuids: ko.effectUuids ?? [],
          priorDeath: ko.priorDeath,
          detail: "Knocked out (unconscious + stable)"
        });
      }
    }
  }
  return out;
}

function resolveTargets(targetUuids = null) {
  if (Array.isArray(targetUuids) && targetUuids.length) return targetUuids.map((uuid) => ({ uuid }));
  return [...(game.user?.targets ?? [])]
    .map((t) => ({ uuid: t?.document?.uuid ?? t?.uuid ?? null, actor: t?.actor ?? null }))
    .filter((t) => t.actor);
}

/**
 * Apply rolled damage to explicit targets (or the user's targets).
 * Fallback path for damage rolls Illusive did not drive (hooks.mjs).
 */
export async function applyDamageRolls({
  rolls = [],
  targetUuids = null,
  clearTargets = true,
  multiplier = 1,
  melee = false
} = {}) {
  if (!featureEnabled("autoApplyDeterministic")) return 0;
  if (!damagesFromRolls(rolls).length) return 0;

  const targets = resolveTargets(targetUuids);
  if (!targets.length) return 0;

  const result = await applyDamageWithTrail({
    rolls,
    targets: targets.map((t) => ({ ...t, multiplier })),
    melee
  });
  if (clearTargets && result.applied > 0) clearUserTargets();
  return result;
}
