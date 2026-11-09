import { MODULE_PATH, illusiveDndRenderTemplate } from "../../../constants.mjs";
import { illusiveDnd } from "../../../i18n/index.mjs";
import { canControlToken } from "../../../foundry/token-actions.mjs";
import { refreshHud } from "../../lib/render/core.mjs";
import { ILLUSIVE_DND_RENDER } from "../../lib/render/scopes.mjs";
import {
  buildLegendaryPips,
  toggleLegendarySpent
} from "../../../application/action-economy.mjs";
import { openGameLogPopup } from "./action-bar-game-log-popup.mjs";
import {
  getEconomyAvailability,
  isItemsEconomySpent,
  toggleEconomySpent,
  toggleItemsEconomySpent
} from "../../../application/economy.mjs";
import {
  collectMovementChoices,
  collectStatusChoices,
  toggleTokenStatusEffect
} from "./action-bar-token-hud.mjs";
import {
  applyLightPreset,
  collectLightPresetChoices
} from "../../../foundry/token-light.mjs";
import {
  bindAuraPickerFields,
  fillAuraDropdown,
  handleAuraPickerClick,
  openAuraPickerHtml
} from "../token-aura/token-aura-picker.mjs";
import { buildDrawerEntries, rollDrawerEntry } from "./action-bar-drawer.mjs";
import { hideActionBarUiTooltip } from "./action-bar-ui-tooltip.mjs";

let activeDropdown = null;
let activeAnchor = null;
let activeAuraToken = null;
let auraSyncBound = false;
let outsideClickBound = false;

export function closeUtilDropdown() {
  activeDropdown?.remove();
  activeDropdown = null;
  activeAuraToken = null;
  activeAnchor?.classList.remove("is-dropdown-open");
  activeAnchor = null;
}

export function bindAuraDropdownSync() {
  if (auraSyncBound) return;
  auraSyncBound = true;
  Hooks.on("updateToken", (doc) => {
    if (!activeDropdown?.isConnected || activeDropdown.dataset.type !== "aura" || !activeAuraToken) return;
    const id = activeAuraToken.document?.id ?? activeAuraToken.id;
    if (!id || doc?.id !== id) return;
    void fillAuraDropdown(activeDropdown, activeAuraToken);
  });
}

function keepDropdownOpen(type) {
  return type === "status" || type === "aura";
}

function isKeepOpenDropdownOpen() {
  return Boolean(keepDropdownOpen(activeDropdown?.dataset?.type) && activeDropdown?.isConnected);
}

/** Keep the apply-status menu open across action-bar re-renders (effect toggles). */
export function isStatusDropdownOpen() {
  return Boolean(activeDropdown?.dataset?.type === "status" && activeDropdown.isConnected);
}

export function closeUtilDropdownUnlessStatus() {
  if (isKeepOpenDropdownOpen()) return;
  closeUtilDropdown();
}

export function relinkStatusDropdownAnchor(root) {
  if (!isKeepOpenDropdownOpen() || !root) return;
  const type = activeDropdown.dataset.type;
  const nextAnchor = root.querySelector(`[data-util='${type}']`);
  if (!nextAnchor) return;
  activeAnchor?.classList.remove("is-dropdown-open");
  activeAnchor = nextAnchor;
  nextAnchor.classList.add("is-dropdown-open");
}

function bindOutsideClick() {
  if (outsideClickBound) return;
  document.body.addEventListener("click", onOutsideClick, true);
  document.body.addEventListener("contextmenu", onOutsideContextMenu, true);
  outsideClickBound = true;
}

function onOutsideClick(event) {
  if (!activeDropdown) return;
  if (event.target.closest(".illusive-dnd-util-dropdown")) return;
  if (event.target.closest("[data-util='movement'], [data-util='status'], [data-util='light'], [data-util='aura'], [data-util='rolls'], [data-util='game-log']")) return;
  if (event.target.closest(".illusive-dnd-mock-gem[data-economy]")) return;
  if (document.activeElement?.closest?.("[data-aura-feet-input], [data-aura-color-input]")) return;
  closeUtilDropdown();
}

