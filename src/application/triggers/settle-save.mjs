/**
 * One saving throw, then the failure status and the damage that remains.
 * A missing ability skips the roll: the damage and the status both apply.
 */

import { MODULE_ID } from "../../constants.mjs";
import { evaluateSaveVsDc, damageFactorOnSave } from "../../domain/combat/save-outcome.mjs";
import { rollAsOwner } from "../dice.mjs";
import { applyActorDamage, createEmbedded, deleteDocs, toggleActorStatus, setDocFlag, updateDoc } from "../../foundry/write-gateway.mjs";
import { tokenForActor } from "../../foundry/token-lookup.mjs";
import { offerLegendaryResistance } from "./feature-steps.mjs";

export async function settleSave({
  actor,
  ability = null,
  dc = null,
  damage = 0,
  damageType = null,
  onSave = "none",
  onFail = null,
  endOnSuccess = null,
  endStatusOnSuccess = null,
  endStatusesOnFail = null,
  healOnSuccess = null,
  flagOnFail = null,
  banishOnFail = false,
  climbFlag = null,
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
  if (saved && endStatusOnSuccess) {
    push(await toggleActorStatus(actor, endStatusOnSuccess, { active: false }));
  }
  if (!saved && Array.isArray(endStatusesOnFail)) {
    for (const status of endStatusesOnFail) {
      push(await toggleActorStatus(actor, status, { active: false }));
    }
  }
  if (!saved && flagOnFail) {
    push(await setDocFlag(actor, MODULE_ID, String(flagOnFail), true));
  }
  if (!saved && banishOnFail) {
    const token = tokenForActor(actor);
    if (token?.document) push(await updateDoc(token.document, { hidden: true }));
    const combatant = [...(globalThis.game?.combat?.combatants ?? [])].find((entry) =>
      entry?.actor === actor || entry?.actor?.uuid === actor?.uuid);
    if (combatant) push(await updateDoc(combatant, { defeated: true }));
  }
  if (saved && climbFlag) {
    const current = Number(actor?.getFlag?.(MODULE_ID, climbFlag)) || 0;
    push(await setDocFlag(actor, MODULE_ID, climbFlag, current + 1));
  }
  if (saved && Number(healOnSuccess) > 0) {
    push(await applyActorDamage(actor, [{ value: Number(healOnSuccess), type: "healing" }]));
  }
  if (saved && endOnSuccess) {
    const named = [...(actor?.effects ?? [])].filter((effect) =>
      String(effect?.name ?? "").toLowerCase() === String(endOnSuccess).toLowerCase());
    if (named.length) push(await deleteDocs(named));
  }
  if (failEffect && !saved) push(await createEmbedded(actor, "ActiveEffect", [failEffect]));
  const amount = Math.floor((Number(damage) || 0) * (ability ? damageFactorOnSave({ saved, onSave }) : 1));
  if (amount > 0) push(await applyActorDamage(actor, [{ value: amount, type: damageType || undefined }]));
  return changes;
}
