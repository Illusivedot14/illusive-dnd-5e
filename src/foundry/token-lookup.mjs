/**
 * Token / actor lookup on the active canvas.
 * Unlinked tokens share an actor id with their base actor, so lookups by actor
 * compare uuids (synthetic token actors have distinct uuids) before ids.
 */

function placeables() {
  try {
    return globalThis.canvas?.tokens?.placeables ?? [];
  } catch {
    return [];
  }
}

function syncDoc(uuid) {
  try {
    return typeof fromUuidSync === "function" ? fromUuidSync(uuid) : null;
  } catch {
    return null;
  }
}

/** Token placeable for a Token / TokenDocument uuid. */
export function tokenFromUuid(uuid) {
  if (!uuid) return null;
  const doc = syncDoc(uuid);
  if (doc?.object) return doc.object;
  if (doc?.actor && (doc.center != null || typeof doc.setTarget === "function")) return doc;
  return placeables().find((t) => t.document?.uuid === uuid || t.uuid === uuid) ?? null;
}

/** Actor for an Actor uuid or a Token uuid (synthetic actor for unlinked tokens). */
export function actorFromUuid(uuid) {
  if (!uuid) return null;
  const doc = syncDoc(uuid);
  if (doc) {
    if (doc.documentName === "Actor" || (doc.items && doc.system && !doc.actor)) return doc;
    if (doc.actor) return doc.actor;
    if (doc.object?.actor) return doc.object.actor;
  }
  const token = placeables().find(
    (t) => t.actor?.uuid === uuid || t.document?.uuid === uuid || t.uuid === uuid
  );
  return token?.actor ?? null;
}

/** Placeable for an actor; uuid match first so unlinked copies resolve to the right token. */
export function tokenForActor(actor) {
  if (!actor) return null;
  const list = placeables();
  return list.find((t) => t.actor === actor)
    ?? (actor.uuid ? list.find((t) => t.actor?.uuid === actor.uuid) : null)
    ?? (actor.id ? list.find((t) => t.actor?.id === actor.id && t.document?.actorLink !== false) : null)
    ?? null;
}

export function tokenUuidOf(token) {
  return token?.document?.uuid ?? token?.uuid ?? null;
}
