import { MODULE_ID, MODULE_PATH, illusiveDndRenderTemplate } from "../../../constants.mjs";
import { actorFields, changePaths } from "../../../foundry/document-change.mjs";
import { formatMod, getHpBarData } from "../../../foundry/actor-stats.mjs";
import { primarySpeed } from "../../../domain/combat/actor-paths.mjs";
import { isIllusiveMobileMode } from "../../lib/mobile-client.mjs";
import { buildMobileSheetContext } from "./mobile-sheet-data.mjs";
import { handleMobileSheetAction, MOBILE_SHEET_NO_REFRESH } from "./mobile-sheet-actions.mjs";
import { ensureMobileSheetStyles } from "./mobile-sheet-styles.mjs";
import { setMobileFocusedActorId } from "./mobile-focus.mjs";
import { ensureDomRoot, setImportant } from "../../lib/viewport.mjs";

const ROOT_ID = "illusive-dnd-mobile-sheet-root";
const TEMPLATE = `${MODULE_PATH}/src/hud/components/mobile-sheet/mobile-sheet.hbs`;
const STATE_HOOK = `${MODULE_ID}.mobileSheetState`;

let openActorId = null;
let currentTab = "abilities";
let bound = false;
let refreshQueued = false;
let pendingRefresh = false;
let actionBusy = false;
let actionBusyTimer = null;
let lastActionKey = "";
let lastActionAt = 0;
let pointerMoved = false;
let pointerStartY = 0;
/** @type {Map<string, number>} `${actorId}:${tab}` → scrollTop */
const tabScrollPositions = new Map();
/** Horizontal section-nav scrollLeft, keyed by actor id (do not snap on tab change). */
const navScrollPositions = new Map();
let publishedSheetKey = "";
let bodyRefreshQueued = false;

const SHEET_HEADER_FIELDS = new Set(["inspiration", "hp", "ac", "movement", "init", "prof", "identity"]);
const SHEET_BODY_FIELDS = new Set(["abilities", "skills", "resources", "spells", "currency"]);

function rootEl() {
  return document.getElementById(ROOT_ID);
}

function ensureRoot() {
  return ensureDomRoot(ROOT_ID);
}

function publishSheetState() {
  const open = Boolean(openActorId);
  document.body.classList.toggle("illusive-dnd-mobile-sheet-open", open);
  document.body.classList.toggle("illusive-dnd-mobile-client", isIllusiveMobileMode());
  const key = `${open}:${openActorId ?? ""}`;
  if (key === publishedSheetKey) return;
  publishedSheetKey = key;
  Hooks.callAll(STATE_HOOK, { open, actorId: openActorId });
}

function applyInspirationMark(on) {
  const root = rootEl();
  if (!root) return;
  root.querySelector(".avatar-container")?.classList.toggle("has-inspiration", on);
  const box = root.querySelector("[data-action='toggle-inspiration']");
  if (!box) return;
  box.classList.toggle("is-on", on);
  box.setAttribute("aria-pressed", on ? "true" : "false");
}

function setStat(selector, value) {
  const node = rootEl()?.querySelector(selector);
  if (!node) return false;
  node.textContent = value;
  return true;
}

/** Header numbers and the inspiration star. Returns false when the header shape itself changed. */
function patchSheetHeader(actor, fields) {
  const root = rootEl();
  if (!root) return false;

  if (fields.has("inspiration")) {
    applyInspirationMark(Boolean(actor.system?.attributes?.inspiration));
  }
  if (fields.has("ac")) {
    if (!setStat(".ac-box .stat-value", String(actor.system?.attributes?.ac?.value ?? "—"))) return false;
  }
  if (fields.has("movement")) {
    const speed = primarySpeed(actor.system?.attributes?.movement);
    if (!setStat(".speed-box .stat-value", String(speed))) return false;
  }
  if (fields.has("init")) {
    const init = actor.system?.attributes?.init?.total
      ?? actor.system?.attributes?.init?.mod
      ?? actor.system?.attributes?.initiative?.mod;
    if (!setStat(".init-box .stat-value", formatMod(init))) return false;
  }
  if (fields.has("prof")) {
    if (!setStat(".prof-box .stat-value", formatMod(actor.system?.attributes?.prof))) return false;
  }
  if (fields.has("identity")) {
    const name = root.querySelector(".char-name");
    if (name && actor.name) name.textContent = actor.name;
    const img = root.querySelector(".header-avatar");
    if (img && actor.img) img.src = actor.img;
  }
  if (fields.has("hp")) {
    const hp = getHpBarData(actor);
    if ((hp.value ?? 0) <= 0 && (hp.max ?? 0) > 0) return false;
    if (!setStat(".hp-current", String(hp.value ?? 0))) return false;
    const effectiveMax = Math.max(0, (hp.max ?? 0) + (Number(actor.system?.attributes?.hp?.tempmax) || 0));
    if (!setStat(".hp-max", String(effectiveMax))) return false;
    const fill = root.querySelector(".hp-bar-fill");
    if (fill) {
      const percent = effectiveMax > 0 ? Math.max(0, Math.min(100, Math.round(((hp.value ?? 0) / effectiveMax) * 100))) : 0;
      fill.style.flexBasis = `${percent}%`;
    }
    const temp = root.querySelector(".hp-temp");
    if (hp.temp) {
      if (!temp) return false;
      temp.textContent = `+${hp.temp}`;
    } else if (temp) {
      temp.remove();
    }
  }
  return true;
}

