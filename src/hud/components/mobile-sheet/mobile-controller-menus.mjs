/**
 * Closed-phone light and aura menus. Same token updates as the table bar.
 */

import { illusiveDnd } from "../../../i18n/index.mjs";
import {
  collectLightPresetChoices,
  applyLightPreset
} from "../../../foundry/token-light.mjs";
import {
  addTokenAura,
  applyAuraColor,
  applyAuraFeet,
  buildAuraDropdownContext,
  selectAuraSlot
} from "../token-aura/token-aura-picker.mjs";
import { collectStatusChoices, toggleTokenStatusEffect } from "../action-bar/action-bar-token-hud.mjs";
import { ensureMobileSheetStyles } from "./mobile-sheet-styles.mjs";

const OVERLAY_Z = "100060";

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function closeMenus() {
  document.querySelectorAll(".illusive-dnd-ms-controller-overlay").forEach((el) => el.remove());
}

function mountOverlay(className, html) {
  closeMenus();
  ensureMobileSheetStyles();
  const overlay = document.createElement("div");
  overlay.className = `illusive-dnd-ms-overlay illusive-dnd-ms-controller-overlay ${className} visible`;
  overlay.style.zIndex = OVERLAY_Z;
  overlay.innerHTML = html;
  document.body.appendChild(overlay);
  overlay.addEventListener("pointerup", (ev) => {
    if (ev.target === overlay) overlay.remove();
  });
  return overlay;
}

async function promptCustomLightMobile(token) {
  return new Promise((resolve) => {
    const light = token?.document?.light ?? {};
    const bright = Number(light.bright) || 20;
    const dim = Number(light.dim) || 40;
    const color = typeof light.color === "string" && light.color ? light.color : "#fabb66";
    const overlay = mountOverlay("illusive-dnd-ms-light-custom-overlay", `
      <div class="illusive-dnd-ms-settings-dialog">
        <div class="roll-dialog-header">
          <span class="roll-dialog-title">${escapeHtml(illusiveDnd.actionBar("lightPresetCustom"))}</span>
          <button type="button" class="roll-dialog-close" data-action="cancel" aria-label="${escapeHtml(illusiveDnd.ui("cancel"))}">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="illusive-dnd-ms-dsn-form">
          <label class="illusive-dnd-ms-dsn-field">
            <span>${escapeHtml(illusiveDnd.actionBar("lightCustomBright"))}</span>
            <input type="number" name="bright" value="${bright}" min="0" step="1" inputmode="numeric">
          </label>
          <label class="illusive-dnd-ms-dsn-field">
            <span>${escapeHtml(illusiveDnd.actionBar("lightCustomDim"))}</span>
            <input type="number" name="dim" value="${dim}" min="0" step="1" inputmode="numeric">
          </label>
          <label class="illusive-dnd-ms-dsn-field">
            <span>${escapeHtml(illusiveDnd.actionBar("lightCustomColor"))}</span>
            <input type="color" name="color" value="${escapeHtml(color)}">
          </label>
        </div>
        <div class="illusive-dnd-ms-dsn-actions">
          <button type="button" class="roll-btn is-muted" data-action="cancel">${escapeHtml(illusiveDnd.ui("cancel"))}</button>
          <button type="button" class="roll-btn" data-action="apply">${escapeHtml(illusiveDnd.actionBar("lightCustomApply"))}</button>
        </div>
      </div>
    `);
    overlay.addEventListener("pointerup", (ev) => {
      const action = ev.target?.closest?.("[data-action]")?.dataset?.action;
      if (action === "cancel") {
        ev.preventDefault();
        overlay.remove();
        resolve(null);
      }
      if (action === "apply") {
        ev.preventDefault();
        const brightNext = Math.max(0, Math.floor(Number(overlay.querySelector("[name='bright']")?.value) || 0));
        const dimNext = Math.max(0, Math.floor(Number(overlay.querySelector("[name='dim']")?.value) || 0));
        const colorNext = overlay.querySelector("[name='color']")?.value || "#fabb66";
        if (brightNext <= 0 && dimNext <= 0) {
          ui.notifications.warn(illusiveDnd.actionBar("lightCustomInvalid"));
          return;
        }
        overlay.remove();
        resolve({
          bright: brightNext,
          dim: dimNext,
          color: colorNext,
          alpha: 0.45,
          animation: { type: "torch", speed: 2, intensity: 3, reverse: false }
        });
      }
    });
  });
}

