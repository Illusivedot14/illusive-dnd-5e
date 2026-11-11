/**
 * Declaration index — which rules each actor carries, grouped by moment.
 *
 * Sources, per actor:
 *   content  — src/content/declarations.mjs matched by item identifier / name
 *              (optionally limited to item types, or to reaction activations),
 *              or by an active effect's name
 *   item     — flags.illusive-dnd-5e.triggers on an owned item
 *   effect   — flags.illusive-dnd-5e.triggers on an active (applied) effect
 *
 * Built lazily on first read and cached; an item / effect / actor change drops
 * that actor's entry only. A moment asks the index first, so a creature with
 * nothing listening to it costs one map lookup.
 */

import { MODULE_ID } from "../../constants.mjs";
import { CONTENT } from "../../content/declarations.mjs";
import { contentMatchesEffect, contentMatchesItem } from "../../content/match.mjs";
import { normalizeDeclaration, declarationErrors } from "../../domain/triggers/declarations.mjs";
import { resolveRulesContext } from "../../foundry/dnd5e-adapter.mjs";

/** @type {Map<string, { all: object[], byMoment: Map<string, object[]> }>} */
const cache = new Map();
const warned = new Set();

function appliedEffects(actor) {
  const list = actor?.appliedEffects ?? [...(actor?.effects ?? [])];
  return [...list].filter((e) => e && !e.disabled && e.active !== false && !e.isSuppressed);
}

function flagged(doc) {
  const raw = doc?.flags?.[MODULE_ID]?.triggers ?? doc?.getFlag?.(MODULE_ID, "triggers");
  return Array.isArray(raw) ? raw : [];
}

function warnOnce(key, errors) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`${MODULE_ID} | ignored trigger declaration ${key}:`, errors);
}

function editionFor(actor, item) {
  try {
    return resolveRulesContext(actor, item).edition;
  } catch {
    return "2024";
  }
}

function entry(actor, raw, { sourceKind, sourceId, item = null, effect = null, contentId = null }) {
  const key = `${sourceKind}:${sourceId}:${raw?.id ?? "?"}`;
  const errors = declarationErrors(raw);
  if (errors.length) {
    warnOnce(`${actor?.uuid ?? "?"}:${key}`, errors);
    return null;
  }
  const decl = normalizeDeclaration(raw);
  if (decl.edition && String(decl.edition) !== editionFor(actor, item)) return null;
  return { key, decl, sourceKind, sourceId, item, effect, contentId };
}

export function buildActorIndex(actor) {
  const all = [];
  const push = (e) => { if (e) all.push(e); };
  const items = [...(actor?.items ?? [])];
  const effects = appliedEffects(actor);

  for (const content of CONTENT) {
    for (const item of items) {
      if (!contentMatchesItem(content, item)) continue;
      for (const raw of content.declarations) {
        push(entry(actor, raw, { sourceKind: "content", sourceId: item.id, item, contentId: content.id }));
      }
    }
    for (const effect of effects) {
      if (!contentMatchesEffect(content, effect)) continue;
      for (const raw of content.declarations) {
        push(entry(actor, raw, { sourceKind: "content", sourceId: effect.id, effect, contentId: content.id }));
      }
    }
  }
  for (const item of items) {
    for (const raw of flagged(item)) push(entry(actor, raw, { sourceKind: "item", sourceId: item.id, item }));
  }
  for (const effect of effects) {
    for (const raw of flagged(effect)) push(entry(actor, raw, { sourceKind: "effect", sourceId: effect.id, effect }));
  }

  const byMoment = new Map();
  for (const e of all) {
    for (const moment of e.decl.on) {
      if (!byMoment.has(moment)) byMoment.set(moment, []);
      byMoment.get(moment).push(e);
    }
  }
  return { all, byMoment };
}

function indexFor(actor) {
  const uuid = actor?.uuid;
  if (!uuid) return buildActorIndex(actor);
  let idx = cache.get(uuid);
  if (!idx) {
    idx = buildActorIndex(actor);
    cache.set(uuid, idx);
  }
  return idx;
}

/** Declarations on this actor listening to a moment. */
export function declarationsFor(actor, momentId) {
  if (!actor) return [];
  return indexFor(actor).byMoment.get(momentId) ?? [];
}

export function hasDeclarationsFor(actor, momentId) {
  return declarationsFor(actor, momentId).length > 0;
}

export function allDeclarations(actor) {
  return actor ? indexFor(actor).all : [];
}

export function invalidateActor(actorOrUuid) {
  const uuid = typeof actorOrUuid === "string" ? actorOrUuid : actorOrUuid?.uuid;
  if (uuid) cache.delete(uuid);
}

export function invalidateAll() {
  cache.clear();
}

function actorOfEmbedded(doc) {
  const parent = doc?.parent;
  if (parent?.documentName === "Actor") return parent;
  if (parent?.parent?.documentName === "Actor") return parent.parent;
  return doc?.actor ?? null;
}

/** @param {(hook: string, label: string, fn: Function) => void} route */
export function bindTriggerIndex(route) {
  const dropEmbedded = (doc) => invalidateActor(actorOfEmbedded(doc));
  for (const hook of ["createItem", "updateItem", "deleteItem",
    "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
    route(hook, "Refresh trigger declarations", dropEmbedded);
  }
  route("updateActor", "Refresh trigger declarations", (actor) => invalidateActor(actor));
  route("canvasReady", "Refresh trigger declarations", invalidateAll);
}

export function _resetTriggerIndex() {
  cache.clear();
  warned.clear();
}
