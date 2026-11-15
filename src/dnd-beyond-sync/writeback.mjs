import { connectionConfig } from "./settings.mjs";
import { sendBeyondCalls } from "./character-data.mjs";
import { beyondDebug } from "./debug.mjs";
import { foundryState, writeCalls } from "./state.mjs";

export const WRITE_DELAY_MS = 750;

const views = new Map();
const timers = new Map();
const rests = new Map();

/** Beyond's play state as of the last read or accepted write. Writes diff against it. */
export function rememberView(characterId, state, links) {
  views.set(String(characterId), { state: structuredClone(state), links: { ...links } });
}

export function beyondView(characterId) {
  return views.get(String(characterId)) ?? null;
}

export function isWritePending(characterId) {
  return timers.has(String(characterId));
}

/** The calls a flush would send now. */
export function pendingCalls(actor, characterId, { rest = false } = {}) {
  const view = beyondView(characterId);
  if (!view) return null;
  return writeCalls(view.state, foundryState(actor, view.links, view.state), { characterId, rest });
}

/** Wait for the actor to settle, then send its changed play state to Beyond. */
export function queueBeyondWrite(actor, characterId, {
  rest = false,
  delay = WRITE_DELAY_MS,
  config = connectionConfig,
  send = sendBeyondCalls,
  log = beyondDebug
} = {}) {
  const key = String(characterId);
  if (rest && rests.get(key) !== "long") rests.set(key, rest);
  clearTimeout(timers.get(key));
  return new Promise((resolve) => {
    timers.set(key, setTimeout(async () => {
      timers.delete(key);
      const withRest = rests.get(key) ?? false;
      rests.delete(key);
      resolve(await flushBeyondWrite(actor, key, { config: config(), send, log, rest: withRest }));
    }, delay));
  });
}

export async function flushBeyondWrite(actor, characterId, { config, send = sendBeyondCalls, log = beyondDebug, rest = false }) {
  const view = beyondView(characterId);
  if (!view) return finish(log, { ok: false, reason: "no-read-yet", characterId });
  const calls = writeCalls(view.state, foundryState(actor, view.links, view.state), { characterId, rest });
  if (!calls.length) return finish(log, { ok: true, unchanged: true, characterId });
  const result = await send(characterId, calls.map(({ method, path, body }) => ({ method, path, body })), config);
  const done = Math.max(0, Math.min(calls.length, Number(result?.done ?? (result?.success ? calls.length : 0))));
  for (const call of calls.slice(0, done)) call.commit(view.state);
  const sent = calls.slice(0, done).map((call) => call.path);
  if (!result?.success) {
    return finish(log, { ok: false, reason: result?.reason ?? "write", status: result?.status ?? null, characterId, sent, failed: calls[done]?.path ?? null });
  }
  return finish(log, { ok: true, characterId, name: actor?.name, sent });
}

function finish(log, result) {
  log("write", result);
  return result;
}
