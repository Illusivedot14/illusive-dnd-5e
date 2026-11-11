/**
 * One saving throw, then the failure status and the damage that remains.
 * A missing ability skips the roll: the damage and the status both apply.
 */

import { evaluateSaveVsDc, damageFactorOnSave } from "../../domain/combat/save-outcome.mjs";
import { rollAsOwner } from "../dice.mjs";
import { applyActorDamage, createEmbedded, toggleActorStatus } from "../../foundry/write-gateway.mjs";
import { offerLegendaryResistance } from "./feature-steps.mjs";

export async function settleSave({
  actor,
  ability = null,
  dc = null,
  damage = 0,
  damageType = null,
  onSave = "none",
  onFail = null,
  failEffect = null,
  disadvantage = false,
  autoSuccess = false
} = {}) {
  const changes = [];
  const push = (result) => { if (result?.undo?.length) changes.push(...result.undo); };
  let saved = Boolean(autoSuccess);
  if (ability && !saved) {
    let total = null;
    try {
      total = Number((await rollAsOwner(actor, "save", {
        ability,
        target: dc,
        ...(disadvantage ? { disadvantage: true, advantage: false } : {})
      }))?.total);
    } catch {
      total = null;
    }
    saved = evaluateSaveVsDc({ total, dc }).success;
  }
  if (!saved && await offerLegendaryResistance(actor)) saved = true;
  if (onFail && !saved) push(await toggleActorStatus(actor, onFail, { active: true }));
  if (failEffect && !saved) push(await createEmbedded(actor, "ActiveEffect", [failEffect]));
  const amount = Math.floor((Number(damage) || 0) * (ability ? damageFactorOnSave({ saved, onSave }) : 1));
  if (amount > 0) push(await applyActorDamage(actor, [{ value: amount, type: damageType || undefined }]));
  return changes;
}
