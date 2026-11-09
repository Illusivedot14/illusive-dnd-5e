/**
 * Derives presentation-ready HUD view models from domain state.
 */

import { getRule } from "../rules/catalog.mjs";

function explainEntry(entry, rulesContext) {
  const rule = entry.rule ? getRule(entry.rule) : null;
  const legacy = Boolean(rulesContext?.legacy) || rule?.edition === "2014";
  return {
    type: entry.type,
    phase: entry.phase ?? null,
    kind: entry.kind ?? null,
    rule: entry.rule ?? null,
    ruleName: rule?.name ?? null,
    detail: entry.detail ?? entry.reason ?? null,
    legacy,
    legacyLabel: legacy ? "2014 / Legacy" : null,
    source: rule?.source ?? null
  };
}

export function buildHudView(resolution) {
  if (!resolution) return null;

  const explanation = (resolution.trace ?? []).map((entry) =>
    explainEntry(entry, resolution.rulesContext)
  );

  const headline = explanation
    .filter((e) => e.detail)
    .map((e) => e.detail)
    .slice(-3)
    .join(" · ");

  return {
    id: resolution.id,
    phase: resolution.phase,
    actorUuid: resolution.actorUuid,
    itemUuid: resolution.itemUuid,
    activityId: resolution.activityId,
    targets: resolution.targets ?? [],
    rolls: resolution.rolls ?? [],
    pendingDecision: resolution.pendingDecision,
    appliedChanges: resolution.appliedChanges ?? [],
    headline: headline || `Phase: ${resolution.phase}`,
    explanation,
    rulesContext: resolution.rulesContext,
    corrections: resolution.phase === "completed"
      ? [{ id: "undo", label: "Undo" }]
      : []
  };
}
