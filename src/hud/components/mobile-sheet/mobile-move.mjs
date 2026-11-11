import { isIllusiveMobileMode } from "../../lib/mobile-client.mjs";
import { shouldShowCameraPad } from "../camera-pad/camera-pad.mjs";
import { getViewedCombat } from "../../../foundry/combat.mjs";
import {
  buildIdleMovementData,
  buildMovementData,
  cycleMovementMode,
  listTokenMovementActions
} from "../../../application/action-economy.mjs";
import {
  actorHasMapToken,
  canUndoActorToken,
  findActorTokenDoc,
  STEP_DIRS,
  flipActorToken,
  stepActorToken,
  tokenViewFromDoc,
  undoActorToken
} from "../../../foundry/token-step.mjs";
import { illusiveDnd } from "../../../i18n/index.mjs";
import { getMobileFocusedActor } from "./mobile-focus.mjs";
import { getMobileSheetActor, isMobileSheetOpen, MOBILE_SHEET_STATE_HOOK } from "./mobile-sheet.mjs";
import { isMobileTargetPickActive } from "./mobile-target-pick.mjs";
import { openMobileAuraMenu, openMobileLightMenu } from "./mobile-controller-menus.mjs";
import {
  bindMobileSidebar,
  isMobileSidebarOpen,
  listFoundrySidebarTabs,
  openMobileSidebarTab
} from "./mobile-sidebar.mjs";
import { isTokenLightOn } from "../../../foundry/token-light.mjs";
import { isTokenAuraOn } from "../../../foundry/token-aura.mjs";
import { ensureMobileSheetStyles } from "./mobile-sheet-styles.mjs";
import { ensureDomRoot } from "../../lib/viewport.mjs";
import { movementSpeed } from "../../../domain/combat/actor-paths.mjs";

const ROOT_ID = "illusive-dnd-mobile-move";
const HOLD_MS = 0;

let bound = false;
let sidebarExpanded = false;
let stepping = false;
let holdTimer = null;
let holdAction = null;

function rootEl() {
  return document.getElementById(ROOT_ID);
}

function focusedActor() {
  return getMobileFocusedActor() ?? getMobileSheetActor();
}

function focusedToken() {
  return tokenViewFromDoc(findActorTokenDoc(focusedActor()));
}

function inCombat() {
  return Boolean(getViewedCombat()?.started);
}

