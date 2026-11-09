/**
 * Phone controller: Foundry's right-sidebar tabs.
 * Swipe-style: pop the tab out as a real Foundry window. The docked #sidebar
 * has nothing to draw on a noCanvas phone.
 */

import { isIllusiveMobileMode } from "../../lib/mobile-client.mjs";
import { MOBILE_SHEET_STATE_HOOK } from "./mobile-sheet.mjs";

const OPEN_CLASS = "illusive-dnd-mobile-sidebar-open";
const CLOSE_ID = "illusive-dnd-mobile-sidebar-close";
const WINDOW_CLASS = "illusive-dnd-mobile-foundry-window";

let bound = false;

export function isMobileSidebarOpen() {
  return Boolean(document.body?.classList?.contains(OPEN_CLASS));
}

export function listFoundrySidebarTabs() {
  const tabs = ui.sidebar?.constructor?.TABS;
  if (!tabs) return [];

  const out = [];
  for (const [id, spec] of Object.entries(tabs)) {
    if (!spec || (spec.gmOnly && !game.user?.isGM)) continue;
    const app = ui[id];
    if (!app) continue;
    if (typeof app._canRender === "function" && app._canRender({ isFirstRender: true }) === false) continue;

    let icon = spec.icon;
    let label = spec.tooltip;
    if (spec.documentName) {
      const cls = globalThis.getDocumentClass?.(spec.documentName);
      label ??= cls?.metadata?.labelPlural;
      icon ??= CONFIG[spec.documentName]?.sidebarIcon;
    }
    if (label) {
      try { label = game.i18n.localize(label); } catch { /* keep key */ }
    }
    out.push({
      id,
      icon: icon || "fa-solid fa-folder",
      label: label || id
    });
  }
  return out;
}

export async function openMobileSidebarTab(tabId) {
  const app = ui[tabId];
  if (!app) return;
  document.body.classList.add(OPEN_CLASS);
  ensureCloseButton();
  let popped = null;
  try {
    popped = typeof app.renderPopout === "function"
      ? await app.renderPopout()
      : await app.render({ force: true });
  } catch {
    try { popped = await app.render({ force: true }); } catch { /* empty */ }
  }
  tagFoundryWindow(popped ?? app.popout ?? app);
}

export function closeMobileSidebar() {
  hideMobileFoundryWindows();
  document.body.classList.remove(OPEN_CLASS);
  document.getElementById(CLOSE_ID)?.remove();
  closeSidebarPopouts();
}

function hideMobileFoundryWindows() {
  document.querySelectorAll(`.${WINDOW_CLASS}, .application.sidebar-popout`).forEach((el) => {
    el.hidden = true;
    el.style.setProperty("display", "none", "important");
  });
}

function closeSidebarPopouts() {
  const instances = foundry.applications?.instances;
  if (instances) {
    for (const app of instances.values()) {
      const el = app.element;
      if (!el?.classList?.contains(WINDOW_CLASS) && !el?.classList?.contains("sidebar-popout")) continue;
      try { app.close({ animate: false }); } catch { /* ignore */ }
    }
    return;
  }
  const tabs = ui.sidebar?.constructor?.TABS ?? {};
  for (const id of Object.keys(tabs)) {
    const pop = ui[id]?.popout;
    if (pop?.rendered) {
      try { pop.close({ animate: false }); } catch { /* ignore */ }
    }
  }
}

function elementOf(app, element) {
  const raw = element ?? app?.element;
  return raw?.[0] ?? raw ?? null;
}

function isIllusiveDndChrome(node) {
  if (!node?.id && !node?.closest) return true;
  const id = node.id || "";
  if (id.startsWith("illusive-dnd-")) return true;
  return Boolean(node.closest?.("#illusive-dnd-mobile-sheet-root, #illusive-dnd-mobile-move, #illusive-dnd-mobile-carousel, #illusive-dnd-mobile-dice-roller"));
}

function tagFoundryWindow(app, element) {
  const node = elementOf(app, element);
  if (!node?.classList || isIllusiveDndChrome(node)) return;
  if (!node.classList.contains("sidebar-popout") && !node.id?.endsWith("-popout")) return;
  node.classList.add(WINDOW_CLASS);
}

function onFoundryWindowRender(app, element) {
  if (!isIllusiveMobileMode() || !isMobileSidebarOpen()) return;
  tagFoundryWindow(app, element);
}

function onFoundryWindowClose() {
  if (!isMobileSidebarOpen()) return;
  const stillOpen = [...document.querySelectorAll(`.${WINDOW_CLASS}, .application.sidebar-popout`)]
    .some((el) => !el.hidden && !el.classList.contains("minimizing"));
  if (!stillOpen) closeMobileSidebar();
}

function onWindowClosePointer(event) {
  if (!isIllusiveMobileMode() || !isMobileSidebarOpen()) return;
  const closeBtn = event.target?.closest?.('[data-action="close"]');
  if (!closeBtn) return;
  const win = closeBtn.closest(`.${WINDOW_CLASS}, .application.sidebar-popout`);
  if (!win) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  closeMobileSidebar();
}

function ensureCloseButton() {
  if (document.getElementById(CLOSE_ID)) return;
  const button = document.createElement("button");
  button.id = CLOSE_ID;
  button.type = "button";
  button.className = "illusive-dnd-mobile-sidebar-close";
  button.setAttribute("aria-label", game.i18n?.localize?.("Close") ?? "Close");
  button.innerHTML = "<i class=\"fa-solid fa-xmark\"></i>";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeMobileSidebar();
  });
  document.body.appendChild(button);
}

export function bindMobileSidebar() {
  if (bound) return;
  bound = true;
  document.addEventListener("pointerdown", onWindowClosePointer, true);
  Hooks.on("renderApplicationV2", onFoundryWindowRender);
  Hooks.on("renderApplication", onFoundryWindowRender);
  Hooks.on("closeApplicationV2", onFoundryWindowClose);
  Hooks.on("closeApplication", onFoundryWindowClose);
  Hooks.on(MOBILE_SHEET_STATE_HOOK, (state) => {
    if (state?.open) closeMobileSidebar();
  });
}
