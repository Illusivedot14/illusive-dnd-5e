const STYLE_ID = "illusive-dnd-tabletop-chrome";
const CLASS_NAME = "illusive-dnd-tabletop";

/** Foundry's own chrome. The map and the Illusive HUD stay up. */
const TABLETOP_CHROME_CSS = `
html.${CLASS_NAME} #ui-left,
html.${CLASS_NAME} #ui-right,
html.${CLASS_NAME} #ui-top,
html.${CLASS_NAME} #ui-bottom,
html.${CLASS_NAME} #sidebar,
html.${CLASS_NAME} #navigation,
html.${CLASS_NAME} #players,
html.${CLASS_NAME} #hotbar,
html.${CLASS_NAME} #fps,
html.${CLASS_NAME} #logo,
html.${CLASS_NAME} #pause,
html.${CLASS_NAME} #controls,
html.${CLASS_NAME} #scene-controls,
html.${CLASS_NAME} #camera-views,
html.${CLASS_NAME} #menu {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}
`;

function injectChromeCss() {
  if (typeof document === "undefined") return;
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    (document.head || document.documentElement).appendChild(el);
  }
  el.textContent = TABLETOP_CHROME_CSS;
}

/** True while this client is hiding Foundry's own interface. */
export function isTabletopChromeOn() {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains(CLASS_NAME)
    || Boolean(document.body?.classList.contains(CLASS_NAME));
}

/** Hide Foundry's interface on the tabletop client. */
export function setTabletopChrome(active) {
  if (typeof document === "undefined") return;
  injectChromeCss();
  document.documentElement.classList.toggle(CLASS_NAME, Boolean(active));
  document.body?.classList?.toggle(CLASS_NAME, Boolean(active));
}
