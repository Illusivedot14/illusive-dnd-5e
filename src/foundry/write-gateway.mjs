/**
 * Write gateway — the one path for combat document writes.
 *
 * - Owner writes run locally; anything else is run by the active GM (query).
 * - Writes to one document are serialized (per-document queue) on the client
 *   that executes them, so concurrent saves never interleave a flag write.
 * - Every write returns undo records (the game-log journal stores them), and
 *   undo itself goes back through here.
 *
 * Undo record shapes:
 *   { type: "doc-update", uuid, prior: {path: value}, next: {path: value} }
 *   { type: "flag", uuid, scope, key, prior }
 *   { type: "effect", actorUuid, effectUuids }           (created ActiveEffects)
 *   { type: "doc-create", uuids }                         (other created documents)
 *   { type: "doc-delete", parentUuid, embedded, data[] }  (recreated with keepId)
 *   { type: "actor-hp", actorUuid, prior, next }
 *   { type: "status", actorUuid, statusId, prior }
 */

import { registerQuery, askGm, canAskGm } from "./gm-query.mjs";
import { debugLog, DEBUG_CHANNELS } from "./debug.mjs";

const OPS = new Set(["update", "setFlag", "unsetFlag", "create", "delete", "applyDamage", "toggleStatus"]);

/* ---------------------------------------------------------------- helpers */

function clone(value) {
  if (value === undefined) return undefined;
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

function flatten(obj, prefix = "", out = {}) {
  const utils = globalThis.foundry?.utils;
  if (!prefix && typeof utils?.flattenObject === "function") return utils.flattenObject(obj ?? {});
  for (const [key, value] of Object.entries(obj ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Set)
      && Object.keys(value).length) {
      flatten(value, path, out);
    } else {
      out[path] = value;
    }
  }
  return out;
}

function getPath(obj, path) {
  const utils = globalThis.foundry?.utils;
  if (typeof utils?.getProperty === "function") return utils.getProperty(obj, path);
  return String(path).split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function resolveDoc(ref) {
  if (!ref) return null;
  if (typeof ref !== "string") return ref;
  try {
    return globalThis.fromUuidSync?.(ref) ?? null;
  } catch {
    return null;
  }
}

function uuidOf(ref) {
  if (!ref) return null;
  return typeof ref === "string" ? ref : (ref.uuid ?? null);
}

/** Documents without an ownership flag (unit-test doubles) count as owned. */
function ownsLocally(doc) {
  if (!doc) return false;
  if (globalThis.game?.user?.isGM) return true;
  return doc.isOwner !== false;
}

function hpSnapshot(actor) {
  const hp = actor?.system?.attributes?.hp ?? {};
  return {
    value: Number(hp.value) || 0,
    temp: Number(hp.temp) || 0,
    tempmax: Number(hp.tempmax) || 0,
    max: Number(hp.max) || 0
  };
}

/** Prior values of every path an update touches (source data, not derived). */
function priorValues(doc, data) {
  const source = doc?._source ?? doc;
  const prior = {};
  const next = {};
  for (const [path, value] of Object.entries(flatten(data))) {
    const del = /(^|\.)-=([^.]+)$/.exec(path);
    if (del) {
      const real = path.replace(/-=/, "");
      prior[real] = clone(getPath(source, real));
      next[real] = undefined;
      continue;
    }
    prior[path] = clone(getPath(source, path));
    next[path] = clone(value);
  }
  return { prior, next };
}

/** Update payload that restores `values` (undefined → delete the key). */
export function restorePayload(values = {}) {
  const out = {};
  for (const [path, value] of Object.entries(values)) {
    if (value === undefined) {
      const i = path.lastIndexOf(".");
      out[i < 0 ? `-=${path}` : `${path.slice(0, i)}.-=${path.slice(i + 1)}`] = null;
    } else {
      out[path] = value;
    }
  }
  return out;
}

/* ---------------------------------------------------------- write queue */

const queues = new Map();

function queueKey(doc) {
  const name = doc?.documentName;
  if ((name === "ActiveEffect" || name === "Item") && doc?.parent?.uuid) return doc.parent.uuid;
  return doc?.uuid ?? "global";
}

/** Run fn after every earlier write on the same key settles. */
export function serialize(key, fn) {
  const prev = queues.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => null);
  queues.set(key, tail);
  tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key);
  });
  return run;
}

