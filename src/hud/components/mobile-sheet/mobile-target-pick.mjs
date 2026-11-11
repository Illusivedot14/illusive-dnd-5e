/**
 * Phone target pick. No map, so this is a range list.
 * Tap marks via Foundry targeting so the table sees it. Confirm fires the activity through dnd5e.
 */

import { illusiveDnd } from "../../../i18n/index.mjs";
import { viewedScene } from "../../../foundry/token-step.mjs";
import { closeMobileSheet, openMobileSheet } from "./mobile-sheet.mjs";
import { ensureMobileSheetStyles } from "./mobile-sheet-styles.mjs";
import { loadCombatUse } from "../../../foundry/combat-runtime.mjs";

const OVERLAY_ID = "illusive-dnd-mobile-target-pick";
const OVERLAY_Z = "100070";

/** @type {null | {
 *  actorId: string,
 *  tokenId: string,
 *  itemId: string,
 *  activityId: string,
 *  section: string,
 *  spellLevel: number|null,
 *  required: number,
 *  abilityName: string,
 *  selected: Set<string>
 * }} */
let pick = null;

export function isMobileTargetPickActive() {
  return Boolean(pick);
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function broadcastTargetIds(ids) {
  const user = game.user;
  if (!user) return;
  if (typeof user.updateTokenTargets === "function") {
    try {
      user.updateTokenTargets([...ids]);
    } catch {
      /* no canvas on this client */
    }
  }
  if (typeof user.broadcastActivity === "function") {
    user.broadcastActivity({ targets: [...ids] });
  }
}

function overlayEl() {
  return document.getElementById(OVERLAY_ID);
}

function canConfirm() {
  if (!pick) return false;
  const n = pick.selected.size;
  return pick.required > 1 ? n >= 1 && n <= pick.required : n === pick.required;
}

function paintOverlay(rows) {
  const root = overlayEl();
  if (!root || !pick) return;
  const selected = pick.selected;
  const list = root.querySelector(".illusive-dnd-ms-target-list");
  if (list) {
    list.innerHTML = rows.map((row) => `
      <button type="button" class="illusive-dnd-ms-target-row${selected.has(row.id) ? " is-marked" : ""}" data-token-id="${escapeHtml(row.id)}">
        <img src="${escapeHtml(row.img)}" alt="">
        <span class="illusive-dnd-ms-target-name">${escapeHtml(row.name)}</span>
        <small>${row.feet} ft</small>
      </button>
    `).join("");
  }
  const hint = root.querySelector(".illusive-dnd-ms-target-hint");
  if (hint) {
    hint.textContent = illusiveDnd.actionBar(
      pick.required > 1 ? "targetPickHintMany" : "targetPickHint",
      { name: pick.abilityName, count: pick.required }
    );
  }
  const progress = root.querySelector(".illusive-dnd-ms-target-progress");
  if (progress) {
    progress.textContent = illusiveDnd.actionBar("targetPickProgress", {
      selected: selected.size,
      required: pick.required
    });
  }
  const confirm = root.querySelector("[data-action='confirm']");
  if (confirm) confirm.disabled = !canConfirm();
}

function closeOverlay() {
  overlayEl()?.remove();
}

function finishPick() {
  pick = null;
  closeOverlay();
  document.body.classList.remove("illusive-dnd-mobile-target-picking");
}

/**
 * Close the sheet, pick people in range, fire, open the sheet again.
 * @returns {Promise<boolean>}
 */
export async function startMobileTargetUse({
  actor,
  token,
  item,
  activity,
  section,
  event = null,
  spellLevel = null
}) {
  if (!actor || !item) return false;
  const {
    requiresCanvasTargets,
    listTargetsInRange,
    tokenId,
    getRequiredTargetCount,
    useActivityFromHud
  } = await loadCombatUse();
  if (!requiresCanvasTargets(item, activity)) return false;
  if (!token?.document && !token?.id) {
    ui.notifications.warn(illusiveDnd.mobileMove("noToken"));
    return false;
  }

  const casterDoc = token?.document ?? token;
  const scene = viewedScene();
  const rows = listTargetsInRange(casterDoc, item, activity, scene);
  if (!rows.length) {
    ui.notifications.warn(illusiveDnd.mobileMove("noTargetsInRange"));
    return false;
  }

  const required = getRequiredTargetCount(item, activity, actor) ?? 1;
  pick = {
    actorId: actor.id,
    tokenId: token?.id ?? tokenId(casterDoc),
    itemId: item.id,
    activityId: activity?.id ?? "",
    section,
    spellLevel,
    required,
    abilityName: item.name || "Ability",
    selected: new Set()
  };
  document.body.classList.add("illusive-dnd-mobile-target-picking");
  broadcastTargetIds([]);
  ensureMobileSheetStyles();
  await closeMobileSheet();

  const confirmed = await new Promise((resolve) => {
    closeOverlay();
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.className = "illusive-dnd-ms-overlay illusive-dnd-ms-target-overlay visible";
    overlay.style.zIndex = OVERLAY_Z;
    overlay.innerHTML = `
      <div class="illusive-dnd-ms-target-dialog">
        <div class="illusive-dnd-ms-target-header">
          <div>
            <strong>${escapeHtml(pick.abilityName)}</strong>
            <small class="illusive-dnd-ms-target-progress"></small>
          </div>
          <button type="button" class="roll-dialog-close" data-action="cancel" aria-label="${escapeHtml(illusiveDnd.ui("cancel"))}">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <p class="illusive-dnd-ms-target-hint"></p>
        <div class="illusive-dnd-ms-target-list"></div>
        <div class="illusive-dnd-ms-target-actions">
          <button type="button" class="roll-btn is-muted" data-action="cancel">${escapeHtml(illusiveDnd.actionBar("targetPickCancel"))}</button>
          <button type="button" class="roll-btn" data-action="confirm" disabled>${escapeHtml(illusiveDnd.actionBar("targetPickConfirm"))}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    paintOverlay(rows);

    overlay.addEventListener("pointerup", (ev) => {
      const row = ev.target?.closest?.("[data-token-id]");
      if (row && overlay.contains(row)) {
        ev.preventDefault();
        ev.stopPropagation();
        const id = row.dataset.tokenId;
        if (pick.selected.has(id)) pick.selected.delete(id);
        else {
          if (pick.selected.size >= pick.required) {
            ui.notifications.warn(illusiveDnd.actionBar("targetPickExact", { count: pick.required }));
          } else {
            pick.selected.add(id);
          }
        }
        broadcastTargetIds(pick.selected);
        paintOverlay(rows);
        return;
      }
      const action = ev.target?.closest?.("[data-action]")?.dataset?.action;
      if (action === "cancel") {
        ev.preventDefault();
        ev.stopPropagation();
        resolve(false);
      }
      if (action === "confirm") {
        ev.preventDefault();
        ev.stopPropagation();
        if (!canConfirm()) {
          ui.notifications.warn(illusiveDnd.actionBar("targetPickExact", { count: pick.required }));
          return;
        }
        resolve(true);
      }
    });
  });

  const pending = pick;
  const actorId = pending?.actorId;
  const selectedIds = pending ? [...pending.selected] : [];
  const targetUuids = rows.filter((row) => selectedIds.includes(row.id)).map((row) => row.uuid).filter(Boolean);

  if (!confirmed || !pending) {
    broadcastTargetIds([]);
    finishPick();
    if (actorId) await openMobileSheet(game.actors.get(actorId));
    return false;
  }

  let used = false;
  try {
    used = await useActivityFromHud(token, item, activity, pending.section, event, {
      targetUuids
    }, {
      validateTargets: false,
      clearTargets: true,
      spellLevel: pending.spellLevel
    });
  } catch (err) {
    console.error("illusive-dnd-5e | mobile target use failed", err);
    ui.notifications.error("Could not use that item.");
    used = false;
  }

  broadcastTargetIds([]);
  finishPick();
  if (actorId) await openMobileSheet(game.actors.get(actorId));
  return Boolean(used);
}
