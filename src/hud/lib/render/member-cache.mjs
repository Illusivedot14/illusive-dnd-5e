/**
 * Per-render-pass memo for buildMemberData.
 *
 * The same token is often built by several panels in a single pass (party list +
 * action-bar card + full layout), and the computation reads the same
 * actor data each time. This caches the base result for the duration of one pass
 * (opened/closed by the render queue). Callers still receive their own shallow
 * copy from buildMemberData, so their top-level mutations stay panel-local.
 *
 * Leaf module (no imports) so both the render queue and actor-data can use it
 * without an import cycle.
 */

/** @type {Map<string, object> | null} */
let cache = null;

export function beginMemberCache() {
  cache = new Map();
}

export function endMemberCache() {
  cache = null;
}

export function readMemberCache(id) {
  return cache?.get(id) ?? null;
}

export function writeMemberCache(id, data) {
  cache?.set(id, data);
}
