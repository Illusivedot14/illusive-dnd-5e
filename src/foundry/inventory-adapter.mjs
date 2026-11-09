/**
 * Inventory / loot reads and transfers (Foundry document side).
 */

export function getItemQuantity(item) {
  return Number(item?.system?.quantity ?? 1) || 1;
}

export async function transferItem({ sourceActor, targetActor, itemId, quantity = 1 }) {
  if (!sourceActor || !targetActor || !itemId) {
    return { ok: false, reason: "missing-args" };
  }
  const item = sourceActor.items?.get?.(itemId) ?? sourceActor.items?.find?.((i) => i.id === itemId);
  if (!item) return { ok: false, reason: "not-owned" };

  const available = getItemQuantity(item);
  const qty = Math.min(available, Math.max(1, Number(quantity) || 1));
  const data = item.toObject();
  data.system = data.system ?? {};
  data.system.quantity = qty;
  delete data._id;

  if (available > qty) {
    await item.update({ "system.quantity": available - qty });
  } else {
    await item.delete();
  }
  const created = await targetActor.createEmbeddedDocuments("Item", [data]);
  return {
    ok: true,
    reason: null,
    sourceActorUuid: sourceActor.uuid,
    targetActorUuid: targetActor.uuid,
    itemId,
    quantity: qty,
    createdId: created?.[0]?.id ?? null
  };
}

export async function dropItemToGround({ actor, itemId, quantity = 1, x, y, scene = canvas?.scene }) {
  if (!actor || !itemId || !scene) return { ok: false, reason: "missing-args" };
  const item = actor.items?.get?.(itemId);
  if (!item) return { ok: false, reason: "not-owned" };
  const available = getItemQuantity(item);
  const qty = Math.min(available, Math.max(1, Number(quantity) || 1));

  // Prefer system item pile APIs when present; else create a loot actor stub is out of scope —
  // record a chat notification and reduce quantity / delete.
  if (available > qty) await item.update({ "system.quantity": available - qty });
  else await item.delete();

  return {
    ok: true,
    reason: null,
    operation: "drop",
    actorUuid: actor.uuid,
    itemName: item.name,
    quantity: qty,
    x,
    y,
    sceneId: scene.id
  };
}

export async function reverseTransfer(change) {
  if (!change?.ok || change.operation === "drop") return { ok: false, reason: "cannot-reverse" };
  const source = await fromUuid(change.targetActorUuid);
  const target = await fromUuid(change.sourceActorUuid);
  if (!source || !target || !change.createdId) return { ok: false, reason: "missing-docs" };
  return transferItem({
    sourceActor: source,
    targetActor: target,
    itemId: change.createdId,
    quantity: change.quantity
  });
}
