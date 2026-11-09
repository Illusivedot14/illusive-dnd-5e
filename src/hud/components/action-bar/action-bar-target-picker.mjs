import { illusiveDnd } from "../../../i18n/index.mjs";
import { refreshHud } from "../../lib/render/core.mjs";
import { ILLUSIVE_DND_RENDER } from "../../lib/render/scopes.mjs";
import { dismissFloatingHudChrome } from "../../lib/overlay-guard.mjs";
import { clearUserTargets } from "../../../foundry/token-actions.mjs";

export { getRequiredTargetCount } from "../../../application/ability.mjs";

/** @typedef {{
 *  tokenId: string,
 *  actorId: string,
 *  itemId: string,
 *  activityId: string,
 *  section: string,
 *  spellLevel: number|null,
 *  isStandard: boolean,
 *  actionId: string|null,
 *  required: number,
 *  abilityName: string
 * }} TargetPickState */

/** @type {TargetPickState|null} */
let pickState = null;
let canvasHookBound = false;
/** @type {Map<object, Function>} */
const patchedClickLeft = new Map();
let handledClickAt = 0;

export function getTargetPickState() {
  return pickState;
}

export function isTargetPickActive() {
  return Boolean(pickState);
}

export function getSelectedTargetCount() {
  return game.user?.targets?.size ?? 0;
}

export function buildTargetPickView() {
  if (!pickState) return null;
  const selected = getSelectedTargetCount();
  const required = pickState.required;
  return {
    active: true,
    abilityName: pickState.abilityName,
    selected,
    required,
    label: illusiveDnd.actionBar("targetPickProgress", { selected, required }),
    canConfirm: required > 1 ? selected >= 1 && selected <= required : selected === required,
    confirmLabel: illusiveDnd.actionBar("targetPickConfirm"),
    cancelLabel: illusiveDnd.actionBar("targetPickCancel")
  };
}

function refresh() {
  refreshHud(ILLUSIVE_DND_RENDER.ACTION_BAR);
}

export async function startTargetPick(state) {
  pickState = { ...state, required: Math.max(1, Number(state.required) || 1) };
  dismissFloatingHudChrome();
  clearUserTargets();
  releaseForeignControlledTokens(pickState.tokenId);
  ensureCastingControlled();
  bindCanvasTargeting();
  document.body.classList.add("illusive-dnd-target-picking");
  ui.notifications.info(illusiveDnd.actionBar(pickState.required > 1 ? "targetPickHintMany" : "targetPickHint", {
    name: pickState.abilityName,
    count: pickState.required
  }), { localize: false });
  refresh();
  return true;
}

/**
 * Leave target-pick mode. Always tears down hooks/body class so Cancel still
 * works after a warn/error left UI half-active.
 */
export function cancelTargetPick({ clearTargets = true } = {}) {
  const wasPicking = Boolean(pickState)
    || document.body.classList.contains("illusive-dnd-target-picking")
    || canvasHookBound;
  pickState = null;
  if (clearTargets) clearUserTargets();
  unbindCanvasTargeting();
  document.body.classList.remove("illusive-dnd-target-picking");
  if (wasPicking) refresh();
  return wasPicking;
}

/**
 * Snapshot a valid confirm payload without leaving pick mode.
 * Call {@link cancelTargetPick} only after the ability use succeeds.
 * @returns {TargetPickState|null}
 */
export function confirmTargetPick() {
  if (!pickState) return null;
  const selected = getSelectedTargetCount();
  const required = pickState.required;
  const enough = required > 1 ? selected >= 1 && selected <= required : selected === required;
  if (!enough) {
    ui.notifications.warn(illusiveDnd.actionBar("targetPickExact", { count: required }));
    return null;
  }
  return { ...pickState };
}

function releaseForeignControlledTokens(keepTokenId) {
  for (const token of [...(canvas.tokens?.controlled ?? [])]) {
    if (token.id !== keepTokenId) token.release?.();
  }
}

function ensureCastingControlled() {
  if (!pickState) return;
  const casting = canvas.tokens?.get(pickState.tokenId);
  if (!casting || casting.controlled) return;
  casting.control?.({ releaseOthers: true });
}