export async function openMobileLightMenu(token) {
  if (!token?.document) return false;
  const choices = collectLightPresetChoices(token);
  const overlay = mountOverlay("illusive-dnd-ms-light-overlay", `
    <div class="illusive-dnd-ms-settings-dialog">
      <div class="roll-dialog-header">
        <span class="roll-dialog-title">${escapeHtml(illusiveDnd.actionBar("toggleLight"))}</span>
        <button type="button" class="roll-dialog-close" data-action="close" aria-label="${escapeHtml(illusiveDnd.ui("cancel"))}">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="illusive-dnd-ms-settings-list">
        ${choices.map((choice) => `
          <button type="button" class="illusive-dnd-ms-settings-item${choice.isActive ? " is-current" : ""}" data-light-preset="${escapeHtml(choice.id)}">
            <span>
              <strong>${escapeHtml(choice.label)}</strong>
              ${choice.meta ? `<small>${escapeHtml(choice.meta)}</small>` : ""}
            </span>
          </button>
        `).join("")}
      </div>
    </div>
  `);

  overlay.addEventListener("pointerup", async (ev) => {
    if (ev.target?.closest?.("[data-action='close']")) {
      ev.preventDefault();
      overlay.remove();
      return;
    }
    const btn = ev.target?.closest?.("[data-light-preset]");
    if (!btn) return;
    ev.preventDefault();
    overlay.remove();
    await applyLightPreset(token, btn.dataset.lightPreset, {
      promptCustom: promptCustomLightMobile
    });
  });
  return true;
}

function auraMenuHtml(token) {
  const ctx = buildAuraDropdownContext(token);
  const swatches = ctx.colors.map((entry) => `
    <button type="button" class="illusive-dnd-ms-aura-swatch${entry.isActive ? " is-active" : ""}" data-aura-color="${escapeHtml(entry.color)}" style="--illusive-dnd-aura-swatch:${escapeHtml(entry.color)}" aria-label="${escapeHtml(entry.color)}"></button>
  `).join("");
  const feet = ctx.feet.map((entry) => `
    <button type="button" class="illusive-dnd-ms-settings-item${entry.isActive ? " is-current" : ""}" data-aura-feet="${entry.feet}">
      <span><strong>${escapeHtml(entry.label)}</strong></span>
    </button>
  `).join("");
  const slots = ctx.slots.map((slot) => `
    <button type="button" class="illusive-dnd-ms-settings-item${slot.isActive ? " is-current" : ""}" data-aura-slot="${slot.index}">
      <span class="illusive-dnd-ms-aura-dot" style="--illusive-dnd-aura-swatch:${escapeHtml(slot.color)}"></span>
      <span><strong>${escapeHtml(slot.label)}</strong></span>
    </button>
  `).join("");

  return `
    <div class="illusive-dnd-ms-settings-dialog">
      <div class="roll-dialog-header">
        <span class="roll-dialog-title">${escapeHtml(ctx.title)}</span>
        <button type="button" class="roll-dialog-close" data-action="close" aria-label="${escapeHtml(illusiveDnd.ui("cancel"))}">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="illusive-dnd-ms-aura-slots">${slots}</div>
      <div class="illusive-dnd-ms-aura-actions">
        ${ctx.canAdd ? `<button type="button" class="illusive-dnd-ms-settings-item" data-aura-add="true"><span><strong>${escapeHtml(ctx.addLabel)}</strong></span></button>` : ""}
        <button type="button" class="illusive-dnd-ms-settings-item${ctx.offActive ? " is-current" : ""}" data-aura-feet="0">
          <span><strong>${escapeHtml(ctx.offLabel)}</strong></span>
        </button>
      </div>
      <label class="illusive-dnd-ms-aura-feet">
        <input
          type="number"
          inputmode="numeric"
          min="0"
          max="${ctx.maxFeet}"
          step="1"
          value="${escapeHtml(ctx.feetValue)}"
          data-aura-feet-input
          aria-label="${escapeHtml(ctx.title)}"
        >
        <span>${escapeHtml(ctx.feetUnit)}</span>
      </label>
      <div class="illusive-dnd-ms-settings-list">
        ${feet}
      </div>
      <div class="illusive-dnd-ms-aura-swatches">${swatches}</div>
    </div>
  `;
}