function onOutsideContextMenu(event) {
  if (!activeDropdown) return;
  if (event.target.closest(".illusive-dnd-util-dropdown")) return;
  if (event.target.closest(".illusive-dnd-mock-gem[data-economy]")) return;
  closeUtilDropdown();
}

function positionDropdown(anchor, dropdown, point = null, type = null) {
  const gap = 6;
  dropdown.style.position = "fixed";
  // Body-level, above Foundry windows (--z-index-window: 100); match status menus.
  dropdown.style.zIndex = "10000";

  document.body.appendChild(dropdown);
  const dropdownRect = dropdown.getBoundingClientRect();

  let left;
  let top;

  if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
    left = point.x;
    top = point.y;
  } else {
    const rect = anchor.getBoundingClientRect();
    // Aura sits on the right rail — open to the left so it does not cover the combat button.
    if (type === "aura") {
      left = rect.left - gap - dropdownRect.width;
      if (left < 8) left = rect.right + gap;
    } else {
      left = rect.right + gap;
      if (left + dropdownRect.width > window.innerWidth - 8) {
        left = rect.left - gap - dropdownRect.width;
      }
    }
    // Light menu sits beside the bulb near the bottom of the vitals column —
    // bottom-align so it grows upward instead of hanging below the HUD.
    top = (type === "light" || type === "aura" || type === "rolls" || type === "status")
      ? rect.bottom - dropdownRect.height
      : rect.top;
  }

  if (left + dropdownRect.width > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - dropdownRect.width - 8);
  }
  if (top + dropdownRect.height > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - dropdownRect.height - 8);
  }
  top = Math.max(8, top);

  dropdown.style.left = `${Math.round(Math.max(8, left))}px`;
  dropdown.style.top = `${Math.round(top)}px`;
}

async function openDropdown(anchor, type, token, html, point = null) {
  if (!anchor || !token) return false;

  if (activeAnchor === anchor && activeDropdown?.dataset?.type === type) {
    closeUtilDropdown();
    return true;
  }

  closeUtilDropdown();
  const mount = document.createElement("div");
  mount.innerHTML = html;
  const dropdown = mount.firstElementChild;
  if (!dropdown) return false;

  dropdown.dataset.type = type;
  positionDropdown(anchor, dropdown, point, type);
  hideActionBarUiTooltip();

  activeDropdown = dropdown;
  activeAnchor = anchor;
  activeAuraToken = type === "aura" ? token : null;
  anchor.classList.add("is-dropdown-open");
  bindOutsideClick();

  dropdown.addEventListener("click", (event) => onDropdownClick(event, type, token));
  if (type === "status") bindStatusSearch(dropdown);
  if (type === "aura") bindAuraPickerFields(dropdown, token);
  if (type === "rolls") {
    bindRollsSearch(dropdown);
    bindRollsTabs(dropdown);
  }
  return true;
}

function filterStatusPicker(dropdown, query) {
  const needle = String(query ?? "").trim().toLowerCase();
  for (const btn of dropdown.querySelectorAll("[data-status-id]")) {
    const name = (btn.dataset.statusName || btn.getAttribute("aria-label") || "").toLowerCase();
    const match = !needle || name.includes(needle);
    btn.classList.toggle("is-filtered-out", !match);
    btn.tabIndex = match ? 0 : -1;
  }
}

function bindStatusSearch(dropdown) {
  const input = dropdown.querySelector(".illusive-dnd-token-status-search-input");
  if (!input) return;

  input.addEventListener("input", () => filterStatusPicker(dropdown, input.value));
  input.addEventListener("click", (event) => event.stopPropagation());
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key !== "Escape") return;
    if (input.value) {
      input.value = "";
      filterStatusPicker(dropdown, "");
      event.preventDefault();
      return;
    }
    closeUtilDropdown();
  });

  queueMicrotask(() => input.focus({ preventScroll: true }));
}

