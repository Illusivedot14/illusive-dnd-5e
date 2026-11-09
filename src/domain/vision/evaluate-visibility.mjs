/**
 * Visibility result and reason codes. Pure.
 */

/**
 * @param {object} input
 * @param {{ x: number, y: number, elevation?: number }} input.observer
 * @param {{ x: number, y: number, elevation?: number }} input.target
 * @param {{
 *   hasLOS?: boolean,
 *   illuminated?: boolean,
 *   darkness?: boolean,
 *   observerHasDarkvision?: boolean,
 *   observerHasBlindSight?: boolean,
 *   targetHidden?: boolean,
 *   targetInvisible?: boolean,
 *   obscured?: boolean
 * }} input.factors
 * @returns {{ result: "visible"|"not-visible"|"indeterminate", factors: object[], reason: string }}
 */
export function evaluateVisibility(input) {
  const f = input.factors ?? {};
  const factors = [];

  if (f.hasLOS === false) {
    factors.push({ code: "blocked-los", detail: "No line of sight" });
    return { result: "not-visible", factors, reason: "no-los" };
  }
  if (f.targetHidden && !f.observerHasBlindSight) {
    factors.push({ code: "hidden", detail: "Target is hidden" });
    return { result: "not-visible", factors, reason: "hidden" };
  }
  if (f.targetInvisible && !f.observerHasBlindSight) {
    factors.push({ code: "invisible", detail: "Target is invisible" });
    return { result: "not-visible", factors, reason: "invisible" };
  }
  if (f.darkness && !f.observerHasDarkvision && !f.observerHasBlindSight && !f.illuminated) {
    factors.push({ code: "darkness", detail: "In darkness without suitable vision" });
    return { result: "not-visible", factors, reason: "darkness" };
  }
  if (f.obscured && f.hasLOS == null) {
    factors.push({ code: "obscured", detail: "Heavily obscured; indeterminate without LOS probe" });
    return { result: "indeterminate", factors, reason: "obscured" };
  }
  if (f.hasLOS == null && f.illuminated == null) {
    return {
      result: "indeterminate",
      factors: [{ code: "insufficient-facts", detail: "Missing LOS/light facts" }],
      reason: "unknown"
    };
  }

  factors.push({ code: "los", detail: "Line of sight clear" });
  if (f.illuminated) factors.push({ code: "light", detail: "Illuminated" });
  if (f.observerHasDarkvision && f.darkness) {
    factors.push({ code: "darkvision", detail: "Seen with darkvision" });
  }
  return { result: "visible", factors, reason: "visible" };
}
