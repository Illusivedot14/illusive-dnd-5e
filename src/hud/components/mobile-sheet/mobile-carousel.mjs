/**
 * Illusive mobile character carousel.
 * Center-snapped avatar is the focused character (glow + dice speaker).
 * Sheet switches only after scroll settles (or on an intentional tap).
 */

import { MODULE_ID } from "../../../constants.mjs";
import { changeTouches } from "../../../foundry/document-change.mjs";
import { resolvePortraitSrc } from "../../../foundry/actor-data.mjs";
import { getMobileSheetActors, isIllusiveMobileMode } from "../../lib/mobile-client.mjs";
import {
  closeMobileSheet,
  getMobileSheetActor,
  isMobileSheetOpen,
  openMobileSheet,
  MOBILE_SHEET_STATE_HOOK
} from "./mobile-sheet.mjs";
import { ensureMobileSheetStyles } from "./mobile-sheet-styles.mjs";
import { bindMobileBackground, renderMobileBackground } from "./mobile-background.mjs";
import { bindMobileDiceRoller, renderMobileDiceRoller } from "./mobile-dice-roller.mjs";
import { bindMobileMove, renderMobileMove } from "./mobile-move.mjs";
import { getMobileFocusedActorId, setMobileFocusedActorId } from "./mobile-focus.mjs";
import { ensureDomRoot } from "../../lib/viewport.mjs";

const ROOT_ID = "illusive-dnd-mobile-carousel";
const SCROLL_SETTLE_MS = 220;
const TAP_DEBOUNCE_MS = 350;
const DRAG_THRESHOLD_PX = 10;

let bound = false;
let lastTap = 0;
let scrollTimer = null;
let scrolling = false;
let programmaticScroll = false;
let pointerStart = null;
let dragged = false;
let switchingSheet = false;
let settleToken = 0;

function rootEl() {
  return document.getElementById(ROOT_ID);
}

function ensureRoot() {
  return ensureDomRoot(ROOT_ID, {
    className: "illusive-dnd-mobile-carousel",
    html: `<div class="illusive-dnd-mobile-carousel-track" role="list"></div>`
  });
}

function trackEl() {
  return rootEl()?.querySelector(".illusive-dnd-mobile-carousel-track") ?? null;
}

function actorImg(actor) {
  return resolvePortraitSrc(actor);
}