function filterRollsPicker(dropdown, query) {
  const needle = String(query ?? "").trim().toLowerCase();
  for (const panel of dropdown.querySelectorAll(".illusive-dnd-rolls-panel")) {
    let visibleCount = 0;
    for (const btn of panel.querySelectorAll("[data-roll-id]")) {
      const name = (btn.dataset.rollLabel || btn.textContent || "").toLowerCase();
      const match = !needle || name.includes(needle);
      btn.classList.toggle("is-filtered-out", !match);
      btn.tabIndex = match ? 0 : -1;
      if (match) visibleCount += 1;
    }
    panel.classList.toggle("is-empty", visibleCount === 0);
  }
}

function switchRollsTab(dropdown, tabId) {
  if (!dropdown || !tabId) return;
  const tabs = [...dropdown.querySelectorAll("[data-rolls-tab]")];
  const panels = [...dropdown.querySelectorAll(".illusive-dnd-rolls-panel")];
  if (!tabs.some((tab) => tab.dataset.rollsTab === tabId)) return;

  for (const tab of tabs) {
    const active = tab.dataset.rollsTab === tabId;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  for (const panel of panels) {
    const active = panel.dataset.rollSection === tabId;
    panel.classList.toggle("is-active", active);
    panel.toggleAttribute("hidden", !active);
  }

  if (activeAnchor && activeDropdown === dropdown) {
    positionDropdown(activeAnchor, dropdown, null, "rolls");
  }
}

function bindRollsTabs(dropdown) {
  const tabs = [...dropdown.querySelectorAll("[data-rolls-tab]")];
  if (!tabs.length) return;

  dropdown.addEventListener("keydown", (event) => {
    const tab = event.target.closest?.("[data-rolls-tab]");
    if (!tab || !dropdown.contains(tab)) return;
    const idx = tabs.indexOf(tab);
    if (idx < 0) return;

    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (idx + 1) % tabs.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (idx - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;

    event.preventDefault();
    event.stopPropagation();
    switchRollsTab(dropdown, tabs[next].dataset.rollsTab);
    tabs[next].focus();
  });
}

function bindRollsSearch(dropdown) {
  const input = dropdown.querySelector(".illusive-dnd-rolls-search-input");
  if (!input) return;

  input.addEventListener("input", () => filterRollsPicker(dropdown, input.value));
  input.addEventListener("click", (event) => event.stopPropagation());
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key !== "Escape") return;
    if (input.value) {
      input.value = "";
      filterRollsPicker(dropdown, "");
      event.preventDefault();
      return;
    }
    closeUtilDropdown();
  });

  queueMicrotask(() => input.focus({ preventScroll: true }));
}

function isEconomyTypeSpent(actor, economyType) {
  if (economyType === "standard") return isItemsEconomySpent(actor);
  if (economyType === "legendary") {
    const pips = buildLegendaryPips(actor);
    return Boolean(pips) && !(pips.remaining > 0);
  }
  return getEconomyAvailability(actor)[economyType] === false;
}

async function applyEconomySpentToggle(actor, economyType) {
  if (economyType === "standard") return toggleItemsEconomySpent(actor);
  if (economyType === "legendary") return toggleLegendarySpent(actor);
  if (["action", "bonus", "reaction"].includes(economyType)) {
    return toggleEconomySpent(actor, economyType);
  }
  return false;
}