function ensureRoot() {
  const existing = document.getElementById(ROOT_ID);
  if (existing && !existing.querySelector(".illusive-dnd-move-sidebar > [data-sidebar-toggle]:first-child")) existing.remove();
  return ensureDomRoot(ROOT_ID, {
    className: "illusive-dnd-mobile-move sidebar-collapsed",
    html: `
    <div class="illusive-dnd-move-utils">
      <div role="button" tabindex="0" class="illusive-dnd-move-util" data-move="light" aria-label="">
        <i class="fas fa-lightbulb" aria-hidden="true"></i>
      </div>
      <div role="button" tabindex="0" class="illusive-dnd-move-util" data-move="aura" aria-label="">
        <i class="fas fa-circle-dot" aria-hidden="true"></i>
      </div>
      <div role="button" tabindex="0" class="illusive-dnd-move-flip" data-move="flip" aria-label="">
        <i class="fas fa-left-right" aria-hidden="true"></i>
      </div>
    </div>
    <div class="illusive-dnd-move-sidebar" id="illusive-dnd-move-sidebar">
      <div role="button" tabindex="0" class="illusive-dnd-move-sidebar-toggle" data-sidebar-toggle="1">
        <i class="fas fa-chevron-down" aria-hidden="true"></i>
      </div>
      <div class="illusive-dnd-move-sidebar-tabs-clip">
        <div class="illusive-dnd-move-sidebar-tabs" id="illusive-dnd-move-sidebar-tabs"></div>
      </div>
    </div>
    <div class="illusive-dnd-move-panel">
      <div class="illusive-dnd-move-well">
      <div class="illusive-dnd-move-pad">
        <div role="button" tabindex="0" data-move="upLeft"><i class="fas fa-arrow-up" style="transform:rotate(-45deg)" aria-hidden="true"></i></div>
        <div role="button" tabindex="0" data-move="up"><i class="fas fa-arrow-up" aria-hidden="true"></i></div>
        <div role="button" tabindex="0" data-move="upRight"><i class="fas fa-arrow-up" style="transform:rotate(45deg)" aria-hidden="true"></i></div>
        <div role="button" tabindex="0" data-move="left"><i class="fas fa-arrow-left" aria-hidden="true"></i></div>
        <div role="button" tabindex="0" class="illusive-dnd-move-mode" data-move="mode"></div>
        <div role="button" tabindex="0" data-move="right"><i class="fas fa-arrow-right" aria-hidden="true"></i></div>
        <div role="button" tabindex="0" data-move="downLeft"><i class="fas fa-arrow-down" style="transform:rotate(45deg)" aria-hidden="true"></i></div>
        <div role="button" tabindex="0" data-move="down"><i class="fas fa-arrow-down" aria-hidden="true"></i></div>
        <div role="button" tabindex="0" data-move="downRight"><i class="fas fa-arrow-down" style="transform:rotate(-45deg)" aria-hidden="true"></i></div>
      </div>
      </div>
      <div class="illusive-dnd-move-meta">
        <span class="illusive-dnd-move-feet" data-move="feet" hidden></span>
        <div role="button" tabindex="0" class="illusive-dnd-move-undo" data-move="undo-one" hidden>
          <i class="fas fa-undo" aria-hidden="true"></i>
          <span></span>
        </div>
        <div role="button" tabindex="0" class="illusive-dnd-move-undo" data-move="undo-all" hidden>
          <i class="fas fa-rotate-left" aria-hidden="true"></i>
          <span></span>
        </div>
      </div>
    </div>
  `
  });
}

function controllerHidden() {
  return isMobileSheetOpen() || isMobileTargetPickActive() || isMobileSidebarOpen();
}

function applyMoveChrome(root, { showFeet = false, showUndo = false } = {}) {
  const hidden = controllerHidden();
  const hasToken = Boolean(focusedToken()) || actorHasMapToken(focusedActor());
  root.classList.toggle("is-hidden", hidden);
  root.classList.toggle("no-token", !hasToken);
  const panel = root.querySelector(".illusive-dnd-move-panel");
  if (panel) panel.hidden = hidden || !hasToken || shouldShowCameraPad();
  root.querySelectorAll(".illusive-dnd-move-utils").forEach((el) => {
    el.hidden = hidden || !hasToken;
  });
  const sidebar = root.querySelector(".illusive-dnd-move-sidebar");
  if (sidebar) sidebar.hidden = isMobileTargetPickActive() || isMobileSidebarOpen();
  applySidebarExpanded(root);

  root.querySelectorAll(".illusive-dnd-move-undo").forEach((el) => {
    el.hidden = !showUndo;
  });
  const feet = root.querySelector(".illusive-dnd-move-feet");
  if (feet) feet.hidden = !showFeet;
}

function actorMaxFeet(token, movement) {
  if (Number.isFinite(movement?.maxFeet) && movement.maxFeet > 0) return movement.maxFeet;
  return movementSpeed(token?.actor?.system?.attributes?.movement, "walk") || null;
}

function locSidebarToggle() {
  return sidebarExpanded
    ? (illusiveDnd.mobileMove("hideSidebar") ?? "Hide tabs")
    : (illusiveDnd.mobileMove("showSidebar") ?? "Show tabs");
}

function applySidebarExpanded(root) {
  root.classList.toggle("sidebar-collapsed", !sidebarExpanded);
  const toggle = root.querySelector("[data-sidebar-toggle]");
  if (!toggle) return;
  toggle.setAttribute("aria-expanded", sidebarExpanded ? "true" : "false");
  toggle.setAttribute("aria-label", locSidebarToggle());
  toggle.title = locSidebarToggle();
  if (!toggle.querySelector("i")) {
    toggle.innerHTML = `<i class="fas fa-chevron-down" aria-hidden="true"></i>`;
  }
}

