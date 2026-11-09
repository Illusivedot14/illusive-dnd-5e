/**
 * Token movement modes, budget, and undo.
 */

import { MODULE_ID } from "../constants.mjs";
import { illusiveDnd, illusiveDndCore } from "../i18n/index.mjs";
import { getViewedCombat } from "../foundry/combat.mjs";
import { debugLog, DEBUG_CHANNELS, isDebugLoggingEnabled } from "../foundry/debug.mjs";
import { isDashed } from "./economy.mjs";
import { movementSpeed } from "../domain/combat/actor-paths.mjs";

function dbgMove(tag, data = {}) {
  debugLog(DEBUG_CHANNELS.GAME_LOG, tag, data);
}

/** Player-facing movement label (dnd5e labels walk as "Speed" internally). */
export function movementTypeLabel(key, config) {
  if (key === "walk") {
    const walk = game.i18n?.localize("DND5E.MOVEMENT.Type.Walk");
    if (walk && walk !== "DND5E.MOVEMENT.Type.Walk") return walk;
    return "Walk";
  }
  return illusiveDndCore(config?.label ?? `DND5E.MOVEMENT.Type.${key}`);
}

/** Font Awesome icon class for the active movement mode (no `fas` prefix). */
export function movementModeIcon(mode) {
  switch (mode) {
    case "fly": return "fa-person-fairy";
    case "swim": return "fa-person-swimming";
    case "climb": return "fa-person-through-window";
    case "burrow": return "fa-person-digging";
    case "crawl": return "fa-person-praying";
    case "jump": return "fa-person-running-fast";
    case "blink": return "fa-person-from-portal";
    case "walk": return "fa-person-walking";
    default: return "fa-person-walking";
  }
}

const FALLBACK_MOVEMENT_ACTIONS = ["walk", "fly", "swim", "burrow", "crawl", "climb", "jump", "blink"];

function toFaIcon(icon, fallbackId) {
  if (typeof icon === "string") {
    const name = icon.split(/\s+/).find((part) => (
      part.startsWith("fa-") && !["fa-solid", "fa-regular", "fa-brands", "fa-fw"].includes(part)
    ));
    if (name) return name;
  }
  return movementModeIcon(fallbackId);
}

function canSelectMovementAction(token, action, config, current) {
  if (action === current) return true;
  const canSelect = config?.canSelect;
  if (typeof canSelect === "function") return Boolean(canSelect(token.document));
  if (canSelect === undefined) return true;
  return Boolean(canSelect);
}

/** How the token moves — Foundry's list, not the speeds on the sheet. */
export function listTokenMovementActions(token) {
  const configured = CONFIG.Token?.movement?.actions;
  const current = token?.document?._source?.movementAction ?? token?.document?.movementAction ?? null;
  if (configured && Object.keys(configured).length) {
    return Object.entries(configured)
      .filter(([id, config]) => canSelectMovementAction(token, id, config, current))
      .sort((a, b) => (a[1]?.order ?? 0) - (b[1]?.order ?? 0))
      .map(([id, config]) => ({
        id,
        label: game.i18n?.localize?.(config.label) ?? config.label ?? id,
        icon: toFaIcon(config.icon, id)
      }));
  }
  return FALLBACK_MOVEMENT_ACTIONS.map((id) => ({
    id,
    label: movementTypeLabel(id, CONFIG.DND5E?.movementTypes?.[id]),
    icon: movementModeIcon(id)
  }));
}

export function getTokenMovementDisplay(token) {
  const action = String(
    token?.document?.movementAction
    || CONFIG.Token?.movement?.defaultAction
    || "walk"
  );
  const config = CONFIG.Token?.movement?.actions?.[action];
  return {
    mode: action,
    modeLabel: config?.label
      ? (game.i18n?.localize?.(config.label) ?? config.label)
      : movementTypeLabel(action, CONFIG.DND5E?.movementTypes?.[action]),
    modeIcon: toFaIcon(config?.icon, action)
  };
}

/** Effective movement speed after derived data (armor, encumbrance, conditions). */
export function getMovementModeSpeed(movement, key) {
  return movementSpeed(movement, key);
}