async function onDropdownClick(event, type, token) {
  if (type === "economy") {
    const item = event.target.closest("[data-economy-spent-action]");
    if (!item) return;
    event.preventDefault();
    event.stopPropagation();
    const economyType = activeDropdown?.dataset?.economyType;
    if (!economyType) return;
    await applyEconomySpentToggle(token.actor, economyType);
    closeUtilDropdown();
    refreshHud(ILLUSIVE_DND_RENDER.ACTION_BAR);
    return;
  }

  if (type === "movement") {
    const item = event.target.closest("[data-movement-id]");
    if (!item) return;
    event.preventDefault();
    event.stopPropagation();
    await token.document.update({ movementAction: item.dataset.movementId });
    closeUtilDropdown();
    refreshHud(ILLUSIVE_DND_RENDER.ACTION_BAR);
    return;
  }

  if (type === "light") {
    const item = event.target.closest("[data-light-preset]");
    if (!item || item.classList.contains("is-disabled") || item.getAttribute("aria-disabled") === "true") return;
    event.preventDefault();
    event.stopPropagation();
    const presetId = item.dataset.lightPreset;
    closeUtilDropdown();
    await applyLightPreset(token, presetId);
    refreshHud(ILLUSIVE_DND_RENDER.ACTION_BAR);
    return;
  }

  if (type === "aura") {
    const changed = await handleAuraPickerClick(event, token);
    if (changed) {
      await fillAuraDropdown(activeDropdown, token);
      if (activeAnchor && activeDropdown) {
        positionDropdown(activeAnchor, activeDropdown, null, "aura");
      }
    }
    return;
  }

  if (type === "rolls") {
    const tab = event.target.closest("[data-rolls-tab]");
    if (tab) {
      event.preventDefault();
      event.stopPropagation();
      switchRollsTab(activeDropdown, tab.dataset.rollsTab);
      return;
    }
    const item = event.target.closest("[data-roll-id]");
    if (!item || item.classList.contains("is-filtered-out")) return;
    event.preventDefault();
    event.stopPropagation();
    const entry = {
      type: item.dataset.rollType,
      id: item.dataset.rollId
    };
    closeUtilDropdown();
    await rollDrawerEntry(token.actor, entry, event);
    return;
  }

  const statusBtn = event.target.closest("[data-status-id]");
  if (!statusBtn || statusBtn.classList.contains("is-filtered-out")) return;
  event.preventDefault();
  event.stopPropagation();
  const statusId = statusBtn.dataset.statusId;
  await toggleTokenStatusEffect(token, statusId);
  const picker = statusBtn.closest(".illusive-dnd-token-status-picker");
  syncStatusPicker(picker, token);
  refreshHud(ILLUSIVE_DND_RENDER.EFFECTS);
}

function statusIsActiveOnToken(token, statusId) {
  if (token?.document?.hasStatusEffect?.(statusId)) return true;
  if (token?.actor?.statuses?.has?.(statusId)) return true;
  return false;
}

function syncStatusPicker(picker, token) {
  if (!picker) return;
  for (const btn of picker.querySelectorAll("[data-status-id]")) {
    const on = statusIsActiveOnToken(token, btn.dataset.statusId);
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-pressed", String(on));
  }
  reorderStatusPicker(picker);
}

function reorderStatusPicker(picker) {
  if (!picker) return;
  const scrollTop = picker.scrollTop;
  if (picker.contains(document.activeElement)) document.activeElement.blur();
  const buttons = [...picker.querySelectorAll("[data-status-id]")];
  buttons.sort((a, b) => {
    const aOn = a.classList.contains("is-active") ? 1 : 0;
    const bOn = b.classList.contains("is-active") ? 1 : 0;
    if (aOn !== bOn) return bOn - aOn;
    return (Number(a.dataset.statusSort) || 0) - (Number(b.dataset.statusSort) || 0);
  });
  for (const btn of buttons) picker.appendChild(btn);
  picker.scrollTop = scrollTop;
  requestAnimationFrame(() => {
    picker.scrollTop = scrollTop;
  });
}

function ensureControl(token) {
  if (!token?.document) return false;
  if (!canControlToken(token)) {
    ui.notifications.warn(illusiveDnd.warning("noOwner"));
    return false;
  }
  return true;
}

