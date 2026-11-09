/**
 * Early mobile boot — hide Foundry chrome before the sheet UI mounts.
 * Keep this free of settings imports so it can run at module evaluate time.
 */

const BOOT_KEY = "illusive-dnd-mobile-boot";
const BOOT_STYLE_ID = "illusive-dnd-mobile-boot-css";

function isNativeMobileHeuristic() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
    .test(navigator.userAgent ?? "");
}

/** CSS that must exist before Foundry paints sidebar/hotbar/etc. */
export const MOBILE_BOOT_CSS = `
html.illusive-dnd-mobile-boot,
html.illusive-dnd-mobile-boot body,
body.illusive-dnd-mobile-client {
  background: #121116 !important;
}
html.illusive-dnd-mobile-boot #board,
html.illusive-dnd-mobile-boot #ui-left,
html.illusive-dnd-mobile-boot #ui-right,
html.illusive-dnd-mobile-boot #ui-top,
html.illusive-dnd-mobile-boot #ui-bottom,
html.illusive-dnd-mobile-boot #sidebar,
html.illusive-dnd-mobile-boot #navigation,
html.illusive-dnd-mobile-boot #players,
html.illusive-dnd-mobile-boot #hotbar,
html.illusive-dnd-mobile-boot #fps,
html.illusive-dnd-mobile-boot #logo,
html.illusive-dnd-mobile-boot #pause,
html.illusive-dnd-mobile-boot #illusive-dnd-hud-overlay,
html.illusive-dnd-mobile-boot #illusive-dnd-action-bar-dock,
html.illusive-dnd-mobile-boot #illusive-dnd-party-status,
html.illusive-dnd-mobile-boot #illusive-dnd-turn-tracker,
html.illusive-dnd-mobile-boot #illusive-dnd-token-statuses,
html.illusive-dnd-mobile-boot .favbar,
html.illusive-dnd-mobile-boot #controls,
html.illusive-dnd-mobile-boot #scene-controls,
html.illusive-dnd-mobile-boot #camera-views,
body.illusive-dnd-mobile-client #board,
body.illusive-dnd-mobile-client #ui-left,
body.illusive-dnd-mobile-client #ui-right,
body.illusive-dnd-mobile-client #ui-top,
body.illusive-dnd-mobile-client #ui-bottom,
body.illusive-dnd-mobile-client #sidebar,
body.illusive-dnd-mobile-client #navigation,
body.illusive-dnd-mobile-client #players,
body.illusive-dnd-mobile-client #hotbar,
body.illusive-dnd-mobile-client #fps,
body.illusive-dnd-mobile-client #logo,
body.illusive-dnd-mobile-client #pause,
body.illusive-dnd-mobile-client #illusive-dnd-hud-overlay,
body.illusive-dnd-mobile-client #illusive-dnd-action-bar-dock,
body.illusive-dnd-mobile-client #illusive-dnd-party-status,
body.illusive-dnd-mobile-client #illusive-dnd-turn-tracker,
body.illusive-dnd-mobile-client #illusive-dnd-token-statuses,
body.illusive-dnd-mobile-client .favbar,
body.illusive-dnd-mobile-client #controls,
body.illusive-dnd-mobile-client #scene-controls,
body.illusive-dnd-mobile-client #camera-views {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}
html.illusive-dnd-mobile-boot #interface {
  background: #121116 !important;
}
`;

export function injectMobileBootCss() {
  let el = document.getElementById(BOOT_STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = BOOT_STYLE_ID;
    (document.head || document.documentElement).appendChild(el);
  }
  el.textContent = MOBILE_BOOT_CSS;
}

/**
 * Call as early as possible (module evaluate + start of init).
 * Sticky session flag keeps chrome hidden across the noCanvas reload.
 */
export function applyEarlyMobileBootClass() {
  injectMobileBootCss();

  let sticky = null;
  try { sticky = sessionStorage.getItem(BOOT_KEY); } catch { /* ignore */ }

  const phone = isNativeMobileHeuristic();
  if (!phone || sticky === "0") {
    document.documentElement.classList.remove("illusive-dnd-mobile-boot");
    document.body?.classList?.remove("illusive-dnd-mobile-client");
    try { sessionStorage.setItem(BOOT_KEY, "0"); } catch { /* ignore */ }
    return false;
  }

  document.documentElement.classList.add("illusive-dnd-mobile-boot");
  document.body?.classList?.add("illusive-dnd-mobile-client");
  try { sessionStorage.setItem(BOOT_KEY, "1"); } catch { /* ignore */ }
  return true;
}

/** Persist the resolved mode so the next paint/reload stays dark. */
export function persistMobileBootFlag(active) {
  try {
    sessionStorage.setItem(BOOT_KEY, active ? "1" : "0");
  } catch { /* ignore */ }
  document.documentElement.classList.toggle("illusive-dnd-mobile-boot", Boolean(active));
  document.body?.classList?.toggle("illusive-dnd-mobile-client", Boolean(active));
  if (active) injectMobileBootCss();
}
