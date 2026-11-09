import { registerHudPanel } from "./registry.mjs";
import { partyStatusPanel } from "../../components/party-status/party-status.mjs";
import { actionBarPanel } from "../../components/action-bar/action-bar.mjs";
import { turnTrackerPanel } from "../../components/turn-tracker/turn-tracker.mjs";
import { cameraPadPanel } from "../../components/camera-pad/camera-pad.mjs";

let registered = false;

/** Register the built-in HUD panels. Registration order defines paint order. */
export function registerHudPanels() {
  if (registered) return;
  registered = true;

  registerHudPanel(partyStatusPanel);
  registerHudPanel(actionBarPanel);
  registerHudPanel(turnTrackerPanel);
  registerHudPanel(cameraPadPanel);
}
