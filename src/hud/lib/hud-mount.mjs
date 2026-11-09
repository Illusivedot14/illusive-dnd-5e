/**
 * HUD overlay mount.
 *
 * The overlay is a zero-size, position:fixed wrapper attached directly to
 * <body>. Every HUD root inside it is also position:fixed, so:
 *   - fixed descendants anchor to the viewport (body has no transform), and
 *   - fixed elements are excluded from flex layout, so Foundry v13's flex HUD
 *     (ui-left / ui-middle / ui-right) is never pushed.
 *
 * It must NOT be mounted inside #board/#interface: those establish a
 * containing block (transform/filter) that breaks fixed positioning.
 */

const OVERLAY_HTML = `<div id="illusive-dnd-hud-overlay"></div>`;

export function getHudMountTarget() {
  return document.body;
}

export function ensureHudOverlay() {
  const parent = getHudMountTarget();
  let overlay = document.getElementById("illusive-dnd-hud-overlay");

  if (!overlay) {
    parent.insertAdjacentHTML("beforeend", OVERLAY_HTML);
    overlay = document.getElementById("illusive-dnd-hud-overlay");
  } else if (overlay.parentElement !== parent) {
    parent.appendChild(overlay);
  }

  return overlay;
}

export function cleanupLegacyHudMounts() {
  document.querySelector("#hotbar #illusive-dnd-action-bar-dock")?.remove();
  document.querySelector("#illusive-dnd-action-bar-dock #illusive-dnd-action-bar")?.remove();
  ensureHudOverlay();
  removeHudOverlayIfEmpty();
}

export function removeHudOverlayIfEmpty() {
  const overlay = document.getElementById("illusive-dnd-hud-overlay");
  if (overlay && !overlay.childElementCount) overlay.remove();
}

/**
 * Ensure a panel lives inside the overlay and return its root element.
 * `html` must contain an element carrying `id`. On first call it's inserted;
 * on later calls the existing node is reused, and re-attached if it was detached.
 *
 * @param {string} id
 * @param {string} html
 * @returns {HTMLElement | null}
 */
export function mountPanel(id, html) {
  const overlay = ensureHudOverlay();
  let el = document.getElementById(id);

  if (!el) {
    overlay.insertAdjacentHTML("beforeend", html);
    el = document.getElementById(id);
  } else if (!overlay.contains(el)) {
    overlay.appendChild(el);
  }

  return el;
}

/**
 * Remove a panel by id and drop the overlay if nothing else remains.
 * @param {string} id
 */
export function unmountPanel(id) {
  document.getElementById(id)?.remove();
  removeHudOverlayIfEmpty();
}

const DEFAULT_IMAGE_FALLBACK = "icons/svg/mystery-man.svg";
let imageFallbackBound = false;

/**
 * One delegated handler for broken HUD images. Image `error` events don't
 * bubble, so we listen in the capture phase. Any <img> inside the overlay that
 * fails falls back to its `data-fallback` (or mystery-man), guarded against loops.
 */
export function bindHudImageFallback() {
  if (imageFallbackBound) return;
  imageFallbackBound = true;

  document.addEventListener(
    "error",
    (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement)) return;
      if (!img.closest("#illusive-dnd-hud-overlay")) return;

      const fallback = img.dataset.fallback || DEFAULT_IMAGE_FALLBACK;
      if (img.src.endsWith(fallback)) return;
      img.src = fallback;
    },
    true
  );
}