function getWalkBaseSpeed(actor) {
  const sourceMovement = actor?._source?.system?.attributes?.movement;
  const sourceWalk = sourceMovement?.speeds?.walk ?? sourceMovement?.walk;
  if (Number.isFinite(sourceWalk) && sourceWalk > 0) return Number(sourceWalk);

  const speciesWalk = actor?.system?.attributes?.movement?.fromSpecies?.walk;
  if (Number.isFinite(speciesWalk) && speciesWalk > 0) return Number(speciesWalk);

  return null;
}

export function getMovementModes(actor) {
  const movement = actor?.system?.attributes?.movement;
  if (!movement) return [];

  const modes = [];
  const walkBase = getWalkBaseSpeed(actor);

  for (const [key, config] of Object.entries(CONFIG.DND5E?.movementTypes ?? {})) {
    if (config.hidden) continue;
    const speed = getMovementModeSpeed(movement, key);
    if (speed > 0 || key === "walk") {
      const entry = {
        id: key,
        label: movementTypeLabel(key, config),
        speed
      };
      if (key === "walk" && walkBase && walkBase > speed) entry.baseSpeed = walkBase;
      modes.push(entry);
    }
  }
  return modes;
}

function getMovementPoolMax(movement) {
  if (!movement) return 0;
  if (movement.max > 0) return movement.max;

  let peak = 0;
  for (const key of Object.keys(CONFIG.DND5E?.movementTypes ?? {})) {
    peak = Math.max(peak, getMovementModeSpeed(movement, key));
  }

  if (!peak) {
    for (const key of ["walk", "fly", "swim", "climb", "burrow"]) {
      peak = Math.max(peak, getMovementModeSpeed(movement, key));
    }
  }

  return peak;
}

/**
 * Shared movement budget is the highest available speed (gestalt / fly 90 + walk 30 → 90).
 * Each mode is also capped by its own speed. Remaining for a mode is
 * min(modeSpeed − modeUsed, poolRemaining).
 *
 * Combat path (inCombat true): spend from history + dash.
 * Idle path: full pool, no spend. Same return shape.
 */
export function buildMovementData(token, { inCombat = true } = {}) {
  if (inCombat && !getViewedCombat()?.started) return null;
  if (!token?.actor) return null;

  const movement = token.actor.system?.attributes?.movement;
  if (!movement) return null;

  const pose = getTokenMovementDisplay(token);
  const mode = pose.mode;
  const poolMax = getMovementPoolMax(movement);
  if (!poolMax) return null;

  const isDashing = inCombat && (isDashed(token.actor)
    || Boolean(token.actor.getFlag?.(MODULE_ID, "dashing")));
  const maxFeet = Math.max(0, isDashing ? poolMax * 2 : poolMax);

  let usedFeet = 0;
  let usedByMode = {};
  if (inCombat) {
    const scene = canvas?.scene
      ?? token.document?.parent
      ?? game.scenes?.active
      ?? game.scenes?.current
      ?? null;
    const gridDistance = Number(scene?.grid?.distance ?? scene?.dimensions?.distance) || 5;
    const history = token.document.movementHistory ?? [];
    usedFeet = getMovementUsedFeet(token, history, gridDistance);
    usedByMode = getMovementUsedByMode(token, history, gridDistance, usedFeet, mode);
  }

  const remainingFeet = Math.max(0, maxFeet - usedFeet);
  const modes = enrichMovementModes(token.actor, mode, usedByMode, remainingFeet, isDashing);

  return {
    usedFeet,
    maxFeet,
    remainingFeet,
    poolMax,
    percent: maxFeet > 0 ? Math.clamp((remainingFeet / maxFeet) * 100, 0, 100) : 100,
    mode,
    modeLabel: pose.modeLabel,
    modeIcon: pose.modeIcon,
    isDashing,
    isGestalt: poolMax > getMovementModeSpeed(movement, mode),
    modes: shouldShowMovementModes(modes) ? modes : [],
    canUndo: canUndoTokenMovement(token)
  };
}

/** Walk/fly speed display when not in active combat (muted movement readout). */
export function buildIdleMovementData(token) {
  return buildMovementData(token, { inCombat: false });
}

function shouldShowMovementModes(modes) {
  // Total pool is on the ring readout; only list modes when there's a choice.
  return modes.length > 1;
}

