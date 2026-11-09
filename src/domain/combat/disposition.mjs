/**
 * Token disposition comparisons (pure; accepts placeables, documents, or facts).
 */

export function readDisposition(token) {
  const d = token?.document?.disposition ?? token?.disposition;
  return d == null ? null : d;
}

/** @param {{ unknown?: boolean }} [opts] result when either side has no disposition */
export function isHostile(a, b, { unknown = true } = {}) {
  const da = readDisposition(a);
  const db = readDisposition(b);
  if (da == null || db == null) return unknown;
  return da !== db;
}

/** @param {{ unknown?: boolean }} [opts] result when either side has no disposition */
export function isFriendly(a, b, { unknown = false } = {}) {
  const da = readDisposition(a);
  const db = readDisposition(b);
  if (da == null || db == null) return unknown;
  return da === db;
}