function paintSidebarTabs(root) {
  const host = root.querySelector("#illusive-dnd-move-sidebar-tabs");
  if (!host) return;
  const tabs = listFoundrySidebarTabs();
  const key = tabs.map((tab) => `${tab.id}:${tab.icon}:${tab.label}`).join("|");
  if (key === host.dataset.tabKey) return;
  host.dataset.tabKey = key;
  host.replaceChildren();
  for (const tab of tabs) {
    const button = document.createElement("div");
    button.role = "button";
    button.tabIndex = 0;
    button.className = "illusive-dnd-move-sidebar-tab";
    button.dataset.sidebarTab = tab.id;
    button.title = tab.label;
    button.setAttribute("aria-label", tab.label);
    button.innerHTML = `<i class="${tab.icon}" aria-hidden="true"></i>`;
    host.appendChild(button);
  }
}

function leftoverFeet(token, movement) {
  const max = actorMaxFeet(token, movement);
  const used = Number(movement?.usedFeet) || 0;
  if (max != null) return { left: Math.max(0, max - used), max };
  if (Number.isFinite(movement?.remainingFeet)) {
    return { left: movement.remainingFeet, max: Number.isFinite(movement.maxFeet) ? movement.maxFeet : null };
  }
  return null;
}

function paintPad() {
  const root = rootEl();
  if (!root) return;

  const token = focusedToken();
  const combat = inCombat();
  let movement = null;
  let modes = [];
  try {
    movement = token
      ? (combat ? buildMovementData(token) : buildIdleMovementData(token))
      : null;
    modes = token ? listTokenMovementActions(token) : [];
  } catch {
    movement = null;
    modes = [];
  }
  const current = modes.find((m) => m.isActive)
    ?? modes.find((m) => m.id === (token?.document?.movementAction ?? movement?.mode))
    ?? modes[0];
  const leftover = leftoverFeet(token, movement);
  const moved = canUndoActorToken(focusedActor());
  const showUndo = Boolean(combat && moved);
  // Same readout as the table: remaining/max for the whole turn, including 30/30
  // before the first step. Undo stays hidden until a step exists.
  const showFeet = Boolean(combat && leftover);
  const padKey = [
    token?.document?.id ?? token?.id ?? "",
    combat ? 1 : 0,
    controllerHidden() ? 1 : 0,
    isMobileTargetPickActive() ? 1 : 0,
    isMobileSidebarOpen() ? 1 : 0,
    sidebarExpanded ? 1 : 0,
    showFeet ? 1 : 0,
    showUndo ? 1 : 0,
    leftover?.left ?? "",
    leftover?.max ?? "",
    current?.id ?? "",
    current?.label ?? "",
    token && isTokenLightOn(token) ? 1 : 0,
    token && isTokenAuraOn(token) ? 1 : 0
  ].join("|");
  if (root.dataset.padKey === padKey) return;
  root.dataset.padKey = padKey;

  root.classList.toggle("is-combat", combat);
  root.classList.toggle("has-token", Boolean(token));
  applyMoveChrome(root, { showFeet, showUndo });

  const modeBtn = root.querySelector("[data-move='mode']");
  if (modeBtn) {
    const label = current?.label || movement?.modeLabel || illusiveDnd.movement("mode");
    modeBtn.innerHTML = `<i class="fas ${current?.icon || "fa-person-walking"}" aria-hidden="true"></i><span>${label}</span>`;
    modeBtn.title = label;
    const modeOff = !token || modes.length < 2;
    modeBtn.classList.toggle("is-disabled", modeOff);
    modeBtn.setAttribute("aria-disabled", modeOff ? "true" : "false");
  }

  const feet = root.querySelector("[data-move='feet']");
  if (feet) {
    if (showFeet) {
      feet.textContent = leftover.max == null ? `${leftover.left} ft` : `${leftover.left}/${leftover.max} ft`;
    } else {
      feet.textContent = "";
    }
  }

  const undoOne = root.querySelector("[data-move='undo-one']");
  if (undoOne) {
    const label = illusiveDnd.mobileMove("undoOne");
    const caption = undoOne.querySelector("span");
    if (caption) caption.textContent = showUndo ? label : "";
    undoOne.setAttribute("aria-label", label);
  }
  const undoAll = root.querySelector("[data-move='undo-all']");
  if (undoAll) {
    const label = illusiveDnd.mobileMove("undoAll");
    const caption = undoAll.querySelector("span");
    if (caption) caption.textContent = showUndo ? label : "";
    undoAll.setAttribute("aria-label", label);
  }

  const flip = root.querySelector("[data-move='flip']");
  if (flip) flip.setAttribute("aria-label", illusiveDnd.actionBar("flipToken"));

  const light = root.querySelector("[data-move='light']");
  if (light) {
    light.setAttribute("aria-label", illusiveDnd.actionBar("toggleLight"));
    light.classList.toggle("is-on", Boolean(token && isTokenLightOn(token)));
  }
  const aura = root.querySelector("[data-move='aura']");
  if (aura) {
    aura.setAttribute("aria-label", illusiveDnd.actionBar("toggleAura"));
    aura.classList.toggle("is-on", Boolean(token && isTokenAuraOn(token)));
  }
  paintSidebarTabs(root);
  applySidebarExpanded(root);

  for (const [dir, key] of [
    ["up", "panUp"],
    ["down", "panDown"],
    ["left", "panLeft"],
    ["right", "panRight"],
    ["upLeft", "panUpLeft"],
    ["upRight", "panUpRight"],
    ["downLeft", "panDownLeft"],
    ["downRight", "panDownRight"]
  ]) {
    const btn = root.querySelector(`[data-move="${dir}"]`);
    if (!btn) continue;
    btn.classList.remove("is-disabled");
    btn.setAttribute("aria-label", illusiveDnd.mobileMove(key));
  }
}