function patchItemRow(item, changes) {
  const paths = changePaths(changes);
  if (!paths.length) return false;
  const equip = paths.every((path) => path === "system.equipped" || path.startsWith("system.equipped."));
  const prepared = paths.every((path) => path.startsWith("system.preparation"));
  if (!equip && !prepared) return false;
  const action = equip ? "toggle-equipped" : "toggle-prepared";
  const button = rootEl()?.querySelector(`[data-action="${action}"][data-item-id="${item.id}"]`);
  if (!button) return false;
  const on = equip
    ? Boolean(item.system?.equipped)
    : Boolean(item.system?.preparation?.prepared);
  button.classList.toggle("equipped", on);
  button.title = equip ? (on ? "Unequip" : "Equip") : (on ? "Unprepare" : "Prepare");
  return true;
}

function hideForeignMobileSheets() {
  document.querySelectorAll(
    ".mobile-sheet-drawer:not(.illusive-dnd-illusive-mobile-sheet), .application.mobile-character-sheet, .mobile-character-sheet:not(.illusive-dnd-illusive-mobile-sheet)"
  ).forEach((el) => {
    setImportant(el, { display: "none" });
    el.setAttribute("data-illusive-dnd-sheet-hidden", "1");
  });
}

function restoreForeignMobileSheets() {
  document.querySelectorAll("[data-illusive-dnd-sheet-hidden]").forEach((el) => {
    el.style.removeProperty("display");
    el.removeAttribute("data-illusive-dnd-sheet-hidden");
  });
}

export function isMobileSheetOpen() {
  return Boolean(openActorId);
}

export function getMobileSheetActor() {
  return openActorId ? game.actors.get(openActorId) : null;
}

export async function closeMobileSheet() {
  captureTabScroll();
  openActorId = null;
  restoreForeignMobileSheets();
  const root = rootEl();
  if (root) root.innerHTML = "";
  publishSheetState();
}

function scrollSectionEl() {
  return rootEl()?.querySelector(".sheet-section") ?? null;
}

function tabScrollKey(actorId = openActorId, tab = currentTab) {
  if (!actorId || !tab) return null;
  return `${actorId}:${tab}`;
}

function captureTabScroll(tab = currentTab) {
  const el = scrollSectionEl();
  const key = tabScrollKey(openActorId, tab);
  if (!el || !key) return;
  tabScrollPositions.set(key, el.scrollTop || 0);
}

function restoreTabScroll(tab = currentTab) {
  const el = scrollSectionEl();
  const key = tabScrollKey(openActorId, tab);
  if (!el || !key) return;
  const y = tabScrollPositions.get(key) ?? 0;
  el.scrollTop = y;
}

function bindSectionScrollCapture() {
  const el = scrollSectionEl();
  if (!el || el.dataset.illusiveDndScrollBound === "1") return;
  el.dataset.illusiveDndScrollBound = "1";
  el.addEventListener(
    "scroll",
    () => {
      const key = tabScrollKey(openActorId, currentTab);
      if (!key) return;
      tabScrollPositions.set(key, el.scrollTop || 0);
    },
    { passive: true }
  );
}

function restoreTabScrollSoon(tab = currentTab) {
  restoreTabScroll(tab);
  requestAnimationFrame(() => {
    restoreTabScroll(tab);
    requestAnimationFrame(() => restoreTabScroll(tab));
  });
  setTimeout(() => restoreTabScroll(tab), 50);
  setTimeout(() => restoreTabScroll(tab), 180);
}

