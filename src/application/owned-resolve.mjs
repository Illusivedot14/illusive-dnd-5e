/**
 * Depth counter for Illusive-owned resolution chains.
 * When > 0, hooks must not auto-place templates or auto-apply full damage —
 * the owner path applies scaled damage / cleans up itself.
 */

let depth = 0;

export function beginOwnedResolve() {
  depth += 1;
}

export function endOwnedResolve() {
  depth = Math.max(0, depth - 1);
}

export function isOwnedResolve() {
  return depth > 0;
}
