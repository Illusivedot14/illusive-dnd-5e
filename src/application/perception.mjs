/**
 * Visibility and lighting queries for HUD / automation.
 */

import { evaluateVisibility } from "../domain/vision/evaluate-visibility.mjs";
import { evaluateLightAt } from "../domain/lighting/evaluate-light.mjs";
import {
  collectLightFacts,
  getGridFacts,
  getTokenFacts,
  hasLineOfSight
} from "../foundry/scene-adapter.mjs";
import { featureEnabled } from "./levels.mjs";
import { senseRange } from "../domain/combat/actor-paths.mjs";

function tokenCenter(facts, gridSize) {
  const size = gridSize || 100;
  return {
    cx: facts.x + (facts.width * size) / 2,
    cy: facts.y + (facts.height * size) / 2,
    x: facts.x,
    y: facts.y,
    width: facts.width,
    height: facts.height
  };
}

export function actorVisionFlags(actor) {
  const senses = actor?.system?.attributes?.senses;
  return {
    observerHasDarkvision: senseRange(senses, "darkvision") > 0,
    observerHasBlindSight: senseRange(senses, "blindsight") > 0 || senseRange(senses, "tremorsense") > 0
  };
}

export function evaluateVisibilityBetween({ observerUuid, targetUuid }) {
  if (!featureEnabled("visionEval")) {
    return {
      observerUuid,
      targetUuid,
      result: "indeterminate",
      factors: [],
      reason: "automation-level"
    };
  }

  const observerDoc = fromUuidSync?.(observerUuid) ?? null;
  const targetDoc = fromUuidSync?.(targetUuid) ?? null;
  const observerToken = observerDoc?.object ?? canvas.tokens?.placeables?.find((t) => t.document?.uuid === observerUuid);
  const targetToken = targetDoc?.object ?? canvas.tokens?.placeables?.find((t) => t.document?.uuid === targetUuid);
  const o = getTokenFacts(observerToken ?? observerDoc);
  const t = getTokenFacts(targetToken ?? targetDoc);
  if (!o || !t) {
    return { observerUuid, targetUuid, result: "indeterminate", factors: [], reason: "missing-token" };
  }

  const grid = getGridFacts();
  const oc = tokenCenter(o, grid.size);
  const tc = tokenCenter(t, grid.size);
  const los = hasLineOfSight(oc, tc);
  const light = featureEnabled("lightingEval")
    ? evaluateLightAt({
      point: { x: tc.cx, y: tc.cy },
      lights: collectLightFacts().lights,
      gridSize: grid.size,
      globalDarkness: collectLightFacts().globalDarkness
    })
    : { illuminated: true, darkness: false, level: "bright", sources: 0 };

  const vision = actorVisionFlags(observerToken?.actor ?? observerDoc?.actor);
  const statuses = new Set([...(targetToken?.actor?.statuses ?? [])]);
  const result = evaluateVisibility({
    observer: oc,
    target: tc,
    factors: {
      hasLOS: los,
      illuminated: light.illuminated,
      darkness: light.darkness || light.level === "dark",
      observerHasDarkvision: vision.observerHasDarkvision,
      observerHasBlindSight: vision.observerHasBlindSight,
      targetHidden: Boolean(t.hidden) || statuses.has("hiding"),
      targetInvisible: statuses.has("invisible"),
      obscured: light.level === "dim" && !vision.observerHasDarkvision
    }
  });

  return {
    observerUuid,
    targetUuid,
    ...result,
    light
  };
}

export function performLighting({ operation, point } = {}) {
  if (!featureEnabled("lightingEval")) {
    return { operation, status: "disabled", reason: "automation-level" };
  }
  const facts = collectLightFacts();
  const grid = getGridFacts();
  if (operation === "query" && point) {
    return {
      operation,
      status: "ok",
      ...evaluateLightAt({
        point,
        lights: facts.lights,
        gridSize: grid.size,
        globalDarkness: facts.globalDarkness
      })
    };
  }
  return {
    operation: operation ?? "snapshot",
    status: "ok",
    lightCount: facts.lights.length,
    globalDarkness: facts.globalDarkness
  };
}

/** Alias matching design-doc naming. */
export const evaluate = evaluateVisibilityBetween;