/* ------------------------------------------------------------ executors */

async function execUpdate(doc, op) {
  const { prior, next } = priorValues(doc, op.data);
  await doc.update(op.data, op.options ?? {});
  return { ok: true, undo: [{ type: "doc-update", uuid: doc.uuid, prior, next }] };
}

async function execSetFlag(doc, op) {
  const prior = clone(doc.getFlag?.(op.scope, op.key));
  await doc.setFlag(op.scope, op.key, op.value);
  return { ok: true, undo: [{ type: "flag", uuid: doc.uuid, scope: op.scope, key: op.key, prior }] };
}

async function execUnsetFlag(doc, op) {
  const prior = clone(doc.getFlag?.(op.scope, op.key));
  if (prior === undefined) return { ok: true, undo: [] };
  await doc.unsetFlag(op.scope, op.key);
  return { ok: true, undo: [{ type: "flag", uuid: doc.uuid, scope: op.scope, key: op.key, prior }] };
}

async function execCreate(parent, op) {
  const made = await parent.createEmbeddedDocuments(op.embedded, op.data ?? [], op.options ?? {});
  const uuids = (made ?? []).map((d) => d?.uuid).filter(Boolean);
  const undo = !uuids.length ? []
    : op.embedded === "ActiveEffect"
      ? [{ type: "effect", actorUuid: parent.uuid, effectUuids: uuids }]
      : [{ type: "doc-create", uuids }];
  return { ok: uuids.length > 0, uuids, undo };
}

async function execDelete(docs) {
  const undo = [];
  const byParent = new Map();
  for (const doc of docs) {
    const parent = doc.parent;
    const key = parent?.uuid ?? `root:${doc.uuid}`;
    if (!byParent.has(key)) byParent.set(key, { parent, docs: [] });
    byParent.get(key).docs.push(doc);
  }
  let deleted = 0;
  for (const { parent, docs: group } of byParent.values()) {
    const embedded = group[0].documentName;
    const data = group.map((d) => (typeof d.toObject === "function" ? d.toObject() : clone(d)));
    if (parent?.deleteEmbeddedDocuments && embedded) {
      await parent.deleteEmbeddedDocuments(embedded, group.map((d) => d.id));
    } else {
      for (const d of group) await d.delete?.();
    }
    deleted += group.length;
    if (parent?.uuid && embedded) undo.push({ type: "doc-delete", parentUuid: parent.uuid, embedded, data });
  }
  return { ok: deleted > 0, undo };
}

async function execApplyDamage(actor, op) {
  if (typeof actor.applyDamage !== "function") return { ok: false, reason: "no-applyDamage", undo: [] };
  const damages = (op.damages ?? []).map((d) => ({
    value: Number(d.value) || 0,
    type: d.type || undefined,
    properties: new Set(d.properties ?? [])
  })).filter((d) => d.value !== 0);
  if (!damages.length) return { ok: false, reason: "no-damage", undo: [] };
  const prior = hpSnapshot(actor);
  await actor.applyDamage(damages, { ...(op.options ?? {}), isDelta: true });
  const next = hpSnapshot(actor);
  return { ok: true, prior, next, undo: [{ type: "actor-hp", actorUuid: actor.uuid, prior, next }] };
}

async function execToggleStatus(actor, op) {
  const prior = Boolean(actor.statuses?.has?.(op.statusId));
  const want = op.active ?? !prior;
  if (want === prior) return { ok: true, active: prior, effectUuids: [], undo: [] };
  const made = await actor.toggleStatusEffect(op.statusId, { active: want, overlay: Boolean(op.overlay) });
  const effectUuids = made && typeof made === "object" && made.uuid ? [made.uuid] : [];
  return {
    ok: true,
    active: want,
    effectUuids,
    undo: [{ type: "status", actorUuid: actor.uuid, statusId: op.statusId, prior }]
  };
}

