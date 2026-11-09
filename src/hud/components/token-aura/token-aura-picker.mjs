import { MODULE_PATH, illusiveDndRenderTemplate } from "../../../constants.mjs";
import { illusiveDnd } from "../../../i18n/index.mjs";
import {
  AURA_COLORS,
  AURA_FEET_CHOICES,
  DEFAULT_AURA_COLOR,
  MAX_AURAS,
  MAX_AURA_FEET,
  clampAuraFeet,
  isTokenAuraOn,
  readTokenAuras,
  unusedAuraColor
} from "../../../foundry/token-aura.mjs";
import { writeTokenAuras } from "./token-aura.mjs";

let selectedIndex = 0;

function clampSelected(auras) {
  if (!auras.length) {
    selectedIndex = 0;
    return;
  }
  selectedIndex = Math.max(0, Math.min(selectedIndex, auras.length - 1));
}

export function selectAuraSlot(index) {
  selectedIndex = Math.max(0, Number(index) || 0);
}

export async function addTokenAura(token) {
  const auras = readTokenAuras(token?.document ?? token);
  if (auras.length >= MAX_AURAS) return false;
  auras.push({
    feet: 10,
    color: unusedAuraColor(auras)
  });
  selectedIndex = auras.length - 1;
  return writeTokenAuras(token, auras);
}

export async function applyAuraFeet(token, feet) {
  const auras = readTokenAuras(token?.document ?? token);
  const nextFeet = clampAuraFeet(feet);

  if (nextFeet <= 0) {
    if (!auras.length) return writeTokenAuras(token, []);
    auras.splice(selectedIndex, 1);
    clampSelected(auras);
    return writeTokenAuras(token, auras);
  }

  if (!auras.length) {
    selectedIndex = 0;
    return writeTokenAuras(token, [{ feet: nextFeet, color: DEFAULT_AURA_COLOR }]);
  }

  clampSelected(auras);
  auras[selectedIndex] = { ...auras[selectedIndex], feet: nextFeet };
  return writeTokenAuras(token, auras);
}

export async function applyAuraColor(token, color) {
  const auras = readTokenAuras(token?.document ?? token);
  if (!auras.length) {
    selectedIndex = 0;
    return writeTokenAuras(token, [{ feet: 10, color }]);
  }

  clampSelected(auras);
  auras[selectedIndex] = { ...auras[selectedIndex], color };
  return writeTokenAuras(token, auras);
}

export function buildAuraDropdownContext(token) {
  const auras = readTokenAuras(token?.document ?? token);
  clampSelected(auras);
  const selected = auras[selectedIndex] ?? { feet: 0, color: DEFAULT_AURA_COLOR, on: false };
  const colorValue = selected.color || DEFAULT_AURA_COLOR;

  return {
    title: illusiveDnd.actionBar("toggleAura"),
    colorTitle: illusiveDnd.actionBar("auraColor"),
    addLabel: illusiveDnd.actionBar("auraAdd"),
    offLabel: illusiveDnd.actionBar("auraOff"),
    feetUnit: illusiveDnd.actionBar("auraFeetUnit"),
    pickColorLabel: illusiveDnd.actionBar("auraPickColor"),
    offActive: !selected.on,
    canAdd: auras.length < MAX_AURAS,
    maxFeet: MAX_AURA_FEET,
    feetValue: selected.on ? selected.feet : "",
    colorValue,
    customColor: !AURA_COLORS.includes(colorValue),
    slots: auras.map((aura, index) => ({
      index,
      color: aura.color,
      label: illusiveDnd.actionBar("auraFeet", { feet: aura.feet }),
      isActive: index === selectedIndex
    })),
    feet: AURA_FEET_CHOICES.map((feet) => ({
      feet,
      label: illusiveDnd.actionBar("auraFeet", { feet }),
      isActive: selected.on && selected.feet === feet
    })),
    colors: AURA_COLORS.map((color) => ({
      color,
      isActive: colorValue === color
    }))
  };
}

