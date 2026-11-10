import { setTabletopChrome } from "./chrome.mjs";
import {
  acceptRemoteView,
  guardTabletopCamera,
  holdCurrentTabletopView,
  onTabletopCanvasPan,
  readTabletopView,
  recenterTabletop
} from "./lock.mjs";
import { noteTabletopReport, requestTabletopView } from "./pilot.mjs";
import { isTabletopClient, isTabletopPilot, userIsPilot, userIsTabletop } from "./roles.mjs";
import { bindTabletopSocket, emitTabletop, senderOf } from "./socket.mjs";

function publishTabletopView() {
  emitTabletop({ action: "report", ...readTabletopView() });
}

export function handleTabletopMessage(data) {
  const sender = senderOf(data);
  if (isTabletopClient()) {
    if (!userIsPilot(sender)) return;
    if (data.action === "request") {
      publishTabletopView();
      return;
    }
    if (data.action === "recenter") {
      recenterTabletop();
      publishTabletopView();
      return;
    }
    if (data.action === "set") {
      if (data.sceneId && canvas?.scene?.id && data.sceneId !== canvas.scene.id) return;
      acceptRemoteView(data);
    }
    return;
  }

  if (isTabletopPilot() && data.action === "report" && userIsTabletop(sender)) {
    noteTabletopReport(data);
  }
}

/** Apply the current Display choices: lock the table user, or release them. */
export function syncTabletopClient() {
  const table = isTabletopClient();
  setTabletopChrome(table);
  if (table) {
    guardTabletopCamera();
    holdCurrentTabletopView();
    publishTabletopView();
    return;
  }
  if (isTabletopPilot()) requestTabletopView();
}

/** Lock the chosen tabletop user and let the chosen camera user drive that view. */
export function bindTabletop() {
  const connect = () => bindTabletopSocket(handleTabletopMessage);
  connect();
  Hooks.on("ready", connect);

  Hooks.on("ready", () => syncTabletopClient());

  Hooks.on("canvasReady", () => {
    if (!isTabletopClient()) return;
    setTabletopChrome(true);
    guardTabletopCamera();
    holdCurrentTabletopView();
    publishTabletopView();
  });

  Hooks.on("canvasPan", (_canvas, position) => {
    onTabletopCanvasPan(position);
  });

  if (globalThis.game?.ready && isTabletopPilot()) requestTabletopView();
}