function enrichMovementModes(actor, activeMode, usedByMode, poolRemaining, isDashing) {
  const factor = isDashing ? 2 : 1;
  return getMovementModes(actor)
    .filter((entry) => entry.speed > 0)
    .map((entry) => {
      const max = entry.speed * factor;
      const used = Math.max(0, Number(usedByMode[entry.id] ?? 0));
      const remaining = Math.max(0, Math.min(max - used, poolRemaining));
      return {
        ...entry,
        max,
        used,
        remaining,
        icon: movementModeIcon(entry.id),
        isActive: entry.id === activeMode,
        isEmpty: remaining <= 0,
        percent: max > 0 ? Math.clamp((remaining / max) * 100, 0, 100) : 0
      };
    });
}

function normalizeMovementMode(value) {
  const key = String(value ?? "walk").toLowerCase();
  if (CONFIG.DND5E?.movementTypes?.[key]) return key;
  if (["walk", "fly", "swim", "climb", "burrow"].includes(key)) return key;
  return "walk";
}

function segmentMovementCost(token, from, to, gridDistance) {
  const direct = Number(to?.cost);
  if (Number.isFinite(direct) && direct >= 0) return Math.round(direct);

  if (typeof token.document?.measureMovementPath === "function") {
    try {
      const measured = token.document.measureMovementPath([from, to]);
      if (Number.isFinite(measured?.cost)) return Math.round(measured.cost);
      if (Number.isFinite(measured?.spaces) && measured.spaces > 0) {
        return Math.round(measured.spaces * gridDistance);
      }
      if (Number.isFinite(measured?.distance)) return Math.round(measured.distance);
    } catch {
      /* fall through */
    }
  }
  return 0;
}

/** Feet spent per movement mode from path history (falls back to active mode). */
function getMovementUsedByMode(token, history, gridDistance, usedFeet, activeMode) {
  const byMode = Object.create(null);
  if (!history?.length || usedFeet <= 0) return byMode;

  for (let i = 1; i < history.length; i++) {
    const from = history[i - 1];
    const to = history[i];
    const modeKey = normalizeMovementMode(
      to?.action ?? to?.movementAction ?? from?.action ?? from?.movementAction ?? activeMode
    );
    byMode[modeKey] = (byMode[modeKey] ?? 0) + segmentMovementCost(token, from, to, gridDistance);
  }

  const segmented = Object.values(byMode).reduce((total, value) => total + value, 0);
  if (segmented <= 0) {
    byMode[normalizeMovementMode(activeMode)] = usedFeet;
    return byMode;
  }

  // Keep mode caps aligned with the authoritative pool total when segments disagree.
  if (segmented !== usedFeet) {
    const scale = usedFeet / segmented;
    for (const key of Object.keys(byMode)) {
      byMode[key] = Math.round(byMode[key] * scale);
    }
  }
  return byMode;
}

/** Sum of recorded step costs, or null when a step never stored one. */
function recordedHistoryCost(history) {
  if (!history?.length) return 0;
  let total = 0;
  for (let i = 1; i < history.length; i += 1) {
    const cost = Number(history[i]?.cost);
    if (!Number.isFinite(cost) || cost < 0) return null;
    total += cost;
  }
  return Math.round(total);
}