function captureNavScroll() {
  const track = rootEl()?.querySelector(".section-nav-track");
  if (!track || !openActorId) return;
  navScrollPositions.set(openActorId, track.scrollLeft || 0);
}

function restoreNavScroll() {
  const track = rootEl()?.querySelector(".section-nav-track");
  if (!track || !openActorId) return;
  if (!navScrollPositions.has(openActorId)) return;
  track.scrollLeft = navScrollPositions.get(openActorId) || 0;
}

/** Safari-safe copy of element.dataset. */
function readDataset(el) {
  const out = {};
  if (!el?.dataset) return out;
  for (const key of Object.keys(el.dataset)) {
    out[key] = el.dataset[key];
  }
  return out;
}

function clearBusy() {
  actionBusy = false;
  if (actionBusyTimer) {
    clearTimeout(actionBusyTimer);
    actionBusyTimer = null;
  }
  if (pendingRefresh) {
    pendingRefresh = false;
    queueRefresh();
  }
}

function markBusy() {
  actionBusy = true;
  if (actionBusyTimer) clearTimeout(actionBusyTimer);
  actionBusyTimer = setTimeout(() => {
    actionBusy = false;
    actionBusyTimer = null;
    if (pendingRefresh) {
      pendingRefresh = false;
      queueRefresh();
    }
  }, 10000);
}

async function renderSheet({ capture = true } = {}) {
  ensureMobileSheetStyles();
  if (capture) captureTabScroll();
  captureNavScroll();

  const actor = getMobileSheetActor();
  const root = ensureRoot();
  if (!actor || !openActorId) {
    root.innerHTML = "";
    publishSheetState();
    return;
  }

  hideForeignMobileSheets();
  if (!openActorId) openActorId = actor.id;

  const context = buildMobileSheetContext(actor, { tab: currentTab });
  root.innerHTML = await illusiveDndRenderTemplate(TEMPLATE, context);
  publishSheetState();
  bindSectionScrollCapture();

  // Restore after layout so the section has a real scroll height
  restoreTabScrollSoon();
  // Keep tab bar where the user left it — never scrollIntoView / snap
  restoreNavScroll();
  requestAnimationFrame(() => restoreNavScroll());
}

function queueRefresh() {
  if (!openActorId || refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => {
    refreshQueued = false;
    void renderSheet();
  });
}

/** Replace the open tab only. The header, the tab bar, and the carousel stay. */
function queueBodyRefresh() {
  if (!openActorId || bodyRefreshQueued || refreshQueued) return;
  bodyRefreshQueued = true;
  requestAnimationFrame(() => {
    bodyRefreshQueued = false;
    void renderSheetBody();
  });
}

async function renderSheetBody() {
  const actor = getMobileSheetActor();
  const root = rootEl();
  const current = root?.querySelector(".sections-container");
  if (!actor || !root || !current) {
    await renderSheet();
    return;
  }

  captureTabScroll();
  const context = buildMobileSheetContext(actor, { tab: currentTab });
  const html = await illusiveDndRenderTemplate(TEMPLATE, context);
  const holder = document.createElement("template");
  holder.innerHTML = html.trim();
  const fresh = holder.content.querySelector(".sections-container");
  if (!fresh) {
    await renderSheet();
    return;
  }
  current.replaceWith(fresh);
  bindSectionScrollCapture();
  restoreTabScrollSoon();
}

async function dispatchSheetAction(actionEl, event) {
  const action = actionEl.dataset?.action;
  if (!action) return;

  const key = [
    action,
    actionEl.dataset.tab || "",
    actionEl.dataset.ability || "",
    actionEl.dataset.skill || "",
    actionEl.dataset.itemId || "",
    actionEl.dataset.effectId || "",
    actionEl.dataset.type || "",
    actionEl.dataset.index || ""
  ].join("|");
  const now = Date.now();
  if (key === lastActionKey && now - lastActionAt < 450) return;
  lastActionKey = key;
  lastActionAt = now;

  if (actionBusy) return;

  if (action === "close") {
    await closeMobileSheet();
    return;
  }

  if (action === "tab") {
    const nextTab = actionEl.dataset.tab || "abilities";
    if (nextTab === currentTab) return;
    captureTabScroll(currentTab);
    captureNavScroll();
    currentTab = nextTab;
    await renderSheet({ capture: false });
    return;
  }

  const actor = getMobileSheetActor();
  if (!actor) return;

  markBusy();
  actionEl.classList.add("is-pressed");
  try {
    const dataset = readDataset(actionEl);
    const changed = await handleMobileSheetAction(actor, action, dataset, event);
    if (changed && !MOBILE_SHEET_NO_REFRESH.has(action)) queueRefresh();
    if (changed && (action === "use-item" || action === "inspect-item")) setTimeout(() => queueRefresh(), 400);
  } catch (err) {
    console.error(`${MODULE_ID} | mobile sheet action failed`, action, err);
  } finally {
    actionEl.classList.remove("is-pressed");
    clearBusy();
  }
}

