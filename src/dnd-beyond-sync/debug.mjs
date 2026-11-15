import { MODULE_ID } from "../constants.mjs";
import { debugLog, isDebugLoggingEnabled } from "../foundry/debug.mjs";
import { SETTING } from "./settings.mjs";

const MAX_LINES = 80;
const SECRET = /cookie|token|password|cobalt|authorization/i;

const lines = [];
const listeners = new Set();
let status = "Idle";

function redact(value, depth = 0) {
  if (value == null || depth > 2) return value;
  if (Array.isArray(value)) return value.slice(0, 8).map((entry) => redact(entry, depth + 1));
  if (typeof value !== "object") return value;
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    out[key] = SECRET.test(key) ? "***" : redact(entry, depth + 1);
  }
  return out;
}

function consoleOn() {
  try {
    if (game?.settings?.get?.(MODULE_ID, SETTING.debug)) return true;
  } catch {
    /* setting not ready */
  }
  return isDebugLoggingEnabled();
}

function notify() {
  const text = beyondLogText();
  for (const listener of listeners) {
    try { listener({ status, text }); } catch { /* menu closed */ }
  }
}

export function beyondStatus() {
  return status;
}

export function setBeyondStatus(next) {
  status = String(next || "Idle");
  notify();
}

export function beyondLogText() {
  return lines.join("\n");
}

export function clearBeyondLog() {
  lines.length = 0;
  notify();
}

export function subscribeBeyondLog(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Record one sync event. Secrets are masked. The menu shows the buffer. */
export function beyondDebug(tag, data) {
  const safe = data === undefined ? undefined : redact(data);
  const clock = new Date().toLocaleTimeString();
  const detail = safe === undefined ? "" : ` ${JSON.stringify(safe)}`;
  lines.push(`${clock}  ${tag}${detail}`);
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
  if (consoleOn()) debugLog("beyond", tag, safe);
  notify();
}