async function onAction(action) {
  const actor = focusedActor();
  const token = focusedToken();
  if (!token) {
    ui.notifications?.warn?.(illusiveDnd.mobileMove("noToken"));
    return;
  }

  if (action === "mode") {
    if (rootEl()?.querySelector("[data-move='mode']")?.classList.contains("is-disabled")) return;
    await cycleMovementMode(token);
    paintPad();
    return;
  }

  if (action === "undo-one" || action === "undo-all") {
    if (!inCombat()) return;
    const result = await undoActorToken(actor, { all: action === "undo-all" });
    if (!result.ok) ui.notifications?.warn?.(illusiveDnd.actionBar("movementUndoEmpty"));
    paintPad();
    return;
  }

  if (action === "flip") {
    const result = await flipActorToken(actor);
    if (!result.ok && result.reason === "noToken") {
      ui.notifications?.warn?.(illusiveDnd.mobileMove("noToken"));
    } else if (!result.ok) {
      ui.notifications?.warn?.(illusiveDnd.warning("noOwner"));
    }
    return;
  }

  if (action === "light") {
    await openMobileLightMenu(token);
    paintPad();
    return;
  }
  if (action === "aura") {
    await openMobileAuraMenu(token);
    paintPad();
    return;
  }

  if (stepping) return;
  if (!STEP_DIRS.includes(action)) return;
  stepping = true;
  let stepped = false;
  try {
    const pending = stepActorToken(actor, action);
    paintPad();
    const result = await pending;
    stepped = Boolean(result.ok);
    if (!result.ok && result.reason === "noToken") {
      ui.notifications?.warn?.(illusiveDnd.mobileMove("noToken"));
    } else if (!result.ok && result.reason === "noOwner") {
      ui.notifications?.warn?.(illusiveDnd.warning("noOwner"));
    } else if (!result.ok) {
      ui.notifications?.warn?.(illusiveDnd.mobileMove("failed"));
      stopHold();
    }
  } finally {
    stepping = false;
    paintPad();
    if (stepped && holdAction === action) {
      holdTimer = setTimeout(() => {
        holdTimer = null;
        if (holdAction === action) void onAction(action);
      }, HOLD_MS);
    }
  }
}

function stopHold() {
  holdAction = null;
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
}

function startHold(action) {
  holdAction = action;
}

