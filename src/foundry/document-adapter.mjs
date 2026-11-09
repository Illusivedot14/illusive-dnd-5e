/**
 * Actor / item / token document updates and scoped undo.
 * Every undo write goes through the write gateway (GM runs it when needed).
 */

import { debugLog, DEBUG_CHANNELS } from "./debug.mjs";
import {
  write,
  updateDoc,
  setDocFlag,
  unsetDocFlag,
  deleteDocs,
  restorePayload
} from "./write-gateway.mjs";

export async function applyActorUpdate(actor, data) {
  if (!actor?.update) throw new Error("document-adapter: missing actor");
  return actor.update(data);
}

export async function applyTokenUpdate(tokenDoc, data) {
  if (!tokenDoc?.update) throw new Error("document-adapter: missing token");
  return tokenDoc.update(data);
}

async function docFor(uuid) {
  if (!uuid || typeof fromUuid !== "function") return null;
  try {
    return await fromUuid(uuid);
  } catch {
    return null;
  }
}

function priorHp(prior) {
  if (typeof prior === "object" && prior != null) return prior;
  return { value: prior };
}

/**
 * HP to restore. Exact prior when nothing touched HP since (strict LIFO); otherwise
 * reverse only this change's delta so later damage/healing survives an out-of-order undo.
 */
export function hpRestoreUpdate(actor, change) {
  const prior = priorHp(change.prior);
  const hp = actor?.system?.attributes?.hp ?? {};
  const update = {};
  const next = change.next && typeof change.next === "object" ? change.next : null;
  const fields = [["value", "value"], ["temp", "temp"], ["tempmax", "tempmax"]];
  for (const [field, key] of fields) {
    const before = prior[field] ?? (field === "tempmax" ? prior.tempMax : undefined);
    if (before == null) continue;
    const current = Number(hp[key]) || 0;
    const after = next ? Number(next[field]) : NaN;
    let value = Number(before);
    if (next && Number.isFinite(after) && current !== after) {
      value = current + (Number(before) - after);
      if (field === "value") {
        const max = Number(hp.max) || Number(next.max) || Number.POSITIVE_INFINITY;
        value = Math.min(Math.max(0, value), max);
      } else {
        value = Math.max(0, value);
      }
    }
    update[`system.attributes.hp.${key}`] = value;
  }
  return update;
}

async function deleteEffects(effectUuids = []) {
  const live = [];
  for (const uuid of effectUuids) {
    const doc = await docFor(uuid);
    if (doc) live.push(doc);
  }
  if (!live.length) return 0;
  const result = await deleteDocs(live);
  return result.ok ? live.length : 0;
}

async function undoOne(change) {
  switch (change.type) {
    case "token-position": {
      if (!change.tokenUuid || !change.prior) return { ok: false, reason: "bad-change" };
      const doc = await docFor(change.tokenUuid);
      if (!doc) return { ok: false, reason: "missing-token" };
      const r = await updateDoc(doc, { x: change.prior.x, y: change.prior.y }, { isUndo: true });
      return { ok: r.ok, reason: r.reason };
    }
    case "actor-hp":
    case "hp": {
      if (!change.actorUuid || change.prior == null) return { ok: false, reason: "bad-change" };
      const actor = await docFor(change.actorUuid);
      if (!actor) return { ok: false, reason: "missing-actor" };
      const r = await updateDoc(actor, hpRestoreUpdate(actor, change), { isUndo: true });
      return { ok: r.ok, reason: r.reason };
    }
    case "flag": {
      if (!change.uuid || !change.scope || !change.key) return { ok: false, reason: "bad-change" };
      const doc = await docFor(change.uuid);
      if (!doc) return { ok: false, reason: "missing-doc" };
      const r = change.prior === undefined
        ? await unsetDocFlag(doc, change.scope, change.key)
        : await setDocFlag(doc, change.scope, change.key, change.prior);
      return { ok: r.ok, reason: r.reason };
    }
    case "effect": {
      if (!Array.isArray(change.effectUuids) || !change.effectUuids.length) return { ok: false, reason: "no-effects" };
      const removed = await deleteEffects(change.effectUuids);
      return { ok: removed > 0, reason: removed > 0 ? undefined : "missing-effect" };
    }
    case "doc-create": {
      const removed = await deleteEffects(change.uuids ?? []);
      return { ok: removed > 0, reason: removed > 0 ? undefined : "missing-doc" };
    }
    case "doc-update": {
      const doc = await docFor(change.uuid);
      if (!doc) return { ok: false, reason: "missing-doc" };
      const r = await updateDoc(doc, restorePayload(change.prior ?? {}), { isUndo: true });
      return { ok: r.ok, reason: r.reason };
    }
    case "doc-delete": {
      const parent = await docFor(change.parentUuid);
      if (!parent || !change.embedded || !change.data?.length) return { ok: false, reason: "missing-parent" };
      const r = await write({
        type: "create",
        uuid: parent,
        embedded: change.embedded,
        data: change.data,
        options: { keepId: true, isUndo: true }
      });
      return { ok: r.ok, reason: r.reason };
    }
    case "status": {
      const actor = await docFor(change.actorUuid);
      if (!actor) return { ok: false, reason: "missing-actor" };
      const r = await write({ type: "toggleStatus", uuid: actor, statusId: change.statusId, active: Boolean(change.prior) });
      return { ok: r.ok, reason: r.reason };
    }
    case "knockout": {
      const actor = await docFor(change.actorUuid);
      if (!actor) return { ok: false, reason: "missing-actor" };
      const removed = await deleteEffects(change.effectUuids ?? []);
      if (!removed) {
        for (const statusId of ["stable", "unconscious"]) {
          if (actor.statuses?.has?.(statusId)) {
            await write({ type: "toggleStatus", uuid: actor, statusId, active: false });
          }
        }
      }
      if (change.priorDeath && typeof change.priorDeath === "object") {
        await updateDoc(actor, {
          "system.attributes.death.success": change.priorDeath.success ?? 0,
          "system.attributes.death.failure": change.priorDeath.failure ?? 0
        }, { isUndo: true });
      }
      return { ok: true };
    }
    case "note":
      return { ok: true, soft: true };
    default:
      return { ok: false, reason: "unsupported-change" };
  }
}

/**
 * Apply a reverse plan for changes recorded on a resolution or log row.
 * Callers pass changes newest first.
 */
export async function applyUndoPlan(undoPlan = []) {
  debugLog(DEBUG_CHANNELS.GAME_LOG, "undo-plan.start", {
    count: undoPlan?.length ?? 0,
    types: (undoPlan ?? []).map((c) => c?.type)
  });
  const results = [];
  for (const change of undoPlan ?? []) {
    try {
      const r = await undoOne(change ?? {});
      results.push({ ...r, change });
    } catch (err) {
      results.push({ ok: false, reason: String(err?.message ?? err), change });
    }
  }
  debugLog(DEBUG_CHANNELS.GAME_LOG, "undo-plan.done", {
    ok: results.filter((r) => r.ok).length,
    fail: results.filter((r) => !r.ok).length
  });
  return results;
}
