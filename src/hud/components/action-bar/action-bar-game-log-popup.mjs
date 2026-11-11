/**
 * Combat game-log popup — this token’s actions for the current turn (LIFO).
 * GM undo undoes that entry and everything after it on the central stack.
 */

import { MODULE_PATH, illusiveDndRenderTemplate } from "../../../constants.mjs";
import { illusiveDnd } from "../../../i18n/index.mjs";
import { refreshHud } from "../../lib/render/core.mjs";
import { ILLUSIVE_DND_RENDER } from "../../lib/render/scopes.mjs";
import { getActionBarToken, releaseDialogLock } from "../../../application/reaction-context.mjs";
import { getActiveCombatant, getViewedCombat } from "../../../foundry/combat.mjs";
import {
  getGameLogView,
  undoGameLogFromEntry
} from "../../../application/combat-game-log.mjs";
import { debugLog, DEBUG_CHANNELS } from "../../../foundry/debug.mjs";

const GAME_LOG_ICONS = Object.freeze({
  action: "fa-sword",
  bonus: "fa-plus",
  reaction: "fa-bolt",
  legendary: "fa-crown",
  lair: "fa-dungeon",
  free: "fa-asterisk",
  standard: "fa-person-running",
  movement: "fa-person-walking",
  skip: "fa-forward"
});

let openDialog = null;

function isGm() {
  return Boolean(game.user?.isGM);
}

function resolvePopupFilter(options = {}) {
  if (options.scope === "all") {
    return { scope: "all" };
  }
  const combat = getViewedCombat();
  const token = getActionBarToken();
  const combatant = getActiveCombatant(combat);
  const tokenUuid = token?.document?.uuid ?? token?.uuid ?? null;
  const actorUuid = token?.actor?.uuid
    ?? combatant?.actor?.uuid
    ?? null;
  return {
    scope: "token-turn",
    tokenUuid,
    actorUuid,
    combatantId: combatant?.id ?? null
  };
}

async function confirmUndo(label) {
  const DialogV2 = foundry.applications.api.DialogV2;
  try {
    return Boolean(await DialogV2.confirm({
      window: { title: illusiveDnd.actionBar("gameLogUndoTitle") },
      content: `<p>${illusiveDnd.actionBar("gameLogUndoConfirm", { label })}</p>`,
      modal: false,
      rejectClose: false
    }));
  } finally {
    releaseDialogLock();
  }
}

async function handleUndo(entryId, label, dialog) {
  if (!isGm()) {
    ui.notifications.warn(illusiveDnd.actionBar("gameLogGmOnly"));
    return;
  }
  if (!(await confirmUndo(label))) return;

  debugLog(DEBUG_CHANNELS.GAME_LOG, "popup.undo-click", { entryId, label });

  const result = await undoGameLogFromEntry(entryId);
  debugLog(DEBUG_CHANNELS.GAME_LOG, "popup.undo-result", result);
  if (!result.ok && result.reason === "missing") {
    ui.notifications.warn(illusiveDnd.actionBar("gameLogUndoEmpty"));
  }
  refreshHud(ILLUSIVE_DND_RENDER.ACTION_BAR);
  dialog?.close?.();
}

function bindPopupClicks(dialog, entries) {
  const root = dialog?.element;
  if (!root) return;
  root.addEventListener("click", async (event) => {
    const btn = event.target.closest?.("[data-game-log-undo]");
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    const entryId = btn.dataset.gameLogUndo;
    const entry = entries.find((e) => e.id === entryId);
    await handleUndo(entryId, entry?.label ?? entryId, dialog);
  });
}

/**
 * Open the combat game log as a Foundry popup.
 * @param {{ scope?: "token-turn"|"all" }} [options]
 *   `all` = master log for the whole encounter; default = this token’s current turn.
 */
export async function openGameLogPopup(options = {}) {
  const master = options.scope === "all";
  const filter = resolvePopupFilter(options);
  const view = getGameLogView(filter);
  if (!view.enabled) {
    ui.notifications.warn(illusiveDnd.actionBar("gameLogCombatOnly"));
    return null;
  }

  if (openDialog) {
    try {
      await openDialog.close();
    } catch {
      /* ignore */
    }
    openDialog = null;
  }

  const gm = isGm();
  const entries = (view.entries ?? []).map((e) => ({
    ...e,
    icon: GAME_LOG_ICONS[e.kind] ?? "fa-scroll",
    canUndo: gm && e.canUndo
  }));

  const content = await illusiveDndRenderTemplate(
    `${MODULE_PATH}/src/hud/components/action-bar/action-bar-game-log-popup.hbs`,
    {
      hint: master
        ? (gm ? illusiveDnd.actionBar("gameLogMasterHintGm") : illusiveDnd.actionBar("gameLogMasterHint"))
        : (gm ? illusiveDnd.actionBar("gameLogPopupHintGm") : illusiveDnd.actionBar("gameLogPopupHint")),
      emptyLabel: master ? illusiveDnd.actionBar("gameLogEmpty") : illusiveDnd.actionBar("gameLogEmptyTurn"),
      undoLabel: illusiveDnd.actionBar("gameLogUndo"),
      empty: entries.length === 0,
      entries
    }
  );

  const dialog = new foundry.applications.api.DialogV2({
    window: {
      title: master ? illusiveDnd.actionBar("gameLogMaster") : illusiveDnd.actionBar("gameLog"),
      icon: "fas fa-scroll"
    },
    content,
    modal: false,
    position: { width: master ? 480 : 420 },
    buttons: [
      {
        action: "close",
        icon: "fas fa-times",
        label: illusiveDnd.actionBar("gameLogClose"),
        default: true
      }
    ],
    close: () => {
      if (openDialog === dialog) openDialog = null;
      releaseDialogLock();
    }
  });

  openDialog = dialog;
  await dialog.render(true);
  bindPopupClicks(dialog, entries);
  return dialog;
}