function bindAuraFeetInput(overlay, token) {
  const input = overlay.querySelector("[data-aura-feet-input]");
  if (!input) return;
  const commit = async () => {
    await applyAuraFeet(token, input.value);
    if (overlay.isConnected) refillAuraMenu(overlay, token);
  };
  input.addEventListener("pointerdown", (event) => event.stopPropagation());
  input.addEventListener("click", (event) => event.stopPropagation());
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      void commit();
    }
  });
  input.addEventListener("change", () => { void commit(); });
}

function refillAuraMenu(overlay, token, { toTop = false } = {}) {
  const dialog = overlay.querySelector(".illusive-dnd-ms-settings-dialog");
  const scrollTop = toTop ? 0 : (dialog?.scrollTop ?? 0);
  overlay.innerHTML = auraMenuHtml(token);
  bindAuraFeetInput(overlay, token);
  const next = overlay.querySelector(".illusive-dnd-ms-settings-dialog");
  if (next) next.scrollTop = scrollTop;
}

export async function openMobileAuraMenu(token) {
  if (!token?.document) return false;
  const overlay = mountOverlay("illusive-dnd-ms-aura-overlay", auraMenuHtml(token));
  bindAuraFeetInput(overlay, token);
  const tokenId = token.document.id ?? token.id;
  const onTokenUpdated = (doc) => {
    if (!overlay.isConnected) {
      Hooks.off("updateToken", onTokenUpdated);
      return;
    }
    if (!tokenId || doc?.id !== tokenId) return;
    refillAuraMenu(overlay, token);
  };
  if (typeof Hooks !== "undefined") Hooks.on("updateToken", onTokenUpdated);

  overlay.addEventListener("click", async (ev) => {
    if (ev.target?.closest?.("[data-action='close']")) {
      ev.preventDefault();
      overlay.remove();
      return;
    }
    const add = ev.target?.closest?.("[data-aura-add]");
    const slot = ev.target?.closest?.("[data-aura-slot]");
    const color = ev.target?.closest?.("[data-aura-color]");
    const feet = ev.target?.closest?.("[data-aura-feet]");
    if (!add && !slot && !color && !feet) return;
    ev.preventDefault();
    ev.stopPropagation();
    let job = Promise.resolve();
    if (add) job = addTokenAura(token);
    else if (slot) selectAuraSlot(slot.dataset.auraSlot);
    else if (color) job = applyAuraColor(token, color.dataset.auraColor);
    else job = applyAuraFeet(token, Number(feet.dataset.auraFeet) || 0);
    await job;
    if (overlay.isConnected) refillAuraMenu(overlay, token, { toTop: Boolean(add) });
  });
  return true;
}

function statusMenuHtml(title, effects) {
  const rows = effects.map((effect) => `
    <button type="button" class="illusive-dnd-ms-settings-item${effect.isActive ? " is-current" : ""}" data-status-id="${escapeHtml(effect.id)}">
      <img src="${escapeHtml(effect.src)}" alt="" width="28" height="28">
      <span><strong>${escapeHtml(effect.title)}</strong></span>
    </button>
  `).join("");
  return `
    <div class="illusive-dnd-ms-settings-dialog">
      <div class="roll-dialog-header">
        <span class="roll-dialog-title">${escapeHtml(title)}</span>
        <button type="button" class="roll-dialog-close" data-action="close" aria-label="${escapeHtml(illusiveDnd.ui("cancel"))}">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="illusive-dnd-ms-settings-list">${rows || `<p>${escapeHtml(illusiveDnd.actionBar("noStatusOptions"))}</p>`}</div>
    </div>
  `;
}

export async function openMobileStatusMenu(token) {
  if (!token) return false;
  const effects = await collectStatusChoices(token);
  if (!effects.length) {
    ui.notifications.warn(illusiveDnd.actionBar("noStatusOptions"));
    return false;
  }
  const title = illusiveDnd.actionBar("assignStatus");
  const overlay = mountOverlay("illusive-dnd-ms-status-overlay", statusMenuHtml(title, effects));

  overlay.addEventListener("pointerup", async (ev) => {
    if (ev.target?.closest?.("[data-action='close']")) {
      ev.preventDefault();
      overlay.remove();
      return;
    }
    const btn = ev.target?.closest?.("[data-status-id]");
    if (!btn) return;
    ev.preventDefault();
    await toggleTokenStatusEffect(token, btn.dataset.statusId);
    const next = await collectStatusChoices(token);
    overlay.innerHTML = statusMenuHtml(title, next);
  });
  return true;
}