function toggleTokenTarget(token) {
  if (!pickState || !token) return;

  handledClickAt = Date.now();
  const isTargeted = Boolean(token.isTargeted ?? game.user.targets?.has(token));
  if (isTargeted) {
    token.setTarget(false, { releaseOthers: false, user: game.user });
    ensureCastingControlled();
    refresh();
    return;
  }

  if (getSelectedTargetCount() >= pickState.required) {
    ui.notifications.warn(illusiveDnd.actionBar("targetPickExact", { count: pickState.required }));
    ensureCastingControlled();
    return;
  }

  token.setTarget(true, { releaseOthers: false, user: game.user });
  ensureCastingControlled();
  refresh();
}

function makeClickLeftWrapper(original) {
  return function onTokenClickLeft(event) {
    if (!pickState) return original?.call(this, event);

    // Mark/unmark only — skip Foundry's select/control path.
    toggleTokenTarget(this);
    // Returning false tells MouseInteractionManager the click is fully handled.
    return false;
  };
}

function collectTokenClasses() {
  const classes = new Set();
  const add = (Cls) => {
    if (Cls?.prototype && typeof Cls.prototype._onClickLeft === "function") classes.add(Cls);
  };

  add(CONFIG.Token?.objectClass);
  add(canvas?.tokens?.objectClass);
  add(globalThis.Token);
  for (const token of canvas.tokens?.placeables ?? []) {
    add(token.constructor);
  }
  return [...classes];
}

function patchTokenClickLeft() {
  for (const TokenClass of collectTokenClasses()) {
    if (patchedClickLeft.has(TokenClass)) continue;
    const original = TokenClass.prototype._onClickLeft;
    patchedClickLeft.set(TokenClass, original);
    TokenClass.prototype._onClickLeft = makeClickLeftWrapper(original);
  }
}

function unpatchTokenClickLeft() {
  for (const [TokenClass, original] of patchedClickLeft) {
    if (TokenClass?.prototype) TokenClass.prototype._onClickLeft = original;
  }
  patchedClickLeft.clear();
}

function clientToCanvas(clientX, clientY) {
  if (typeof canvas?.canvasCoordinatesFromClient === "function") {
    return canvas.canvasCoordinatesFromClient({ x: clientX, y: clientY });
  }

  const view = getBoardElement();
  if (!view || !canvas?.stage) return null;

  const rect = view.getBoundingClientRect?.() ?? { left: 0, top: 0 };
  const local = {
    x: clientX - rect.left,
    y: clientY - rect.top
  };
  try {
    return canvas.stage.toLocal?.(local) ?? local;
  } catch {
    return local;
  }
}

function tokenContainsPoint(token, point) {
  if (!token || !point) return false;
  if (typeof token.bounds?.contains === "function" && token.bounds.contains(point.x, point.y)) {
    return true;
  }

  const center = token.center ?? {
    x: token.x + ((token.w ?? 0) / 2),
    y: token.y + ((token.h ?? 0) / 2)
  };
  const radius = Math.max(token.w ?? 0, token.h ?? 0) * 0.55;
  const dx = center.x - point.x;
  const dy = center.y - point.y;
  return ((dx * dx) + (dy * dy)) <= (radius * radius);
}

function getTokenAtClient(clientX, clientY) {
  const point = clientToCanvas(clientX, clientY);
  if (!point) return null;

  const hover = canvas.tokens?.hover;
  if (hover?.visible && !hover.document?.hidden && tokenContainsPoint(hover, point)) {
    return hover;
  }

  // Top-most first.
  const placeables = [...(canvas.tokens?.placeables ?? [])].reverse();
  for (const token of placeables) {
    if (!token.visible || token.document?.hidden) continue;
    if (tokenContainsPoint(token, point)) return token;
  }
  return null;
}

function isHudChromeEvent(event) {
  const el = event.target;
  if (!(el instanceof Element)) return false;
  return Boolean(
    el.closest(
      "#illusive-dnd-hud-overlay, #illusive-dnd-action-bar-dock, #illusive-dnd-action-bar, #illusive-dnd-party-status, #illusive-dnd-turn-tracker, #illusive-dnd-portrait-hp-menu, .illusive-dnd-status-context-menu, .illusive-dnd-util-dropdown, .app, .application, #interface .window-app"
    )
  );
}