function setHeld(el, held) {
  if (!el) return;
  el.classList.toggle("is-held", held);
}

function keyFromEvent(event) {
  const root = rootEl();
  if (!root) return null;
  const button = event.target?.closest?.("[data-move]");
  if (!button || !root.contains(button) || button.classList.contains("is-disabled")) return null;
  return button;
}

function tabFromEvent(event) {
  const root = rootEl();
  if (!root) return null;
  const button = event.target?.closest?.("[data-sidebar-tab]");
  if (!button || !root.contains(button)) return null;
  return button;
}

function toggleFromEvent(event) {
  const root = rootEl();
  if (!root) return null;
  const button = event.target?.closest?.("[data-sidebar-toggle]");
  if (!button || !root.contains(button)) return null;
  return button;
}

function onPointerDown(event) {
  const toggle = toggleFromEvent(event);
  if (toggle) {
    event.preventDefault();
    event.stopPropagation();
    toggle.setPointerCapture?.(event.pointerId);
    setHeld(toggle, true);
    sidebarExpanded = !sidebarExpanded;
    applySidebarExpanded(rootEl());
    return;
  }
  const tabButton = tabFromEvent(event);
  if (tabButton) {
    event.preventDefault();
    event.stopPropagation();
    tabButton.setPointerCapture?.(event.pointerId);
    setHeld(tabButton, true);
    void openMobileSidebarTab(tabButton.dataset.sidebarTab);
    return;
  }
  const button = keyFromEvent(event);
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  try { button.setPointerCapture?.(event.pointerId); } catch { /* no active pointer */ }
  setHeld(button, true);
  const action = button.dataset.move;
  void onAction(action);
  if (STEP_DIRS.includes(action)) startHold(action);
}

function onPointerUp(event) {
  stopHold();
  const root = rootEl();
  root?.querySelectorAll(".is-held").forEach((el) => setHeld(el, false));
  if (keyFromEvent(event) || tabFromEvent(event) || toggleFromEvent(event)) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function shouldShowMove() {
  return isIllusiveMobileMode();
}

export function renderMobileMove() {
  document.getElementById("illusive-dnd-mobile-global-gear")?.remove();
  if (!shouldShowMove()) {
    rootEl()?.remove();
    return;
  }
  ensureMobileSheetStyles();
  ensureRoot();
  paintPad();
}

export function bindMobileMove() {
  if (bound) return;
  bound = true;
  bindMobileSidebar();
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointerup", onPointerUp, true);
  document.addEventListener("pointercancel", onPointerUp, true);
  Hooks.on("updateToken", (doc) => {
    if (!isIllusiveMobileMode()) return;
    const token = focusedToken();
    const focusedId = token?.document?.id ?? token?.id ?? null;
    if (focusedId && doc?.id && doc.id !== focusedId) return;
    renderMobileMove();
  });
  Hooks.on("createToken", () => {
    if (isIllusiveMobileMode()) renderMobileMove();
  });
  Hooks.on("deleteToken", () => {
    if (isIllusiveMobileMode()) renderMobileMove();
  });
  Hooks.on("updateCombat", () => {
    if (isIllusiveMobileMode()) renderMobileMove();
  });
  Hooks.on("createCombat", () => {
    if (isIllusiveMobileMode()) renderMobileMove();
  });
  Hooks.on("deleteCombat", () => {
    if (isIllusiveMobileMode()) renderMobileMove();
  });
  Hooks.on("combatStart", () => {
    if (isIllusiveMobileMode()) renderMobileMove();
  });
  Hooks.on(MOBILE_SHEET_STATE_HOOK, () => {
    if (isIllusiveMobileMode()) renderMobileMove();
  });
  Hooks.on("canvasReady", () => {
    if (isIllusiveMobileMode()) renderMobileMove();
  });
  Hooks.on("updateScene", () => {
    if (isIllusiveMobileMode()) renderMobileMove();
  });
  Hooks.on("renderSidebar", () => {
    if (isIllusiveMobileMode()) renderMobileMove();
  });
  if (globalThis.game?.ready) renderMobileMove();
}
