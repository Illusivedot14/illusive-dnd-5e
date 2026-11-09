/**
 * Expire ActiveEffects tagged with Illusive special durations.
 * Deletions go through the write gateway and are journaled, so rewinding the
 * turn brings the expired effects back.
 */

import { listEffectsExpiringOn } from "../domain/combat/special-duration.mjs";
import { MODULE_ID } from "../constants.mjs";
import { emitCombatFx } from "./combat-fx.mjs";
import { deleteDocs } from "../foundry/write-gateway.mjs";
import { journalChanges } from "./combat-game-log.mjs";

async function expireEffects(actor, event, { journal = true, sourceUuid = null } = {}) {
  if (!actor) return [];
  const effects = listEffectsExpiringOn(actor, event, MODULE_ID, { sourceUuid });
  if (!effects.length) return [];
  const ids = effects.map((e) => e.id).filter(Boolean);
  const result = await deleteDocs(effects);
  if (journal && result.undo?.length) {
    await journalChanges({
      changes: result.undo,
      label: `${actor.name ?? "Creature"}: effects expired`,
      detail: effects.map((e) => e.name).filter(Boolean).join(", ") || event,
      actorUuid: actor.uuid ?? null
    });
  }
  emitCombatFx({
    kind: "specialDuration",
    subtype: event,
    actorUuid: actor.uuid,
    outcome: { expired: ids }
  });
  return ids;
}

export async function expireOnTurnStart(actor) {
  return expireEffects(actor, "turnStart");
}

export async function expireOnTurnEnd(actor) {
  return expireEffects(actor, "turnEnd");
}

export async function expireOnAttack(attacker) {
  return expireEffects(attacker, "nextAttack");
}

export async function expireOnAttacked(defender) {
  return expireEffects(defender, "isAttacked");
}

export async function expireOnDamaged(actor) {
  return expireEffects(actor, "isDamaged");
}

export async function expireOnRest(actor, { long = false } = {}) {
  const ids = [
    ...(await expireEffects(actor, "shortRest", { journal: false })),
    ...(long ? await expireEffects(actor, "longRest", { journal: false }) : [])
  ];
  return ids;
}

export async function expireOnCombatEnd(combat) {
  const expired = [];
  for (const c of combat?.combatants ?? []) {
    const actor = c.actor;
    if (!actor) continue;
    expired.push(...await expireEffects(actor, "combatEnd", { journal: false }));
  }
  return expired;
}

/**
 * Turn-change helper: expire end on prior, start on current.
 */
export async function onCombatTurnChangeSpecial(combat, prior, current) {
  const priorActor = prior?.actor ?? combat?.combatants?.get?.(prior?.id)?.actor;
  const currentActor = current?.actor ?? combat?.combatants?.get?.(current?.id)?.actor
    ?? combat?.combatant?.actor;
  if (priorActor) await expireOnTurnEnd(priorActor);
  for (const c of combat?.combatants ?? []) {
    if (!c.actor) continue;
    await expireEffects(c.actor, "currentTurnEnd");
    if (priorActor?.uuid) await expireEffects(c.actor, "turnEndSource", { sourceUuid: priorActor.uuid });
    if (currentActor?.uuid) await expireEffects(c.actor, "turnStartSource", { sourceUuid: currentActor.uuid });
  }
  if (currentActor) await expireOnTurnStart(currentActor);
}
