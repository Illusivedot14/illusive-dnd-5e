/**
 * Post-hit riders — offer bonus damage (Smite / Sneak / Hex / Hunter's Mark).
 * Riders return rolls; resolve-activity folds them into the attack's single
 * damage step so reaction windows and the undo trail see the whole hit.
 */

import { listAvailableHitRiders } from "../domain/combat/hit-riders.mjs";
import { emitCombatFx } from "./combat-fx.mjs";
import { flatDamageRoll } from "./damage-apply.mjs";
import { rollVisible } from "./dice.mjs";
import { targetHasCastersMark } from "./roll-modifiers.mjs";
import { actorFromUuid } from "../foundry/token-lookup.mjs";

async function confirmRider(rider) {
  if (rider.auto) return true;
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  const title = rider.item?.name ?? rider.id;
  if (!DialogV2?.confirm) {
    return true;
  }
  try {
    return Boolean(await DialogV2.confirm({
      window: { title },
      content: `<p>Apply <strong>${title}</strong> to this hit?</p>`,
      modal: true,
      rejectClose: false
    }));
  } catch {
    return false;
  }
}

/**
 * After a hit, offer rider damage. Mark riders only apply to marked targets.
 * @returns {Promise<Array<{ rider: string, itemUuid: string|null, targetUuids: string[], rolls: object[], skipped?: string }>>}
 */
export async function offerHitRiders({
  actor,
  hitUuids = [],
  critical = false,
  event = null,
  resolutionId = null,
  token = null
} = {}) {
  if (!actor || !hitUuids.length) return [];

  const riders = listAvailableHitRiders(actor);
  if (!riders.length) return [];

  const out = [];
  for (const rider of riders) {
    const targetUuids = rider.mark
      ? hitUuids.filter((uuid) => targetHasCastersMark(actor, actorFromUuid(uuid)))
      : hitUuids;
    if (!targetUuids.length) continue;
    const ok = await confirmRider(rider);
    if (!ok) continue;

    emitCombatFx({
      kind: "hitRider",
      subtype: rider.id,
      resolutionId,
      actorUuid: actor.uuid,
      tokenUuid: token?.document?.uuid ?? token?.uuid ?? null,
      targetUuids,
      outcome: { critical },
      origin: { itemUuid: rider.item?.uuid ?? null, activityId: rider.activity?.id ?? null }
    });

    const activity = rider.activity;
    let rolls = [];
    if (activity && typeof activity.rollDamage === "function") {
      rolls = (await activity.rollDamage(
        { event, isCritical: critical },
        { configure: false }
      )) ?? [];
    } else if (typeof rider.item?.rollDamage === "function") {
      rolls = (await rider.item.rollDamage({ event, isCritical: critical })) ?? [];
    }
    rolls = Array.isArray(rolls) ? rolls : [];
    if (!rolls.length && rider.formula) {
      const roll = await rollVisible(rider.formula, { actor, flavor: rider.item?.name ?? rider.id });
      const value = Number(roll?.total) || 0;
      if (value > 0) rolls = [flatDamageRoll(value, null, rider.formula)];
    }
    out.push({
      rider: rider.id,
      itemUuid: rider.item?.uuid ?? null,
      targetUuids,
      rolls,
      ...(rolls.length ? {} : { skipped: "no-roll" })
    });
  }
  return out;
}
