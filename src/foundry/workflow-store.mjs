/**
 * Persistence for workflows that must survive reload.
 */

import { MODULE_ID } from "../constants.mjs";

const memory = new Map();
let seq = 0;

export function nextResolutionId() {
  seq += 1;
  return `${MODULE_ID}:res:${Date.now()}:${seq}`;
}

function clone(value) {
  return structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export async function saveResolution(resolution) {
  if (!resolution?.id) return;
  memory.set(resolution.id, clone(resolution));

  try {
    // World setting. A player write is rejected and shows up as a socket error.
    if (globalThis.game?.user && globalThis.game.user.isGM !== true) return;
    if (!game?.settings?.settings?.has?.(`${MODULE_ID}.workflowStore`)) return;
    const all = { ...(game.settings.get(MODULE_ID, "workflowStore") ?? {}) };
    // Keep only non-terminal or recently completed for undo window
    if (["cancelled"].includes(resolution.phase)) delete all[resolution.id];
    else all[resolution.id] = memory.get(resolution.id);
    // Prune old completed (keep last 20)
    const entries = Object.entries(all);
    if (entries.length > 40) {
      const sorted = entries.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      const keep = Object.fromEntries(sorted.slice(-40));
      await game.settings.set(MODULE_ID, "workflowStore", keep);
    } else {
      await game.settings.set(MODULE_ID, "workflowStore", all);
    }
  } catch {
    /* setting may be missing in tests */
  }
}

export async function loadResolution(id) {
  if (memory.has(id)) return memory.get(id);
  try {
    const all = game.settings.get(MODULE_ID, "workflowStore") ?? {};
    const found = all?.[id] ?? null;
    if (found) memory.set(id, found);
    return found;
  } catch {
    return null;
  }
}

export async function listPendingResolutions() {
  try {
    const all = game.settings.get(MODULE_ID, "workflowStore") ?? {};
    return Object.values(all).filter((r) => r?.phase === "awaiting-reaction" || r?.pendingDecision);
  } catch {
    return [...memory.values()].filter((r) => r.phase === "awaiting-reaction");
  }
}

export async function hydrateFromStore() {
  const pending = await listPendingResolutions();
  for (const res of pending) memory.set(res.id, res);
  return pending;
}

export function clearWorkflowMemory() {
  memory.clear();
}