/** Execute an op on this client (owner, or GM serving a query). */
export async function executeLocal(op) {
  if (!op || !OPS.has(op.type)) return { ok: false, reason: "unsupported-op", undo: [] };
  if (op.type === "delete") {
    const docs = (op.uuids ?? []).map(resolveDoc).filter(Boolean);
    if (!docs.length) return { ok: false, reason: "missing", undo: [] };
    return serialize(queueKey(docs[0]), () => execDelete(docs));
  }
  const doc = resolveDoc(op.uuid);
  if (!doc) return { ok: false, reason: "missing", undo: [] };
  return serialize(queueKey(doc), async () => {
    switch (op.type) {
      case "update": return execUpdate(doc, op);
      case "setFlag": return execSetFlag(doc, op);
      case "unsetFlag": return execUnsetFlag(doc, op);
      case "create": return execCreate(doc, op);
      case "applyDamage": return execApplyDamage(doc, op);
      case "toggleStatus": return execToggleStatus(doc, op);
      default: return { ok: false, reason: "unsupported-op", undo: [] };
    }
  });
}

function needsGm(op) {
  if (op.type === "delete") {
    return (op.uuids ?? []).map(resolveDoc).some((d) => d && !ownsLocally(d));
  }
  const doc = resolveDoc(op.uuid);
  return Boolean(doc && !ownsLocally(doc));
}

/** Plain JSON for the query wire (Sets → arrays, docs → uuids). */
function wireOp(op) {
  const out = { ...op };
  if (op.uuid) out.uuid = uuidOf(op.uuid);
  if (op.uuids) out.uuids = op.uuids.map(uuidOf).filter(Boolean);
  if (op.damages) {
    out.damages = op.damages.map((d) => ({
      value: d.value,
      type: d.type ?? null,
      properties: d.properties instanceof Set ? [...d.properties] : [...(d.properties ?? [])]
    }));
  }
  return JSON.parse(JSON.stringify(out));
}

/**
 * Run one write. Local when this user owns the document, else on the active GM.
 * @returns {Promise<{ ok: boolean, undo: object[], reason?: string, uuids?: string[], via?: string }>}
 */
export async function write(op) {
  if (!op || !OPS.has(op.type)) return { ok: false, reason: "unsupported-op", undo: [] };
  try {
    if (needsGm(op) && canAskGm()) {
      const result = await askGm("write", { op: wireOp(op) });
      debugLog(DEBUG_CHANNELS.GAME_LOG, "gateway.gm", { type: op.type, uuid: uuidOf(op.uuid), ok: result?.ok });
      return { undo: [], ...(result ?? { ok: false, reason: "no-result" }), via: "gm" };
    }
    const result = await executeLocal(op);
    return { ...result, via: "local" };
  } catch (err) {
    console.warn("illusive-dnd-5e | write failed", op.type, uuidOf(op.uuid) ?? op.uuids?.map?.(uuidOf), err);
    return { ok: false, reason: String(err?.message ?? err), undo: [] };
  }
}

/** Run writes in order; returns every result. */
export async function writeAll(ops = []) {
  const out = [];
  for (const op of ops) out.push(await write(op));
  return out;
}

/* ---------------------------------------------------------- convenience */

export function updateDoc(doc, data, options = {}) {
  return write({ type: "update", uuid: doc, data, options });
}

export function setDocFlag(doc, scope, key, value) {
  return write({ type: "setFlag", uuid: doc, scope, key, value });
}

export function unsetDocFlag(doc, scope, key) {
  return write({ type: "unsetFlag", uuid: doc, scope, key });
}

/** Create embedded documents; resolves created docs on this client when synced. */
export async function createEmbedded(parent, embedded, data = [], options = {}) {
  const result = await write({ type: "create", uuid: parent, embedded, data, options });
  const docs = (result.uuids ?? []).map(resolveDoc).filter(Boolean);
  return { ...result, docs };
}

export function deleteDocs(docsOrUuids = []) {
  const uuids = docsOrUuids.filter(Boolean);
  if (!uuids.length) return Promise.resolve({ ok: false, reason: "empty", undo: [] });
  return write({ type: "delete", uuids });
}

export function applyActorDamage(actor, damages, options = {}) {
  return write({ type: "applyDamage", uuid: actor, damages, options });
}

export function toggleActorStatus(actor, statusId, { active = undefined, overlay = false } = {}) {
  return write({ type: "toggleStatus", uuid: actor, statusId, active, overlay });
}

/* --------------------------------------------------------------- binding */

let bound = false;

/** Register the GM-side handler (init). */
export function bindWriteGateway() {
  if (bound) return;
  bound = registerQuery("write", async ({ op }) => {
    if (!globalThis.game?.user?.isGM) return { ok: false, reason: "not-gm", undo: [] };
    return executeLocal(op);
  });
}

export function _resetWriteQueues() {
  queues.clear();
}
