/**
 * Animation / VFX seam. Rules never depend on listeners.
 * Subscribe with: Hooks.on("illusive-dnd-5e.combatFx", (evt) => { ... })
 */

import { MODULE_ID } from "../constants.mjs";

/**
 * @param {{
 *   kind: string,
 *   subtype?: string|null,
 *   resolutionId?: string|null,
 *   actorUuid?: string|null,
 *   tokenUuid?: string|null,
 *   targetUuids?: string[],
 *   outcome?: object,
 *   origin?: object
 * }} evt
 */
export function emitCombatFx(evt = {}) {
  const payload = {
    kind: evt.kind ?? "unknown",
    subtype: evt.subtype ?? null,
    resolutionId: evt.resolutionId ?? null,
    actorUuid: evt.actorUuid ?? null,
    tokenUuid: evt.tokenUuid ?? null,
    targetUuids: Array.isArray(evt.targetUuids) ? [...evt.targetUuids] : [],
    outcome: evt.outcome ?? null,
    origin: evt.origin ?? null
  };
  try {
    Hooks.callAll(`${MODULE_ID}.combatFx`, payload);
  } catch (err) {
    console.warn("illusive-dnd-5e | combatFx listener failed", err);
  }
  return payload;
}
