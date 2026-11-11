/**
 * Hit riders come from declarations on the hitDamage moment
 * (content or flags.illusive-dnd-5e.triggers). A new rider is a declaration.
 */

import { declarationsFor } from "../../application/triggers/index.mjs";
import { listActivities } from "./activity-kind.mjs";

function expandFormula(actor, formula) {
  const level = Number(actor?.system?.details?.level) || 1;
  return String(formula ?? "").replaceAll("@halfLevel", String(Math.max(1, Math.floor(level / 2))));
}

function damageActivity(item) {
  const list = listActivities(item);
  return list.find((a) => a?.type === "damage") ?? list[0] ?? null;
}

/**
 * Prompted riders (Smite, Sneak Attack, Hex, Hunter's Mark).
 * @param {object} actor
 * @param {{ includeMarks?: boolean }} [opts]
 */
export function listAvailableHitRiders(actor, { includeMarks = true } = {}) {
  const out = [];
  if (!actor) return out;
  for (const entry of declarationsFor(actor, "hitDamage")) {
    const rider = entry.decl.rider;
    if (!rider || rider.passive) continue;
    if (rider.mark && !includeMarks) continue;
    const item = entry.item;
    const activity = item ? damageActivity(item) : null;
    if (!activity && !rider.formula) continue;
    out.push({
      id: entry.decl.id,
      item,
      activity: activity ?? null,
      auto: Boolean(rider.auto),
      mark: Boolean(rider.mark),
      formula: rider.formula ? expandFormula(actor, rider.formula) : null
    });
  }
  return out;
}

/** Automatic once-a-turn riders (Colossus Slayer, Divine Fury). */
export function listDeclaredPassiveRiders(actor) {
  const out = [];
  if (!actor) return out;
  for (const entry of declarationsFor(actor, "hitDamage")) {
    const rider = entry.decl.rider;
    if (!rider?.passive || !rider.formula) continue;
    out.push({
      id: entry.decl.id,
      item: entry.item ?? null,
      formula: expandFormula(actor, rider.formula),
      type: rider.type ?? null,
      oncePerTurn: rider.oncePerTurn !== false
    });
  }
  return out;
}