function isOverBoard(event) {
  const board = document.getElementById("board")
    ?? document.querySelector("canvas#board")
    ?? getBoardElement();
  if (!board || !(event.target instanceof Element)) return false;
  return board === event.target || board.contains(event.target);
}

/**
 * Capture-phase primary path. Non-owned tokens never get Foundry clickLeft
 * (no control permission), so canvas deselection would cancel pick mode.
 * Intercept token hits before PIXI/Foundry; leave empty-canvas pans alone.
 */
function onDocumentPointerDownCapture(event) {
  if (!pickState || event.button !== 0) return;
  if (isHudChromeEvent(event)) return;
  if (!isOverBoard(event)) return;

  const token = getTokenAtClient(event.clientX, event.clientY);
  if (!token) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  toggleTokenTarget(token);
}

function onTargetToken() {
  if (!pickState) return;
  const required = pickState.required;
  const targets = [...(game.user?.targets ?? [])];
  if (targets.length > required) {
    for (const extra of targets.slice(required)) {
      extra.setTarget(false, { releaseOthers: false, user: game.user });
    }
    ui.notifications.warn(illusiveDnd.actionBar("targetPickExact", { count: required }));
  }
  refresh();
}

function onControlToken(token, controlled) {
  if (!pickState || !token) return;

  // Keep the casting token selected for the whole pick session (Esc/Cancel exit).
  if (!controlled && token.id === pickState.tokenId) {
    queueMicrotask(() => {
      if (!pickState) return;
      ensureCastingControlled();
    });
    return;
  }

  if (!controlled) return;
  if (token.id === pickState.tokenId) return;
  queueMicrotask(() => {
    if (!pickState) return;
    token.release?.();
    ensureCastingControlled();
  });
}

function getBoardElement() {
  return canvas?.app?.view
    ?? canvas?.app?.canvas
    ?? document.getElementById("board")
    ?? document.querySelector("canvas#board")
    ?? null;
}

function onTargetPickKeydown(event) {
  if (event.key !== "Escape") return;
  if (!pickState) return;
  event.preventDefault();
  event.stopPropagation();
  cancelTargetPick();
}

function bindCanvasTargeting() {
  if (canvasHookBound) return;

  patchTokenClickLeft();
  Hooks.on("targetToken", onTargetToken);
  Hooks.on("controlToken", onControlToken);
  window.addEventListener("keydown", onTargetPickKeydown, true);
  // Window capture runs before the canvas PIXI listeners, so non-owned
  // token clicks still reach us and do not clear the casting selection.
  window.addEventListener("pointerdown", onDocumentPointerDownCapture, true);

  canvasHookBound = true;
}

function unbindCanvasTargeting() {
  if (!canvasHookBound) return;

  unpatchTokenClickLeft();
  Hooks.off("targetToken", onTargetToken);
  Hooks.off("controlToken", onControlToken);
  window.removeEventListener("keydown", onTargetPickKeydown, true);
  window.removeEventListener("pointerdown", onDocumentPointerDownCapture, true);

  canvasHookBound = false;
  handledClickAt = 0;
}

export function shouldRefreshActionBarForTargets() {
  return Boolean(pickState);
}

/**
 * While picking targets, keep other tokens from stealing selection.
 * Casting-token deselection is restored (use Esc/Cancel to exit pick mode).
 * @returns {boolean} true if the controlToken event was consumed by pick mode
 */
export function handleControlTokenDuringTargetPick(token, controlled) {
  if (!pickState || !token) return false;

  if (!controlled && token.id === pickState.tokenId) {
    queueMicrotask(() => {
      if (pickState) ensureCastingControlled();
    });
    return true;
  }

  if (!controlled) return false;

  if (token.id !== pickState.tokenId) {
    queueMicrotask(() => {
      if (!pickState) return;
      token.release?.();
      ensureCastingControlled();
    });
  }
  return true;
}