function actionElFromEvent(event) {
  const root = rootEl();
  if (!root || !openActorId) return null;
  const actionEl = event.target?.closest?.("[data-action]");
  if (!actionEl || !root.contains(actionEl)) return null;
  if (actionEl.disabled) return null;
  return actionEl;
}

function onPointerDown(event) {
  if (!openActorId) return;
  if (event.target?.closest?.("#illusive-dnd-mobile-carousel")) return;
  pointerMoved = false;
  pointerStartY = event.clientY ?? 0;
}

function onPointerMove(event) {
  if (!openActorId || pointerMoved) return;
  if (Math.abs((event.clientY ?? 0) - pointerStartY) > 12) pointerMoved = true;
}

function onSheetPointerUp(event) {
  if (!openActorId || pointerMoved) return;
  if (document.body.classList.contains("illusive-dnd-mobile-roller-open")) return;
  if (event.pointerType === "mouse" && event.button != null && event.button !== 0) return;
  if (event.target?.closest?.("#illusive-dnd-mobile-carousel")) return;
  if (event.target?.closest?.("#illusive-dnd-mobile-dice-roller")) return;
  if (event.target?.closest?.("#illusive-dnd-mobile-move")) return;
  if (event.target?.closest?.(".illusive-dnd-ms-overlay")) return;
  const actionEl = actionElFromEvent(event);
  if (!actionEl) return;
  event.preventDefault();
  event.stopPropagation();
  void dispatchSheetAction(actionEl, event);
}

function onDocumentUpdate(doc, changes) {
  if (!openActorId) return;
  const actor = getMobileSheetActor();
  if (!actor) return;

  const relevant = doc === actor || doc?.parent === actor || doc?.actor === actor;
  if (!relevant) return;
  if (doc !== actor) {
    if (patchItemRow(doc, changes)) return;
    queueBodyRefresh();
    return;
  }

  const fields = actorFields(changes);
  const headerOnly = [...fields].every((field) => SHEET_HEADER_FIELDS.has(field));
  const headerOrBody = [...fields].every((field) => SHEET_HEADER_FIELDS.has(field) || SHEET_BODY_FIELDS.has(field));
  if (headerOnly) {
    if (patchSheetHeader(actor, fields)) return;
  } else if (!fields.has("unknown") && !fields.has("death") && !fields.has("flags") && headerOrBody) {
    patchSheetHeader(actor, fields);
    queueBodyRefresh();
    return;
  } else if (fields.size === 1 && fields.has("flags")) {
    return;
  }

  // Death saves (and other system rolls) update the actor while actionBusy is true —
  // defer refresh so success/failure pips still light up.
  if (actionBusy) {
    pendingRefresh = true;
    return;
  }
  queueRefresh();
}

export async function openMobileSheet(actor, { tab } = {}) {
  if (!actor) return false;
  // Roller greys the sheet out — still allow open/switch so carousel stays authoritative
  ensureMobileSheetStyles();
  openActorId = actor.id;
  setMobileFocusedActorId(actor.id);
  if (tab) currentTab = tab;
  await renderSheet();
  return true;
}

export function preferIllusiveMobileSheet() {
  return isIllusiveMobileMode();
}

export function bindMobileSheet() {
  if (bound) return;
  bound = true;

  ensureMobileSheetStyles();

  document.body.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
  document.body.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
  document.body.addEventListener("pointerup", onSheetPointerUp, true);

  Hooks.on("updateActor", onDocumentUpdate);
  Hooks.on("updateItem", onDocumentUpdate);
  Hooks.on("createItem", onDocumentUpdate);
  Hooks.on("deleteItem", onDocumentUpdate);
  Hooks.on("updateActiveEffect", onDocumentUpdate);
  Hooks.on("createActiveEffect", onDocumentUpdate);
  Hooks.on("deleteActiveEffect", onDocumentUpdate);

  Hooks.on(`close${MODULE_ID}MobileSheet`, closeMobileSheet);
}

export { TEMPLATE as MOBILE_SHEET_TEMPLATE, STATE_HOOK as MOBILE_SHEET_STATE_HOOK };