function getMovementUsedFeet(token, history, gridDistance) {
  if (!history.length) return 0;

  const recorded = recordedHistoryCost(history);
  if (recorded != null) return recorded;

  const doc = token?.document ?? token;
  if (history.length >= 2 && typeof doc?.measureMovementPath === "function") {
    try {
      const measured = doc.measureMovementPath(history);
      if (Number.isFinite(measured?.cost)) {
        return Math.round(measured.cost);
      }
      if (Number.isFinite(measured?.spaces) && measured.spaces > 0) {
        return Math.round(measured.spaces * gridDistance);
      }
      if (Number.isFinite(measured?.distance)) {
        return Math.round(measured.distance);
      }
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to measure movement path`, error);
    }
  }

  const usedCost = history.reduce((total, entry) => total + (entry.cost ?? 0), 0);
  return Math.round(usedCost);
}

function gridDistanceForToken(token) {
  const doc = token?.document ?? token;
  const scene = globalThis.canvas?.scene
    ?? doc?.parent
    ?? globalThis.game?.scenes?.active
    ?? globalThis.game?.scenes?.current
    ?? null;
  return Number(scene?.grid?.distance ?? scene?.dimensions?.distance) || 5;
}

function isUnconstrainedMovement() {
  try {
    return Boolean(
      globalThis.game?.user?.isGM
      && globalThis.game?.settings?.get?.("core", "unconstrainedMovement")
    );
  } catch {
    return false;
  }
}

/**
 * Feet this update would spend (new segment), or 0 when unmeasurable.
 */
export function estimateProposedMoveCostFeet(tokenDoc, changes = {}) {
  const token = tokenDoc?.object
    ?? { document: tokenDoc, actor: tokenDoc?.actor };
  const doc = token.document ?? tokenDoc;
  const gridDistance = gridDistanceForToken(token);
  const history = doc?._source?._movementHistory ?? doc?.movementHistory ?? [];

  if (Array.isArray(changes._movementHistory)) {
    const oldUsed = getMovementUsedFeet(token, history, gridDistance);
    const newUsed = getMovementUsedFeet(token, changes._movementHistory, gridDistance);
    const delta = newUsed - oldUsed;
    if (Number.isFinite(delta) && delta > 0) return delta;
  }

  if (changes.x == null && changes.y == null && changes.elevation == null) return 0;

  const from = {
    x: Number(doc.x) || 0,
    y: Number(doc.y) || 0,
    elevation: Number(doc.elevation) || 0,
    width: doc.width,
    height: doc.height,
    shape: doc.shape,
    action: doc.movementAction || "walk"
  };
  const to = {
    ...from,
    x: changes.x ?? from.x,
    y: changes.y ?? from.y,
    elevation: changes.elevation ?? from.elevation,
    width: changes.width ?? from.width,
    height: changes.height ?? from.height,
    shape: changes.shape ?? from.shape,
    action: changes.action ?? changes.movementAction ?? from.action,
    cost: changes.cost
  };

  const cost = segmentMovementCost(token, from, to, gridDistance);
  if (cost > 0) return cost;

  // Fallback: one grid step ≈ grid distance when Foundry didn't store a cost.
  const dx = Math.abs((Number(to.x) || 0) - (Number(from.x) || 0));
  const dy = Math.abs((Number(to.y) || 0) - (Number(from.y) || 0));
  const step = Number(doc.parent?.grid?.size ?? doc.parent?.grid?.sizeX) || 100;
  const spaces = Math.max(
    Math.round(dx / step) || (dx > 0 ? 1 : 0),
    Math.round(dy / step) || (dy > 0 ? 1 : 0)
  );
  // Diagonal counts as one space under 5e/foundry default for a single step.
  const diag = dx > 0 && dy > 0 ? 1 : 0;
  const counted = spaces > 0 ? Math.max(spaces, diag || spaces) : (diag ? 1 : 0);
  return counted * gridDistance;
}

/**
 * Whether a combat position update would exceed remaining speed.
 * GM unconstrained movement, undos, and teleports are allowed.
 */
export function combatMoveExceedsBudget(tokenDoc, changes = {}, options = {}) {
  if (!tokenDoc) return false;
  if (options?.isUndo || options?.teleport || options?.illusiveDndBypassMovementBudget) return false;
  if (isUnconstrainedMovement()) return false;
  if (!getViewedCombat()?.started) return false;
  if (changes.x == null && changes.y == null && !changes._movementHistory) return false;

  const token = tokenDoc.object ?? {
    document: tokenDoc,
    actor: tokenDoc.actor ?? null,
    name: tokenDoc.name
  };
  if (!token.actor) return false;
  const budget = buildMovementData(token, { inCombat: true });
  if (!budget) return false;

  const cost = estimateProposedMoveCostFeet(tokenDoc, changes);
  if (!(cost > 0)) return budget.remainingFeet <= 0;

  return cost - 0.01 > budget.remainingFeet;
}

/**
 * preUpdateToken gate: return false to block. Optionally notifies.
 */
export function enforceCombatMovementBudget(tokenDoc, changes, options = {}) {
  if (!combatMoveExceedsBudget(tokenDoc, changes, options)) return true;
  try {
    const token = tokenDoc.object ?? tokenDoc;
    const budget = buildMovementData(
      token?.document ? token : { document: tokenDoc, actor: tokenDoc.actor },
      { inCombat: true }
    );
    const left = budget?.remainingFeet ?? 0;
    globalThis.ui?.notifications?.warn?.(
      illusiveDnd.movement("overBudget", { remaining: left })
    );
  } catch {
    /* ignore */
  }
  return false;
}

export async function setMovementMode(token, mode) {
  if (!token?.document) return;
  await token.document.update({ movementAction: mode });
}

/** Next Foundry movement action — same list as the token HUD. */
export async function cycleMovementMode(token) {
  if (!token?.document) return false;
  const modes = listTokenMovementActions(token);
  if (!modes.length) return false;
  const current = token.document._source?.movementAction ?? token.document.movementAction ?? modes[0].id;
  const index = modes.findIndex((entry) => entry.id === current);
  const next = modes[(index < 0 ? 0 : index + 1) % modes.length];
  if (!next || next.id === current) return false;
  await token.document.update({ movementAction: next.id });
  return true;
}

function getRecordedMovementHistory(token) {
  return token?.document?._source?._movementHistory ?? token?.document?.movementHistory ?? [];
}

function getLastRecordedMovementId(token) {
  const history = getRecordedMovementHistory(token);
  for (let i = history.length - 1; i >= 0; i--) {
    const id = history[i]?.movementId;
    if (id) return id;
  }
  return null;
}

export function canUndoTokenMovement(token) {
  return getRecordedMovementHistory(token).length > 1 && Boolean(getLastRecordedMovementId(token));
}

function gridStep(doc) {
  const grid = doc?.parent?.grid ?? {};
  const x = Number(grid.sizeX ?? grid.size) || 100;
  const y = Number(grid.sizeY ?? grid.size) || x;
  return { x, y };
}

function sameGridSquare(a, b, step) {
  if (!a || !b) return false;
  return Math.round(Number(a.x) / step.x) === Math.round(Number(b.x) / step.x)
    && Math.round(Number(a.y) / step.y) === Math.round(Number(b.y) / step.y);
}

/** Last recorded point that is actually on another square. */
function previousSquareIndex(history, step) {
  const current = history.at(-1);
  for (let i = history.length - 2; i >= 0; i -= 1) {
    if (!sameGridSquare(history[i], current, step)) return i;
  }
  return 0;
}

/** Square to restore when Foundry's own undo does not run. Read from the recorded path. */
export function undoFallbackPosition(token, { all = false } = {}) {
  const history = getRecordedMovementHistory(token);
  if (history.length < 2) return null;
  const index = all ? 0 : previousSquareIndex(history, gridStep(token?.document));
  const entry = history[index];
  const x = Number(entry?.x);
  const y = Number(entry?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

/**
 * Roll the token back along Foundry's recorded path in one update.
 * Foundry's revertRecordedMovement snaps and pans the camera. This is the same
 * history write, with the camera left where it is, so the return is one glide.
 */
async function rollbackRecordedMovement(token, { all = false } = {}) {
  const doc = token?.document;
  if (!doc || typeof doc.update !== "function") return false;
  const history = getRecordedMovementHistory(token);
  if (history.length < 2) return false;
  const index = all ? 0 : previousSquareIndex(history, gridStep(doc));
  const prior = history[index];
  const kept = index === 0 ? [] : history.slice(0, index + 1);
  const args = { result: {} };
  try { doc.object?.stopAnimation?.({ reset: false }); } catch { /* token is not on this canvas */ }
  let updated = null;
  try {
    updated = await doc.update({
      x: prior.x,
      y: prior.y,
      elevation: prior.elevation,
      width: prior.width,
      height: prior.height,
      depth: prior.depth,
      shape: prior.shape,
      level: prior.level,
      action: "walk",
      _movementHistory: kept
    }, { isUndo: true, diff: false, pan: false, _movementArguments: args });
  } catch {
    return false;
  }
  return Boolean(args.result?.[doc.id] && updated);
}

/** Undo only the last square. A recorded point on that same square is not a step. */
export async function undoOneTokenMovement(token) {
  if (!canUndoTokenMovement(token)) return false;
  return rollbackRecordedMovement(token, { all: false });
}

/** Put the token all the way back in one move, not square-by-square. */
export async function undoLastTokenMovement(token) {
  if (!canUndoTokenMovement(token)) return false;
  return rollbackRecordedMovement(token, { all: true });
}

/**
 * Undo one Foundry drag (by movementId) via the official API so position AND
 * spent feet / path rulers roll back together.
 */
export async function undoTokenMovementDrag(token, movementId = null) {
  const doc = token?.document;
  if (!doc) return false;
  try { doc.object?.stopAnimation?.({ reset: false }); } catch { /* ignore */ }

  if (typeof doc.revertRecordedMovement === "function") {
    const before = {
      x: doc.x,
      y: doc.y,
      historyLen: getRecordedMovementHistory(token).length,
      usedFeet: getTokenMovementUsedFeet(token)
    };
    dbgMove("token.revert-recorded", { tokenUuid: doc.uuid, movementId, before });
    try {
      const ok = movementId
        ? await doc.revertRecordedMovement(movementId)
        : await doc.revertRecordedMovement();
      dbgMove("token.revert-recorded-done", {
        ok: Boolean(ok),
        after: {
          x: doc.x,
          y: doc.y,
          historyLen: getRecordedMovementHistory(token).length,
          usedFeet: getTokenMovementUsedFeet(token)
        }
      });
      if (ok) return true;
    } catch (err) {
      if (isDebugLoggingEnabled()) {
        console.warn(`[${MODULE_ID}:game-log] token.revert-recorded-failed`, err);
      }
    }
  }

  // Fallback when Foundry API is missing or rejected this id.
  if (movementId) {
    const history = getRecordedMovementHistory(token);
    let first = -1;
    for (let i = 0; i < history.length; i += 1) {
      if (history[i]?.movementId === movementId) {
        first = i;
        break;
      }
    }
    if (first > 0) {
      const prior = history[first - 1];
      return undoTokenMovementToPrior(token, prior, first);
    }
    if (first === 0) {
      return undoTokenMovementToPrior(token, history[0], 1);
    }
  }
  return undoLastTokenMovement(token);
}

/**
 * Absolute restore to a stored prior pose.
 * Used when Foundry cleared movement history (turn start) so revertRecordedMovement
 * and historyLenBefore slicing are useless — and without isUndo the teleport would
 * be recorded as a brand-new path (breaking the next undo).
 */
export async function restoreTokenMovementAbsolute(token, prior) {
  const doc = token?.document;
  if (!doc || typeof doc.update !== "function" || !prior) return false;
  const x = Number(prior.x);
  const y = Number(prior.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

  const elevation = Number(prior.elevation ?? doc.elevation ?? 0);
  const origin = {
    x,
    y,
    elevation,
    width: prior.width ?? doc.width,
    height: prior.height ?? doc.height,
    depth: prior.depth ?? doc.depth,
    shape: prior.shape ?? doc.shape,
    level: prior.level ?? doc.level,
    cost: 0
  };

  try { doc.object?.stopAnimation?.({ reset: false }); } catch { /* ignore */ }
  dbgMove("token.restore-absolute", {
    tokenUuid: doc.uuid,
    before: { x: doc.x, y: doc.y, historyLen: getRecordedMovementHistory(token).length },
    restore: { x, y, elev: elevation }
  });

  const args = { result: {} };
  try {
    const updated = await doc.update({
      x,
      y,
      elevation,
      width: origin.width,
      height: origin.height,
      depth: origin.depth,
      shape: origin.shape,
      level: origin.level,
      action: "walk",
      // Single origin waypoint — spent feet become 0 for this turn's cleared history.
      _movementHistory: [origin]
    }, {
      isUndo: true,
      illusiveDndBypassMovementBudget: true,
      diff: false,
      pan: false,
      animate: false,
      _movementArguments: args
    });
    dbgMove("token.restore-absolute-done", {
      ok: Boolean(updated),
      after: {
        x: doc.x,
        y: doc.y,
        historyLen: getRecordedMovementHistory(token).length,
        usedFeet: getTokenMovementUsedFeet(token)
      }
    });
    return Boolean(updated);
  } catch (err) {
    if (isDebugLoggingEnabled()) {
      console.warn(`[${MODULE_ID}:game-log] token.restore-absolute-failed`, err);
    }
    return false;
  }
}

/**
 * Restore a token to a prior pose and truncate movement history.
 * Used when undoing a coalesced game-log movement entry (full drag, not one square).
 *
 * When history was cleared / replaced (turn change), falls back to absolute restore
 * from the stored prior — never slice a foreign history by historyLenBefore.
 */
export async function undoTokenMovementToPrior(token, prior, historyLenBefore = 0, options = {}) {
  const doc = token?.document;
  if (!doc || typeof doc.update !== "function") return false;
  const history = getRecordedMovementHistory(token);
  const forceAbsolute = options.absolute === true
    || !history.length
    || (options.movementId
      && !history.some((h) => h?.movementId === options.movementId));

  if (forceAbsolute) {
    return restoreTokenMovementAbsolute(token, prior);
  }

  const keepLen = Math.max(0, Math.min(Number(historyLenBefore) || 0, history.length));
  const kept = keepLen > 0 ? history.slice(0, keepLen) : [];
  // Prefer Foundry history pose at the truncate point — stored prior can disagree.
  const histPose = kept.length ? kept[kept.length - 1] : null;
  const restore = {
    x: Number(histPose?.x ?? prior?.x),
    y: Number(histPose?.y ?? prior?.y),
    elevation: Number(histPose?.elevation ?? prior?.elevation ?? doc.elevation ?? 0),
    width: histPose?.width ?? prior?.width ?? doc.width,
    height: histPose?.height ?? prior?.height ?? doc.height,
    depth: histPose?.depth ?? prior?.depth ?? doc.depth,
    shape: histPose?.shape ?? prior?.shape ?? doc.shape,
    level: histPose?.level ?? prior?.level ?? doc.level
  };
  if (!Number.isFinite(restore.x) || !Number.isFinite(restore.y)) return false;

  const before = { x: doc.x, y: doc.y, elev: doc.elevation, historyLen: history.length };
  const priorStored = prior
    ? { x: prior.x, y: prior.y, elev: prior.elevation ?? null }
    : null;
  const priorMismatch = Boolean(
    histPose
    && priorStored
    && (Number(priorStored.x) !== Number(restore.x) || Number(priorStored.y) !== Number(restore.y))
  );
  dbgMove("token.undo-to-prior", {
    before,
    priorStored,
    restore: { x: restore.x, y: restore.y, elev: restore.elevation },
    historyLenBefore,
    keepLen,
    priorMismatch,
    histPose: histPose
      ? { x: histPose.x, y: histPose.y, movementId: histPose.movementId ?? null }
      : null,
    historyTail: history.slice(-6).map((h, i) => ({
      i: history.length - 6 + i,
      x: h?.x,
      y: h?.y,
      cost: h?.cost,
      movementId: h?.movementId ?? null
    }))
  });
  const args = { result: {} };
  try { doc.object?.stopAnimation?.({ reset: false }); } catch { /* ignore */ }
  try {
    // Do not pass isUndo when truncating a live path: Foundry may rewind everything.
    // Bypass budget so the restore is not treated as a new spend.
    const updated = await doc.update({
      x: restore.x,
      y: restore.y,
      elevation: restore.elevation,
      width: restore.width,
      height: restore.height,
      depth: restore.depth,
      shape: restore.shape,
      level: restore.level,
      action: "walk",
      _movementHistory: kept
    }, {
      illusiveDndBypassMovementBudget: true,
      diff: false,
      pan: false,
      animate: false,
      _movementArguments: args
    });
    dbgMove("token.undo-to-prior-done", {
      ok: Boolean(updated),
      after: {
        x: doc.x,
        y: doc.y,
        elev: doc.elevation,
        historyLen: getRecordedMovementHistory(token).length
      }
    });
    return Boolean(updated);
  } catch (err) {
    if (isDebugLoggingEnabled()) {
      console.warn(`[${MODULE_ID}:game-log] token.undo-to-prior-failed`, err);
    }
    return false;
  }
}

/** Feet already spent this turn from Foundry movement history. */
export function getTokenMovementUsedFeet(token) {
  const history = getRecordedMovementHistory(token);
  return getMovementUsedFeet(token, history, gridDistanceForToken(token));
}

