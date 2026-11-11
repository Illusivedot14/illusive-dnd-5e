/**
 * Apply dnd5e activity effect profiles to target actors.
 * Matches EffectApplicationElement._applyEffectToActor semantics.
 */

import { shouldApplyEffectOnSave } from "../domain/combat/save-outcome.mjs";
import { getConcentrationEffect } from "../foundry/dnd5e-adapter.mjs";
import { tokenFromUuid as resolveToken } from "../foundry/token-lookup.mjs";
import { createEmbedded, updateDoc } from "../foundry/write-gateway.mjs";
import { readMetamagic } from "./triggers/feature-steps.mjs";

function extendDuration(data, caster) {
  if (readMetamagic(caster) !== "extended" || !data?.duration) return;
  const duration = data.duration;
  if (Number(duration.seconds) > 0) duration.seconds *= 2;
  if (Number(duration.rounds) > 0) duration.rounds *= 2;
}

/**
 * Resolve the ActiveEffect document for an activity effect profile.
 */
export function resolveProfileEffect(activity, profile) {
  if (!profile) return null;
  let effect = profile.effect;
  if (effect && typeof effect === "object" && typeof effect.toObject === "function") return effect;

  const id = typeof effect === "string" ? effect : profile._id;
  if (!id) return null;
  return activity.item?.effects?.get?.(id)
    ?? [...(activity.item?.effects ?? [])].find((e) => e.id === id || e._id === id || e.uuid === id)
    ?? null;
}

/**
 * Profiles from a save/attack activity that should fire for this save outcome.
 * dnd5e label "Always Apply" (onSave: true) = apply on success AND on failure.
 * onSave: false / missing = failed save only (or on hit for attack activities).
 */
export function selectActivityEffectProfiles(activity, saved) {
  const profiles = activity?.effects;
  if (!profiles?.length) return [];

  const level = Number(activity.relevantLevel) || 0;
  const out = [];
  for (const profile of profiles) {
    const min = profile.level?.min ?? -Infinity;
    const max = profile.level?.max ?? Infinity;
    if (level < min || level > max) continue;

    const effect = resolveProfileEffect(activity, profile);
    if (!effect) continue;
    if (effect.type === "enchantment") continue;

    if (activity?.type === "save") {
      if (!shouldApplyEffectOnSave({ saved, effectOnSave: Boolean(profile.onSave) })) continue;
    }
    out.push({ profile, effect });
  }
  return out;
}

/**
 * Create / refresh transferred copies of activity effects on target actors.
 * @returns {Promise<Array<{ tokenUuid: string, actorUuid: string, effectUuids: string[] }>>}
 */
export async function applyActivityEffects({
  activity,
  targetUuids = [],
  savedByUuid = null
} = {}) {
  if (!activity || !targetUuids.length) return [];

  const caster = activity.actor ?? activity.item?.actor ?? null;
  const concentration = caster ? getConcentrationEffect(caster, activity.item) : null;
  const createEffect = globalThis.ActiveEffect?.implementation?.create
    ?? globalThis.CONFIG?.ActiveEffect?.documentClass?.create
    ?? null;

  const results = [];
  for (const uuid of targetUuids) {
    const token = resolveToken(uuid);
    const actor = token?.actor;
    if (!actor) continue;

    const saved = Boolean(
      savedByUuid?.get?.(uuid)
      ?? savedByUuid?.[uuid]
      ?? false
    );
    const selected = selectActivityEffectProfiles(activity, saved);
    if (!selected.length) continue;

    const created = [];
    for (const { effect } of selected) {
      try {
        const origin = concentration?.uuid
          ?? activity.item?.uuid
          ?? effect.origin
          ?? activity.uuid;

        // Re-enable an existing copy with the same origin (dnd5e chat tray behavior)
        const existing = [...(actor.effects ?? [])].find((e) => {
          if (e.origin !== origin) return false;
          if (e.name && effect.name && e.name === effect.name) return true;
          return statusesOverlap(e.statuses, effect.statuses);
        });
        if (existing && typeof existing.update === "function") {
          const duration = effect.constructor?.getInitialDuration?.()
            ?? globalThis.ActiveEffect?.getInitialDuration?.()
            ?? {};
          await updateDoc(existing, {
            ...duration,
            disabled: false,
            "flags.dnd5e.dependentOn": concentration?.uuid ?? existing.flags?.dnd5e?.dependentOn
          });
          if (existing.uuid) created.push(existing.uuid);
          continue;
        }

        const base = typeof effect.toObject === "function"
          ? effect.toObject()
          : { ...(effect ?? {}) };
        const data = mergeEffectData(base, {
          disabled: false,
          transfer: false,
          origin,
          flags: {
            dnd5e: {
              dependentOn: concentration?.uuid ?? null
            }
          }
        });
        if (effect.constructor?.getInitialDuration) {
          Object.assign(data, effect.constructor.getInitialDuration());
        } else if (globalThis.ActiveEffect?.getInitialDuration) {
          Object.assign(data, globalThis.ActiveEffect.getInitialDuration());
        }
        extendDuration(data, caster);

        if (typeof actor.createEmbeddedDocuments === "function") {
          const made = await createEmbedded(actor, "ActiveEffect", [data]);
          created.push(...(made.uuids ?? []));
        } else if (typeof createEffect === "function") {
          const made = await createEffect(data, { parent: actor });
          if (made?.uuid) created.push(made.uuid);
        }
      } catch (err) {
        console.warn("illusive-dnd-5e | effect apply failed", actor?.uuid, err);
      }
    }
    if (created.length) {
      results.push({
        tokenUuid: uuid,
        actorUuid: actor.uuid,
        effectUuids: created
      });
    }
  }
  return results;
}

function statusesOverlap(a, b) {
  if (!a || !b) return false;
  const left = a instanceof Set ? [...a] : [...(a ?? [])];
  const right = new Set(b instanceof Set ? [...b] : [...(b ?? [])]);
  return left.some((s) => right.has(s));
}

function mergeEffectData(base, patch) {
  const merge = globalThis.foundry?.utils?.mergeObject;
  if (typeof merge === "function") return merge(base, patch);
  return {
    ...base,
    ...patch,
    flags: {
      ...(base.flags ?? {}),
      ...(patch.flags ?? {}),
      dnd5e: {
        ...(base.flags?.dnd5e ?? {}),
        ...(patch.flags?.dnd5e ?? {})
      }
    }
  };
}
