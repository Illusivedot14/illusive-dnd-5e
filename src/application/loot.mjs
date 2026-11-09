/**
 * Loot / inventory use cases.
 */

import { evaluateLootOperation } from "../domain/loot/evaluate-operation.mjs";
import { getItemQuantity, transferItem, dropItemToGround } from "../foundry/inventory-adapter.mjs";
import { featureEnabled } from "./levels.mjs";

export async function perform({ operation }) {
  if (!featureEnabled("lootTransfer")) {
    return { operation, status: "disabled", reason: "automation-level" };
  }
  if (!operation?.type) return { ok: false, reason: "missing-operation" };

  const source = operation.sourceActorUuid ? await fromUuid(operation.sourceActorUuid) : null;
  const target = operation.targetActorUuid ? await fromUuid(operation.targetActorUuid) : null;
  const item = source?.items?.get?.(operation.itemId);

  const validation = evaluateLootOperation(operation, {
    sourceOwnsItem: Boolean(item),
    quantityAvailable: item ? getItemQuantity(item) : 0,
    targetCanReceive: Boolean(target) || operation.type === "drop",
    sameActor: source && target && source.uuid === target.uuid
  });
  if (!validation.ok) {
    return { ok: false, status: "rejected", ...validation, operation };
  }

  if (operation.type === "transfer") {
    const result = await transferItem({
      sourceActor: source,
      targetActor: target,
      itemId: operation.itemId,
      quantity: validation.quantity
    });
    return { status: result.ok ? "ok" : "error", ...result, operation };
  }

  if (operation.type === "drop") {
    const result = await dropItemToGround({
      actor: source,
      itemId: operation.itemId,
      quantity: validation.quantity,
      x: operation.x,
      y: operation.y
    });
    return { status: result.ok ? "ok" : "error", ...result, operation };
  }

  if (operation.type === "pickup") {
    // Pickup from world piles needs a pile document; validate-only until pile adapter exists.
    return {
      ok: false,
      status: "unimplemented",
      reason: "pickup-requires-pile-document",
      operation
    };
  }

  return { ok: false, status: "error", reason: "unknown-type", operation };
}
