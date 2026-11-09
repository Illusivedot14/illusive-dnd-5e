import { MODULE_PATH, illusiveDndRenderTemplate } from "../../../constants.mjs";
import { buildTokenStatusData } from "../../../foundry/effect-data.mjs";
import { getActionBarToken } from "../../../application/reaction-context.mjs";
import { settingOn } from "../../lib/hud-settings.mjs";
import { desktopHudEnabled } from "../../lib/mobile-client.mjs";
import { ensureHudOverlay } from "../../lib/hud-mount.mjs";
import { publishTurnTrackerBounds } from "../turn-tracker/turn-tracker-position.mjs";
import { bindStatusContextMenu } from "./status-context.mjs";
import { bindStatusTooltips, unpinStatusTooltip } from "./status-tooltip.mjs";

function applyStatusPanelStyles(panel) {
  panel.dataset.expiringStyle = "pulse";
  panel.classList.add("illusive-dnd-status-disposition-on");
  panel.style.setProperty("--illusive-dnd-status-buff-border", "#5cb85c");
  panel.style.setProperty("--illusive-dnd-status-debuff-border", "#d9534f");
}

export function ensureTokenStatusContainer() {
  const overlay = ensureHudOverlay();
  let panel = document.getElementById("illusive-dnd-token-statuses");

  if (!panel) {
    panel = document.createElement("div");
    panel.id = "illusive-dnd-token-statuses";
    panel.hidden = true;
  }

  panel.dataset.placement = "topRight";
  panel.classList.remove("illusive-dnd-placement-action-bar");
  panel.classList.add("illusive-dnd-placement-top-right");

  if (panel.parentElement !== overlay) overlay.appendChild(panel);

  return panel;
}

export function positionTokenStatuses() {
  const panel = document.getElementById("illusive-dnd-token-statuses");
  if (!panel || panel.hidden) return;

  panel.style.removeProperty("left");
  panel.style.removeProperty("bottom");
}

export async function renderTokenStatuses() {
  const panel = ensureTokenStatusContainer();
  if (!panel) return;

  if (!settingOn("enableTokenStatuses") || !desktopHudEnabled()) {
    panel.innerHTML = "";
    panel.hidden = true;
    return;
  }

  const token = getActionBarToken();
  if (!token?.actor) {
    panel.innerHTML = "";
    panel.hidden = true;
    return;
  }

  const statuses = await buildTokenStatusData(token);
  unpinStatusTooltip();
  applyStatusPanelStyles(panel);
  panel.innerHTML = statuses.length
    ? await illusiveDndRenderTemplate(`${MODULE_PATH}/src/hud/components/token-statuses/token-statuses.hbs`, { statuses })
    : "";
  panel.hidden = !statuses.length;
  publishTurnTrackerBounds();
  positionTokenStatuses();
}

export function bindTokenStatusInteractions() {
  bindStatusContextMenu();
  bindStatusTooltips();
}
