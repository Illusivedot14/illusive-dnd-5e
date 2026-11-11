/**
 * Activity range specs + token distance (application layer).
 * Mirrors DAS: distinguish melee reach / ranged normal+long / thrown modes;
 * measure closest-square footprint (+ elevation), adjudicate bands.
 */

import { spaceFeetBetween } from "../domain/spatial/geometry.mjs";
import { rangeIssue, tooClose } from "../domain/spatial/range.mjs";
import { isMeleeAttack, isRangedAttack } from "../domain/combat/activity-kind.mjs";

function finiteOrNull(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function hasThrownProperty(item) {
  const props = item?.system?.properties;
  if (!props) return false;
  if (typeof props.has === "function") return props.has("thr") === true;
  if (Array.isArray(props)) return props.includes("thr") || props.some((p) => p === "thr" || p?.value === "thr");
  if (props instanceof Set) return props.has("thr");
  return Boolean(props.thr);
}


/**
 * Resolve what "in range" means for this activity.
 * @returns {{
 *   kind: "self"|"touch"|"melee"|"ranged"|"unknown",
 *   value: number|null,
 *   long: number|null,
 *   min: number|null,
 *   units: string
 * }}
 */
export function resolveRangeSpec(activity, item = null, { attackMode = null } = {}) {
  const actRange = activity?.range ?? {};
  const itemRange = item?.system?.range ?? {};
  const units = String(actRange.units ?? itemRange.units ?? "ft").toLowerCase() || "ft";

  if (units === "self") {
    return { kind: "self", value: 0, long: null, min: null, units };
  }
  if (units === "touch") {
    const reach = finiteOrNull(itemRange.reach) ?? finiteOrNull(actRange.reach) ?? 5;
    return { kind: "touch", value: reach, long: null, min: null, units: "ft" };
  }

  if (actRange.override && finiteOrNull(actRange.value) != null) {
    return {
      kind: isRangedAttack(activity, item) ? "ranged" : "melee",
      value: finiteOrNull(actRange.value),
      long: finiteOrNull(actRange.long),
      min: finiteOrNull(actRange.min ?? itemRange.min),
      units
    };
  }

  const weapon = item?.type === "weapon" ? itemRange : null;
  // Prefer activity fields, then weapon, then any item.system.range (spells/features).
  const reach = finiteOrNull(actRange.reach ?? weapon?.reach ?? itemRange.reach);
  const normal = finiteOrNull(actRange.value ?? weapon?.value ?? itemRange.value);
  const long = finiteOrNull(actRange.long ?? weapon?.long ?? itemRange.long);
  const min = finiteOrNull(actRange.min ?? itemRange.min);
  const thrown = hasThrownProperty(item);

  // Ranged attack activities / ranged weapons.
  if (isRangedAttack(activity, item)) {
    return {
      kind: "ranged",
      value: normal ?? reach ?? null,
      long,
      min,
      units
    };
  }

  // Melee weapon that can be thrown — mode decides.
  if (thrown && (weapon || isMeleeAttack(activity, item))) {
    const mode = String(attackMode ?? "");
    if (mode.startsWith("thrown")) {
      return { kind: "ranged", value: normal, long, min, units };
    }
    if (mode) {
      return { kind: "melee", value: reach ?? 5, long: null, min: null, units };
    }
    // Unknown mode: allow either reach or thrown short range (gate uses the farther).
    return {
      kind: "melee",
      value: Math.max(reach ?? 0, normal ?? 0) || 5,
      long,
      min,
      units
    };
  }

  // Pure melee.
  if (isMeleeAttack(activity, item) || reach != null) {
    return { kind: "melee", value: reach ?? 5, long: null, min: null, units };
  }

  // Spell / feature numeric range on the activity.
  if (normal != null || long != null) {
    return { kind: "ranged", value: normal, long, min, units };
  }

  return { kind: "unknown", value: null, long: null, min: null, units };
}

/** Normal (short) range in feet for gates that only need one number. null = unlimited. */
export function activityRangeFeet(activity, item, options = {}) {
  const spec = resolveRangeSpec(activity, item, options);
  if (spec.kind === "self") return 0;
  if (spec.kind === "unknown") return null;
  // For listing / simple gates, allow up to long range when present.
  return spec.long ?? spec.value;
}

/** Strict normal-band feet (melee reach / short range). */
export function activityNormalRangeFeet(activity, item, options = {}) {
  const spec = resolveRangeSpec(activity, item, options);
  if (spec.kind === "self") return 0;
  if (spec.kind === "unknown") return null;
  return spec.value;
}

/**
 * Token document facts for distance — prefer committed `_source` (DAS pitfall).
 */
export function tokenSpaceFacts(doc) {
  const src = doc?._source ?? doc;
  return {
    x: Number(src?.x ?? doc?.x) || 0,
    y: Number(src?.y ?? doc?.y) || 0,
    width: Number(doc?.width ?? src?.width) || 1,
    height: Number(doc?.height ?? src?.height) || 1,
    depth: Number.isFinite(Number(doc?.depth ?? src?.depth))
      ? Number(doc?.depth ?? src?.depth)
      : undefined,
    elevation: Number(doc?.elevation ?? src?.elevation) || 0
  };
}

function sceneGrid(scene) {
  const grid = scene?.grid ?? {};
  return {
    size: Number(grid.sizeX ?? grid.size) || 100,
    distance: Number(grid.distance) || 5,
    units: grid.units ?? "ft"
  };
}

/**
 * Closest-square footprint distance (+ elevation) in scene grid units.
 * @returns {{ value: number, units: string }}
 */
export function measureTokenDistance(fromDoc, toDoc, scene = canvas?.scene) {
  if (!fromDoc || !toDoc || !scene) return { value: Infinity, units: "ft" };
  const grid = sceneGrid(scene);
  const value = spaceFeetBetween(tokenSpaceFacts(fromDoc), tokenSpaceFacts(toDoc), {
    gridSize: grid.size,
    gridDistance: grid.distance,
    includeElevation: true
  });
  return { value, units: grid.units || "ft" };
}

/**
 * Adjudicate one origin → target against an activity range spec.
 * @returns {{
 *   inRange: boolean,
 *   band: "normal"|"longRange"|"outOfRange"|"tooClose"|"unlimited"|"self",
 *   reason: string,
 *   result: "normal"|"long"|"fail",
 *   feet: number,
 *   spec: object
 * }}
 */
export function evaluateTargetRange(originDoc, targetDoc, activity, item, {
  scene = canvas?.scene,
  attackMode = null
} = {}) {
  const spec = resolveRangeSpec(activity, item, { attackMode });
  const measured = measureTokenDistance(originDoc, targetDoc, scene);
  const feet = measured.value;

  if (spec.kind === "self") {
    return { inRange: true, band: "self", reason: "self", result: "normal", feet: 0, spec };
  }
  if (spec.kind === "unknown" || spec.value == null) {
    return { inRange: true, band: "unlimited", reason: "noRange", result: "normal", feet, spec };
  }

  if (tooClose(measured, spec.min != null ? { value: spec.min } : null)) {
    return { inRange: false, band: "tooClose", reason: "tooClose", result: "fail", feet, spec };
  }

  const issue = rangeIssue(measured, { value: spec.value, long: spec.long, units: spec.units });
  if (issue === "outOfRange") {
    return { inRange: false, band: "outOfRange", reason: "outOfRange", result: "fail", feet, spec };
  }
  if (issue === "longRange") {
    // Still reachable; caller may apply long-range disadvantage later.
    return { inRange: true, band: "longRange", reason: "longRange", result: "long", feet, spec };
  }
  return { inRange: true, band: "normal", reason: "normal", result: "normal", feet, spec };
}

/**
 * Gate all current user targets. Fails only on outOfRange / tooClose.
 * Long range is allowed (result "long" if any target is in the long band).
 */
export function checkAbilityRange(token, item, activity, { attackMode = null } = {}) {
  const targets = game.user?.targets;
  if (!token || !targets?.size) return { inRange: true, reason: "noTargets", result: "normal" };

  const originDoc = token?.document ?? token;
  const scene = canvas?.scene;
  let worst = "normal";

  for (const target of targets) {
    const evaled = evaluateTargetRange(originDoc, target?.document ?? target, activity, item, {
      scene,
      attackMode
    });
    if (!evaled.inRange) {
      return {
        inRange: false,
        reason: evaled.reason,
        result: "fail",
        band: evaled.band,
        feet: evaled.feet,
        spec: evaled.spec
      };
    }
    if (evaled.result === "long") worst = "long";
  }
  return { inRange: true, reason: worst === "long" ? "longRange" : "normal", result: worst };
}

function doubled(range) {
  if (!range || typeof range !== "object") return range;
  const next = { ...range };
  for (const key of ["value", "long", "reach"]) {
    if (Number(next[key]) > 0) next[key] = Number(next[key]) * 2;
  }
  return next;
}

/** Distant Spell: a copy of the activity and item whose range is doubled. */
export function doubleRange(activity, item) {
  const nextActivity = activity?.range
    ? { ...activity, range: doubled(activity.range) }
    : activity;
  const nextItem = item?.system?.range
    ? { ...item, system: { ...item.system, range: doubled(item.system.range) } }
    : item;
  return { activity: nextActivity, item: nextItem };
}
