import { MODULE_ID } from "../../../constants.mjs";
import { isIllusiveMobileMode } from "../../lib/mobile-client.mjs";
import { ensureMobileSheetStyles } from "./mobile-sheet-styles.mjs";
import { ensureDomRoot } from "../../lib/viewport.mjs";

const ROOT_ID = "illusive-dnd-mobile-nocanvas-bg";

function getEnabled() {
  try {
    return game.settings.get(MODULE_ID, "mobileBackgroundEnabled") !== false;
  } catch {
    return true;
  }
}

function getImagePath() {
  try {
    return String(game.settings.get(MODULE_ID, "mobileBackground") ?? "").trim();
  } catch {
    return "";
  }
}

export function destroyMobileBackground() {
  document.getElementById(ROOT_ID)?.remove();
}

export function renderMobileBackground() {
  ensureMobileSheetStyles();

  if (!isIllusiveMobileMode() || !getEnabled()) {
    destroyMobileBackground();
    return;
  }

  const iface = document.getElementById("interface");
  const root = ensureDomRoot(ROOT_ID, {
    html: `
      <div class="illusive-dnd-nocanvas-bg-image" aria-hidden="true"></div>
      <div class="illusive-dnd-nocanvas-bg-vignette" aria-hidden="true"></div>
    `,
    parent: iface?.parentNode ?? document.body,
    before: iface ?? document.body.firstChild
  });

  const img = root.querySelector(".illusive-dnd-nocanvas-bg-image");
  if (!img) return;

  const path = getImagePath();
  if (path) {
    const url = path.replaceAll('"', "%22");
    img.style.backgroundImage = `url("${url}")`;
    root.classList.add("has-image");
  } else {
    img.style.backgroundImage = "";
    root.classList.remove("has-image");
  }
}

export function bindMobileBackground() {
  renderMobileBackground();
  Hooks.on("changeSetting", (data) => {
    if (data?.namespace !== MODULE_ID) return;
    if (data.key === "mobileBackgroundEnabled" || data.key === "mobileBackground") {
      renderMobileBackground();
    }
  });
}