export async function renderAuraDropdownHtml(token) {
  return illusiveDndRenderTemplate(
    `${MODULE_PATH}/src/hud/components/token-aura/token-aura-dropdown.hbs`,
    buildAuraDropdownContext(token)
  );
}

export async function openAuraPickerHtml(token) {
  selectAuraSlot(0);
  return renderAuraDropdownHtml(token);
}

function syncAuraToolbar(token) {
  const btn = document.querySelector("#illusive-dnd-action-bar [data-util='aura']");
  if (!btn) return;
  const on = isTokenAuraOn(token);
  btn.classList.toggle("is-active", on);
  btn.setAttribute("aria-pressed", String(on));
}

function syncAuraColorUi(dropdown, color) {
  if (!dropdown) return;
  for (const el of dropdown.querySelectorAll("[data-aura-color]")) {
    el.classList.toggle("is-active", el.dataset.auraColor === color);
  }
  const pick = dropdown.querySelector(".illusive-dnd-aura-color-pick");
  if (pick) pick.classList.toggle("is-active", !AURA_COLORS.includes(color));
  const slot = dropdown.querySelector(".illusive-dnd-aura-slot.is-active");
  if (slot) slot.style.setProperty("--illusive-dnd-aura-swatch", color);
}

export function bindAuraPickerFields(dropdown, token) {
  if (!dropdown) return;

  const feetInput = dropdown.querySelector("[data-aura-feet-input]");
  if (feetInput) {
    const commit = async () => {
      const next = clampAuraFeet(feetInput.value);
      await applyAuraFeet(token, next);
      await fillAuraDropdown(dropdown, token);
    };
    feetInput.addEventListener("click", (event) => event.stopPropagation());
    feetInput.addEventListener("pointerdown", (event) => event.stopPropagation());
    feetInput.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        void commit();
      }
    });
    feetInput.addEventListener("change", () => void commit());
  }

  const colorInput = dropdown.querySelector("[data-aura-color-input]");
  if (colorInput) {
    colorInput.addEventListener("click", (event) => event.stopPropagation());
    colorInput.addEventListener("pointerdown", (event) => event.stopPropagation());
    colorInput.addEventListener("input", async (event) => {
      event.stopPropagation();
      await applyAuraColor(token, colorInput.value);
      syncAuraColorUi(dropdown, colorInput.value);
      syncAuraToolbar(token);
    });
  }
}

export async function fillAuraDropdown(dropdown, token) {
  if (!dropdown) return;
  const html = await renderAuraDropdownHtml(token);
  const mount = document.createElement("div");
  mount.innerHTML = html;
  const next = mount.firstElementChild;
  if (!next) return;

  dropdown.className = next.className;
  dropdown.innerHTML = next.innerHTML;
  dropdown.setAttribute("aria-label", next.getAttribute("aria-label") || "");
  bindAuraPickerFields(dropdown, token);
  syncAuraToolbar(token);
}

export async function handleAuraPickerClick(event, token) {
  if (event.target.closest("[data-aura-feet-input], [data-aura-color-input]")) return false;

  const add = event.target.closest("[data-aura-add]");
  const slot = event.target.closest("[data-aura-slot]");
  const colorBtn = event.target.closest("[data-aura-color]");
  const feetBtn = event.target.closest("[data-aura-feet]");
  if (!add && !slot && !colorBtn && !feetBtn) return false;

  event.preventDefault();
  event.stopPropagation();

  if (add) {
    await addTokenAura(token);
    return true;
  }
  if (slot) {
    selectAuraSlot(slot.dataset.auraSlot);
    return true;
  }
  if (colorBtn) {
    await applyAuraColor(token, colorBtn.dataset.auraColor);
    return true;
  }
  await applyAuraFeet(token, Number(feetBtn.dataset.auraFeet) || 0);
  return true;
}