export async function toggleMovementDropdown(anchor, token) {
  if (!ensureControl(token)) return false;

  const choices = collectMovementChoices(token);
  if (!choices.length) {
    ui.notifications.warn(illusiveDnd.actionBar("noMovementOptions"));
    return false;
  }

  const html = await illusiveDndRenderTemplate(
    `${MODULE_PATH}/src/hud/components/action-bar/action-bar-movement-dropdown.hbs`,
    {
      choices,
      title: illusiveDnd.actionBar("movementTitle")
    }
  );
  return openDropdown(anchor, "movement", token, html);
}

/** Open the combat game log popup (scroll button). */
export async function toggleGameLogDropdown(_anchor, _token) {
  await openGameLogPopup();
  return true;
}

export async function toggleStatusDropdown(anchor, token) {
  if (!ensureControl(token)) return false;

  const effects = await collectStatusChoices(token);
  if (!effects.length) {
    ui.notifications.warn(illusiveDnd.actionBar("noStatusOptions"));
    return false;
  }

  const html = await illusiveDndRenderTemplate(
    `${MODULE_PATH}/src/hud/components/action-bar/action-bar-status-dropdown.hbs`,
    {
      effects,
      title: illusiveDnd.actionBar("assignStatus"),
      searchPlaceholder: illusiveDnd.actionBar("searchStatuses")
    }
  );
  return openDropdown(anchor, "status", token, html);
}

export async function toggleLightDropdown(anchor, token) {
  if (!ensureControl(token)) return false;

  const choices = collectLightPresetChoices(token);
  const html = await illusiveDndRenderTemplate(
    `${MODULE_PATH}/src/hud/components/action-bar/action-bar-light-dropdown.hbs`,
    {
      choices,
      title: illusiveDnd.actionBar("toggleLight")
    }
  );
  return openDropdown(anchor, "light", token, html);
}

export async function toggleAuraDropdown(anchor, token) {
  if (!ensureControl(token)) return false;
  const html = await openAuraPickerHtml(token);
  return openDropdown(anchor, "aura", token, html);
}

export async function toggleRollsDropdown(anchor, token) {
  if (!ensureControl(token)) return false;
  if (!token?.actor) return false;

  const entries = buildDrawerEntries(token.actor);
  const sections = [
    {
      id: "checks",
      label: illusiveDnd.actionBar("tabChecks"),
      entries: [...entries.checks, ...entries.tools]
    },
    {
      id: "skills",
      label: illusiveDnd.actionBar("skills"),
      entries: entries.skills
    },
    {
      id: "saves",
      label: illusiveDnd.actionBar("saves"),
      entries: entries.saves
    }
  ].filter((section) => section.entries.length);

  if (!sections.length) {
    ui.notifications.warn(illusiveDnd.actionBar("noRollOptions"));
    return false;
  }

  const html = await illusiveDndRenderTemplate(
    `${MODULE_PATH}/src/hud/components/action-bar/action-bar-rolls-dropdown.hbs`,
    {
      title: illusiveDnd.actionBar("rolls"),
      searchPlaceholder: illusiveDnd.actionBar("searchRolls"),
      sections
    }
  );
  return openDropdown(anchor, "rolls", token, html);
}

export async function toggleEconomySpentDropdown(anchor, token, economyType, point = null) {
  if (!ensureControl(token)) return false;
  if (!token?.actor || !economyType) return false;
  if (economyType === "legendary" && !buildLegendaryPips(token.actor)) return false;

  const spent = isEconomyTypeSpent(token.actor, economyType);
  const html = await illusiveDndRenderTemplate(
    `${MODULE_PATH}/src/hud/components/action-bar/action-bar-economy-dropdown.hbs`,
    {
      title: spent ? illusiveDnd.actionBar("markAsAvailable") : illusiveDnd.actionBar("markAsSpent"),
      actionLabel: spent ? illusiveDnd.actionBar("markAsAvailable") : illusiveDnd.actionBar("markAsSpent")
    }
  );

  const opened = await openDropdown(anchor, "economy", token, html, point);
  if (opened && activeDropdown) activeDropdown.dataset.economyType = economyType;
  return opened;
}