function escapeAttr(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

function centerAvatarInTrack(track, btn, { behavior = "auto" } = {}) {
  if (!track || !btn) return;
  const trackRect = track.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  const delta = (btnRect.left + btnRect.width / 2) - (trackRect.left + track.clientWidth / 2);
  const next = Math.max(0, track.scrollLeft + delta);
  programmaticScroll = true;
  if (typeof track.scrollTo === "function") {
    track.scrollTo({ left: next, behavior });
  } else {
    track.scrollLeft = next;
  }
  window.setTimeout(() => {
    programmaticScroll = false;
  }, behavior === "smooth" ? 320 : 40);
}

function getCenteredAvatarBtn(track) {
  if (!track) return null;
  const centerX = track.getBoundingClientRect().left + track.clientWidth / 2;
  let best = null;
  let bestDist = Infinity;
  for (const btn of track.querySelectorAll(".illusive-dnd-carousel-avatar")) {
    const r = btn.getBoundingClientRect();
    const mid = r.left + r.width / 2;
    const d = Math.abs(mid - centerX);
    if (d < bestDist) {
      bestDist = d;
      best = btn;
    }
  }
  return best;
}

function applyFocusClasses(track, focusedId, openId) {
  if (!track) return;
  for (const btn of track.querySelectorAll(".illusive-dnd-carousel-avatar")) {
    const id = btn.dataset.actorId;
    const focused = id === focusedId;
    const sheetOpen = Boolean(openId) && id === openId;
    btn.classList.toggle("is-focused", focused);
    btn.classList.toggle("is-selected", sheetOpen);
    btn.setAttribute("aria-pressed", sheetOpen ? "true" : "false");
  }
}

function refreshFocusClasses() {
  applyFocusClasses(
    trackEl(),
    getMobileFocusedActorId(),
    getMobileSheetActor()?.id ?? null
  );
}

/**
 * After scroll settles (or on tap): focus centered avatar and open their sheet.
 */
async function settleOnCentered({ openSheet = true, snap = true } = {}) {
  const token = ++settleToken;
  const track = trackEl();
  if (!track) return;

  const centered = getCenteredAvatarBtn(track);
  const actorId = centered?.dataset?.actorId ?? null;
  if (!actorId) return;

  const actor = game.actors.get(actorId);
  if (!actor) return;

  setMobileFocusedActorId(actorId);
  renderMobileMove();
  if (snap) centerAvatarInTrack(track, centered, { behavior: "smooth" });
  refreshFocusClasses();

  if (!openSheet || switchingSheet) return;
  if (token !== settleToken) return;

  const openId = getMobileSheetActor()?.id ?? null;
  if (isMobileSheetOpen() && openId === actorId) {
    refreshFocusClasses();
    return;
  }

  switchingSheet = true;
  try {
    await openMobileSheet(actor);
  } finally {
    switchingSheet = false;
    if (token === settleToken) refreshFocusClasses();
  }
}

export function renderMobileCarousel() {
  ensureMobileSheetStyles();
  if (!isIllusiveMobileMode()) {
    rootEl()?.remove();
    return;
  }

  const root = ensureRoot();
  const track = root.querySelector(".illusive-dnd-mobile-carousel-track");
  if (!track) return;

  const actors = getMobileSheetActors();
  const open = isMobileSheetOpen();
  const openId = getMobileSheetActor()?.id ?? null;

  if (!getMobileFocusedActorId() || !actors.some((a) => a.id === getMobileFocusedActorId())) {
    setMobileFocusedActorId(openId ?? actors[0]?.id ?? null);
  }
  const focusedId = getMobileFocusedActorId();

  root.classList.toggle("is-open", open);
  root.hidden = actors.length === 0;

  // Preserve scroll position across re-renders when possible
  const prevScroll = track.scrollLeft;

  track.innerHTML = actors.map((actor) => {
    const focused = actor.id === focusedId;
    const sheetOpen = open && actor.id === openId;
    return `
      <button type="button"
        class="illusive-dnd-carousel-avatar${focused ? " is-focused" : ""}${sheetOpen ? " is-selected" : ""}"
        data-actor-id="${actor.id}"
        title="${escapeAttr(actor.name)}"
        role="listitem"
        aria-pressed="${sheetOpen ? "true" : "false"}">
        <img src="${escapeAttr(actorImg(actor))}" alt="" draggable="false" />
        <span class="illusive-dnd-carousel-close" aria-hidden="true"><i class="fa-solid fa-xmark"></i></span>
      </button>`;
  }).join("");

  const focusBtn = track.querySelector(
    `.illusive-dnd-carousel-avatar[data-actor-id="${focusedId}"]`
  ) ?? track.querySelector(".illusive-dnd-carousel-avatar");

  requestAnimationFrame(() => {
    if (prevScroll > 0) track.scrollLeft = prevScroll;
    centerAvatarInTrack(track, focusBtn, { behavior: "auto" });
  });
  renderMobileMove();
}

async function onAvatarActivate(actorId) {
  const actor = game.actors.get(actorId);
  if (!actor) return;

  const track = trackEl();
  const btn = track?.querySelector(`.illusive-dnd-carousel-avatar[data-actor-id="${actorId}"]`);

  setMobileFocusedActorId(actorId);
  renderMobileMove();
  if (btn) centerAvatarInTrack(track, btn, { behavior: "smooth" });
  refreshFocusClasses();

  // Tap open actor again → close
  if (isMobileSheetOpen() && getMobileSheetActor()?.id === actorId) {
    await closeMobileSheet();
    refreshFocusClasses();
    renderMobileMove();
    return;
  }

  if (switchingSheet) return;
  switchingSheet = true;
  try {
    await openMobileSheet(actor);
  } finally {
    switchingSheet = false;
    refreshFocusClasses();
  }
}

function onPointerDown(event) {
  if (!isIllusiveMobileMode()) return;
  const btn = event.target?.closest?.(".illusive-dnd-carousel-avatar");
  if (!btn || !rootEl()?.contains(btn)) return;
  pointerStart = { x: event.clientX ?? 0, y: event.clientY ?? 0 };
  dragged = false;
}

function onPointerMove(event) {
  if (!pointerStart) return;
  const dx = Math.abs((event.clientX ?? 0) - pointerStart.x);
  const dy = Math.abs((event.clientY ?? 0) - pointerStart.y);
  if (dx > DRAG_THRESHOLD_PX || dy > DRAG_THRESHOLD_PX) dragged = true;
}

function onCarouselPointerUp(event) {
  if (!isIllusiveMobileMode()) return;
  const btn = event.target?.closest?.(".illusive-dnd-carousel-avatar");
  const start = pointerStart;
  const wasDrag = dragged;
  pointerStart = null;
  dragged = false;

  if (!btn || !rootEl()?.contains(btn) || !start) return;
  if (wasDrag || scrolling || programmaticScroll) return;

  const now = Date.now();
  if (now - lastTap < TAP_DEBOUNCE_MS) return;
  lastTap = now;

  event.preventDefault();
  event.stopPropagation();

  const actorId = btn.dataset.actorId;
  if (actorId) void onAvatarActivate(actorId);
}

function onTrackScroll() {
  if (programmaticScroll) return;
  scrolling = true;
  if (scrollTimer) clearTimeout(scrollTimer);
  scrollTimer = window.setTimeout(() => {
    scrollTimer = null;
    scrolling = false;
    void settleOnCentered({ openSheet: true, snap: true });
  }, SCROLL_SETTLE_MS);
}

export function bindMobileCarousel() {
  if (bound) return;
  bound = true;

  document.body.addEventListener("pointerdown", onPointerDown, true);
  document.body.addEventListener("pointermove", onPointerMove, true);
  document.body.addEventListener("pointerup", onCarouselPointerUp, true);

  document.body.addEventListener("scroll", (event) => {
    if (!event.target?.classList?.contains?.("illusive-dnd-mobile-carousel-track")) return;
    onTrackScroll();
  }, true);

  // Prefer native scrollend when available (fewer wrong settles)
  document.body.addEventListener("scrollend", (event) => {
    if (!event.target?.classList?.contains?.("illusive-dnd-mobile-carousel-track")) return;
    if (programmaticScroll) return;
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = null;
    scrolling = false;
    void settleOnCentered({ openSheet: true, snap: true });
  }, true);

  Hooks.on(MOBILE_SHEET_STATE_HOOK, () => {
    if (isIllusiveMobileMode()) renderMobileCarousel();
  });
  Hooks.on("updateActor", (_actor, changes) => {
    if (!isIllusiveMobileMode()) return;
    const portrait = !changes
      || changeTouches(changes, "name")
      || changeTouches(changes, "img")
      || changeTouches(changes, "prototypeToken")
      || changeTouches(changes, "ownership");
    if (portrait) renderMobileCarousel();
  });
  Hooks.on("createActor", () => {
    if (isIllusiveMobileMode()) renderMobileCarousel();
  });
  Hooks.on("deleteActor", () => {
    if (isIllusiveMobileMode()) renderMobileCarousel();
  });
  Hooks.on("canvasReady", () => {
    if (isIllusiveMobileMode()) renderMobileCarousel();
  });
  Hooks.on("updateToken", (_doc, changes) => {
    if (!isIllusiveMobileMode()) return;
    const portrait = !changes
      || changeTouches(changes, "name")
      || changeTouches(changes, "texture")
      || changeTouches(changes, "actorId")
      || changeTouches(changes, "delta");
    if (portrait) renderMobileCarousel();
  });
  Hooks.on("createToken", () => {
    if (isIllusiveMobileMode()) renderMobileCarousel();
  });
  Hooks.on("deleteToken", () => {
    if (isIllusiveMobileMode()) renderMobileCarousel();
  });

  if (isIllusiveMobileMode()) renderMobileCarousel();
}

export async function bootMobileClientUi() {
  if (!isIllusiveMobileMode()) return;

  ensureMobileSheetStyles();
  bindMobileBackground();
  renderMobileBackground();
  bindMobileDiceRoller();
  renderMobileDiceRoller();
  bindMobileMove();
  renderMobileMove();
  document.getElementById("illusive-dnd-mobile-global-gear")?.remove();
  bindMobileCarousel();
  renderMobileCarousel();

  const actors = getMobileSheetActors();
  if (!actors.length) {
    ui.notifications?.warn?.(
      game.i18n?.localize?.(`${MODULE_ID}.mobile.noActors`)
      ?? "No owned characters available for the Illusive mobile sheet."
    );
    return;
  }

  if (!getMobileFocusedActorId()) setMobileFocusedActorId(actors[0].id);

  if (!isMobileSheetOpen()) {
    await openMobileSheet(actors[0]);
  }
}
