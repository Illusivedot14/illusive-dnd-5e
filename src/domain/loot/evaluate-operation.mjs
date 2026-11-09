/**
 * Validate a loot / inventory operation. Pure.
 */

/**
 * @param {object} op
 * @param {"transfer"|"drop"|"pickup"} op.type
 * @param {string} op.sourceActorUuid
 * @param {string} [op.targetActorUuid]
 * @param {string} op.itemId
 * @param {number} [op.quantity]
 * @param {{
 *   sourceOwnsItem?: boolean,
 *   quantityAvailable?: number,
 *   targetCanReceive?: boolean,
 *   sameActor?: boolean
 * }} facts
 */
export function evaluateLootOperation(op, facts = {}) {
  const quantity = Math.max(1, Number(op.quantity) || 1);
  if (!op.sourceActorUuid || !op.itemId) {
    return { ok: false, reason: "missing-args", quantity };
  }
  if (op.type === "transfer") {
    if (!op.targetActorUuid) return { ok: false, reason: "missing-target", quantity };
    if (facts.sameActor) return { ok: false, reason: "same-actor", quantity };
    if (facts.targetCanReceive === false) return { ok: false, reason: "target-cannot-receive", quantity };
  }
  if (facts.sourceOwnsItem === false) return { ok: false, reason: "not-owned", quantity };
  const available = facts.quantityAvailable;
  if (Number.isFinite(available) && quantity > available) {
    return { ok: false, reason: "insufficient-quantity", quantity, available };
  }
  return { ok: true, reason: null, quantity };
}
