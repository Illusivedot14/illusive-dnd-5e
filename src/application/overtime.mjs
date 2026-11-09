/**
 * Apply over-time damage / saves at start or end of a combatant's turn.
 */

import { listOverTimeEffects } from "../domain/combat/overtime.mjs";
import { damageFactorOnSave, evaluateSaveVsDc } from "../domain/combat/save-outcome.mjs";
import { MODULE_ID } from "../constants.mjs";
import { emitCombatFx } from "./combat-fx.mjs";
import { applyDamageWithTrail, flatDamageRoll } from "./damage-apply.mjs";
import { journalChanges, entriesForEffects } from "./combat-game-log.mjs";

async function rollFormula(formula, actor) {
  if (!formula) return null;
  try {
    const RollCls = globalThis.Roll;
    if (!RollCls) return null;
    const data = typeof actor?.getRollData === "function" ? actor.getRollData() : {};
    const roll = await new RollCls(String(formula), data).evaluate();
    return roll;
  } catch {
    return null;
  }
}

async function rollSave(actor, ability, dc) {
  if (!actor || typeof actor.rollSavingThrow !== "function") {
    return { total: null, success: false };
  }
  const rolls = await actor.rollSavingThrow(
    { ability, target: dc },
    { configure: false },
    {}
  );
  const roll = Array.isArray(rolls) ? rolls[0] : rolls;
  const total = Number(roll?.total);
  return {
    total: Number.isFinite(total) ? total : null,
    success: evaluateSaveVsDc({ total, dc }).success
  };
}

/**
 * Run over-time effects for one actor at turn start or end.
 * @param {object} actor
 * @param {"start"|"end"} turn
 */
export async function processOverTimeForActor(actor, turn) {
  if (!actor) return [];
  const entries = listOverTimeEffects(actor, turn, MODULE_ID);
  const applied = [];

  for (const { effect, spec } of entries) {
    let factor = 1;
    let save = null;
    if (spec.saveAbility) {
      const dc = Number(spec.saveDc);
      save = await rollSave(actor, spec.saveAbility, Number.isFinite(dc) ? dc : 10);
      factor = damageFactorOnSave({
        saved: save.success,
        onSave: spec.onSave ?? "half"
      });
    }

    let damageTotal = 0;
    let changes = [];
    if (spec.damageFormula && factor > 0) {
      const roll = await rollFormula(spec.damageFormula, actor);
      damageTotal = Math.floor((Number(roll?.total) || 0) * factor);
      if (damageTotal > 0) {
        const trail = await applyDamageWithTrail({
          rolls: [flatDamageRoll(damageTotal, spec.damageType || null, spec.damageFormula)],
          targets: [{ actor }],
          tag: { source: "overTime", effectId: effect.id }
        });
        changes = trail.changes;
      }
    }

    const row = {
      effectId: effect.id,
      label: spec.label,
      turn,
      damageTotal,
      save,
      changes
    };
    applied.push(row);
    if (changes.length) {
      await journalChanges({
        changes,
        label: `${spec.label ?? effect.name ?? "Over time"}: ${actor.name ?? "creature"}`,
        detail: `${damageTotal} ${spec.damageType ?? ""} (turn ${turn})`.trim(),
        actorUuid: actor.uuid ?? null,
        dependsOn: entriesForEffects([effect.uuid].filter(Boolean))
      });
    }
    emitCombatFx({
      kind: "overTime",
      subtype: turn,
      actorUuid: actor.uuid,
      outcome: row
    });
  }
  return applied;
}

/**
 * Hook helper: combat turn changed — end ticks for prior combatant, start for current.
 */
export async function onCombatTurnChange(combat, prior, current) {
  const results = { ended: [], started: [] };
  const priorActor = prior?.actor ?? combat?.combatants?.get?.(prior?.id)?.actor;
  const currentActor = current?.actor ?? combat?.combatants?.get?.(current?.id)?.actor
    ?? combat?.combatant?.actor;

  if (priorActor) {
    results.ended = await processOverTimeForActor(priorActor, "end");
  }
  if (currentActor) {
    results.started = await processOverTimeForActor(currentActor, "start");
  }
  return results;
}
