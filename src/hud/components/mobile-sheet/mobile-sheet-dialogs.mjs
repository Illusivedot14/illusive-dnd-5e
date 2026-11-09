/**
 * Mobile overlays (not Foundry DialogV2).
 */

import {
  applyActorDamage,
  applyActorHealing,
  setActorHpField
} from "../../../application/party-combat.mjs";
import { MODULE_ID } from "../../../constants.mjs";

const OVERLAY_Z = "100060";
const SHEET_BEHIND = "illusive-dnd-mobile-sheet-behind-dialog";

function dropSheetForDialog() {
  document.getElementById("illusive-dnd-mobile-sheet-root")?.classList.add(SHEET_BEHIND);
}

function raiseSheetAfterDialog() {
  document.getElementById("illusive-dnd-mobile-sheet-root")?.classList.remove(SHEET_BEHIND);
}

export async function withSheetDropped(fn) {
  dropSheetForDialog();
  try {
    return await fn();
  } finally {
    raiseSheetAfterDialog();
  }
}

function closeOverlays(selector) {
  document.querySelectorAll(selector).forEach((el) => el.remove());
}

function bindOverlayActions(overlay, onAction) {
  let done = false;
  const finish = (value) => {
    if (done) return;
    done = true;
    overlay.remove();
    onAction(value);
  };

  const activate = (ev, action) => {
    ev.preventDefault();
    ev.stopPropagation();
    finish(action === "cancel" || action === "close" ? null : action);
  };

  overlay.addEventListener("pointerup", (ev) => {
    if (ev.target === overlay) activate(ev, "cancel");
  });

  overlay.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("pointerup", (ev) => activate(ev, btn.dataset.action));
  });

  requestAnimationFrame(() => overlay.classList.add("visible"));
}

function openChoiceOverlay(className, title, actions) {
  closeOverlays(`.${className}`);
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = `roll-dialog-overlay illusive-dnd-ms-overlay ${className}`;
    overlay.style.zIndex = OVERLAY_Z;
    const buttons = actions.map(([action, label]) =>
      `<button type="button" class="roll-btn" data-action="${action}">${label}</button>`
    ).join("");
    overlay.innerHTML = `
      <div class="standalone-roll-dialog">
        <div class="roll-dialog-header">
          <span class="roll-dialog-title">${escapeHtml(title)}</span>
          <button type="button" class="roll-dialog-close" data-action="cancel" aria-label="Close">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="roll-dialog-buttons">${buttons}</div>
      </div>
    `;
    document.body.appendChild(overlay);
    bindOverlayActions(overlay, resolve);
  });
}

/**
 * @param {string} title
 * @returns {Promise<"advantage"|"normal"|"disadvantage"|null>}
 */
export function pickRollModeOverlay(title) {
  return openChoiceOverlay("illusive-dnd-ms-roll-overlay", title, [
    ["advantage", "Advantage"],
    ["normal", "Normal"],
    ["disadvantage", "Disadvantage"]
  ]);
}

/**
 * Weapon / attackable item: Attack vs Damage.
 * @param {string} title
 * @returns {Promise<"attack"|"damage"|null>}
 */
export function pickAttackOrDamageOverlay(title) {
  return openChoiceOverlay("illusive-dnd-ms-weapon-overlay", title, [
    ["attack", "Attack"],
    ["damage", "Damage"]
  ]);
}

/**
 * HP dialog: +/- amount, Heal / Damage via applyDamage, temp field apply.
 * @param {Actor} actor
 * @returns {Promise<boolean>} whether HP changed
 */
export async function openHpDialogOverlay(actor) {
  if (!actor?.isOwner && !game.user.isGM) return false;
  closeOverlays(".illusive-dnd-ms-hp-overlay");

  const readHp = () => {
    const hp = actor.system?.attributes?.hp ?? {};
    const max = Number(hp.max) || 0;
    const tempmax = Number(hp.tempmax) || 0;
    return {
      value: Number(hp.value) || 0,
      max,
      temp: Number(hp.temp) || 0,
      tempmax,
      effectiveMax: Math.max(0, max + tempmax),
      hasTempMax: tempmax !== 0
    };
  };

  let changed = false;
  const hp0 = readHp();

  const overlay = document.createElement("div");
  overlay.className = "hp-dialog-overlay illusive-dnd-ms-overlay illusive-dnd-ms-hp-overlay";
  overlay.style.zIndex = OVERLAY_Z;
  overlay.innerHTML = `
    <div class="hp-dialog">
      <div class="hp-dialog-header">
        <span class="hp-dialog-current">${hp0.value} / ${hp0.effectiveMax}</span>
        ${hp0.temp ? `<span class="hp-dialog-temp">+${hp0.temp} temp</span>` : ""}
        <button type="button" class="roll-dialog-close" data-action="close" aria-label="Close">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="hp-dialog-input-row">
        <button type="button" class="hp-dialog-adjust" data-adjust="-1">
          <i class="fa-solid fa-minus"></i>
        </button>
        <input type="number" class="hp-dialog-amount" value="1" min="1" inputmode="numeric">
        <button type="button" class="hp-dialog-adjust" data-adjust="1">
          <i class="fa-solid fa-plus"></i>
        </button>
      </div>
      <div class="hp-dialog-actions">
        <button type="button" class="hp-dialog-btn heal" data-action="heal">Healing</button>
        <button type="button" class="hp-dialog-btn damage" data-action="damage">Damage</button>
      </div>
      <div class="hp-dialog-row">
        <label>Temp HP</label>
        <input type="number" class="hp-dialog-field" data-field="temp" value="${hp0.temp}" min="0" inputmode="numeric">
        <button type="button" class="hp-dialog-field-apply" data-field="temp" title="Apply">
          <i class="fa-solid fa-angles-right"></i>
        </button>
      </div>
      <div class="hp-dialog-row">
        <label>Temp Max</label>
        <input type="number" class="hp-dialog-field" data-field="tempmax" value="${hp0.tempmax}" inputmode="numeric">
        <button type="button" class="hp-dialog-field-apply" data-field="tempmax" title="Apply">
          <i class="fa-solid fa-angles-right"></i>
        </button>
      </div>
    </div>
  `;

  const amountInput = overlay.querySelector(".hp-dialog-amount");

  const refreshHeader = () => {
    const hp = readHp();
    const header = overlay.querySelector(".hp-dialog-header");
    if (!header) return;
    const current = header.querySelector(".hp-dialog-current");
    const temp = header.querySelector(".hp-dialog-temp");
    if (current) current.textContent = `${hp.value} / ${hp.effectiveMax}`;
    if (hp.temp) {
      if (temp) temp.textContent = `+${hp.temp} temp`;
      else current?.insertAdjacentHTML("afterend", `<span class="hp-dialog-temp">+${hp.temp} temp</span>`);
    } else {
      temp?.remove();
    }
  };

  const close = () => overlay.remove();

  overlay.querySelectorAll(".hp-dialog-adjust").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const delta = Number(btn.dataset.adjust) || 0;
      const cur = Number(amountInput.value) || 0;
      amountInput.value = String(Math.max(0, cur + delta));
    });
  });

  overlay.querySelector('[data-action="heal"]').addEventListener("click", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const amount = Number(amountInput.value) || 0;
    if (amount < 1) {
      ui.notifications.warn("Enter an amount of at least 1.");
      return;
    }
    await applyActorHealing(actor, amount);
    changed = true;
    refreshHeader();
  });

  overlay.querySelector('[data-action="damage"]').addEventListener("click", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const amount = Number(amountInput.value) || 0;
    if (amount < 1) {
      ui.notifications.warn("Enter an amount of at least 1.");
      return;
    }
    await applyActorDamage(actor, amount);
    changed = true;
    refreshHeader();
  });

  overlay.querySelectorAll(".hp-dialog-field-apply").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const field = btn.dataset.field;
      const input = overlay.querySelector(`.hp-dialog-field[data-field="${field}"]`);
      const value = Number(input?.value) || 0;
      await setActorHpField(actor, field, value);
      changed = true;
      btn.classList.add("applied");
      setTimeout(() => btn.classList.remove("applied"), 300);
      refreshHeader();
    });
  });

  overlay.querySelectorAll(".hp-dialog-field").forEach((input) => {
    input.addEventListener("keydown", async (ev) => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      const field = input.dataset.field;
      const value = Number(input.value) || 0;
      await setActorHpField(actor, field, value);
      changed = true;
      input.blur();
      refreshHeader();
    });
  });

  amountInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      overlay.querySelector('[data-action="damage"]')?.click();
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      close();
    }
  });

  overlay.addEventListener("pointerup", (ev) => {
    if (ev.target === overlay || ev.target?.closest?.("[data-action='close']")) {
      ev.preventDefault();
      ev.stopPropagation();
      close();
    }
  });

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("visible"));
  setTimeout(() => amountInput?.focus(), 50);

  // Wait until overlay is removed so caller can refresh the sheet.
  await new Promise((resolve) => {
    const obs = new MutationObserver(() => {
      if (!document.body.contains(overlay)) {
        obs.disconnect();
        resolve();
      }
    });
    obs.observe(document.body, { childList: true });
  });

  return changed;
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function enrichItemDescription(item) {
  const raw = item?.system?.description?.value
    ?? item?.system?.description
    ?? item?.system?.unidentified?.description
    ?? "";
  const text = String(raw ?? "").trim();
  if (!text) return "<p class=\"illusive-dnd-ms-item-empty\">No description.</p>";

  let html = text;
  try {
    if (typeof Text.enrichHTML === "function") {
      html = await Text.enrichHTML(text, {
        async: true,
        secrets: item?.isOwner,
        relativeTo: item,
        rollData: item?.getRollData?.() ?? {}
      });
    }
  } catch (err) {
    console.warn("Item description enrich failed", err);
    html = `<p>${escapeHtml(text.replace(/<[^>]+>/g, " "))}</p>`;
  }
  return cleanDescriptionHtml(html);
}

/** Strip empty wrappers, inline junk, and collapse whitespace for mobile reading. */
function cleanDescriptionHtml(html) {
  const wrap = document.createElement("div");
  wrap.innerHTML = String(html ?? "");

  wrap.querySelectorAll("script, style, link, meta, noscript").forEach((el) => el.remove());
  wrap.querySelectorAll("*").forEach((el) => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (
        name === "style"
        || name === "class"
        || name === "id"
        || name.startsWith("on")
        || name.startsWith("data-")
      ) {
        el.removeAttribute(attr.name);
      }
    }
  });

  // Drop empty nodes (repeat to clear nested empties)
  for (let pass = 0; pass < 4; pass++) {
    wrap.querySelectorAll("p, span, div, section, article, header, footer, strong, em, b, i, u, font, h1, h2, h3, h4, h5, h6").forEach((el) => {
      const hasMedia = el.querySelector("img, video, iframe, svg, hr, table, ul, ol");
      if (!hasMedia && !el.textContent?.replace(/\u00a0/g, " ").trim()) el.remove();
    });
  }

  // Prefer simple paragraphs: unwrap lone div wrappers that only contain text/inline
  wrap.querySelectorAll("div").forEach((div) => {
    if (div.querySelector("div, p, ul, ol, table, img, h1, h2, h3, h4")) return;
    const p = document.createElement("p");
    p.innerHTML = div.innerHTML;
    div.replaceWith(p);
  });

  let out = wrap.innerHTML
    .replace(/&nbsp;/gi, " ")
    .replace(/(?:<br\s*\/?>\s*){3,}/gi, "<br><br>")
    .replace(/\s{2,}/g, " ")
    .replace(/>\s+</g, "><")
    .trim();

  if (!out || !wrap.textContent?.replace(/\u00a0/g, " ").trim()) {
    return "<p class=\"illusive-dnd-ms-item-empty\">No description.</p>";
  }
  // Ensure block content
  if (!/<(p|ul|ol|table|h\d|div|blockquote)\b/i.test(out)) {
    out = `<p>${out}</p>`;
  }
  return out;
}

/**
 * Item / feature detail sheet: description + bottom action buttons.
 * @param {Item} item
 * @param {{
 *   subtitle?: string,
 *   canUse?: boolean,
 *   canEquip?: boolean,
 *   equipped?: boolean,
 *   showAttack?: boolean,
 *   showDamage?: boolean,
 *   canPrepare?: boolean,
 *   prepared?: boolean
 * }} options
 * @returns {Promise<"use"|"attack"|"damage"|"equip"|"prepare"|"close"|null>}
 */
export async function openItemDetailOverlay(item, options = {}) {
  closeOverlays(".illusive-dnd-ms-item-overlay");

  const subtitle = options.subtitle
    || item?.type?.charAt?.(0)?.toUpperCase?.() + item?.type?.slice?.(1)
    || "";
  const description = await enrichItemDescription(item);
  const buttons = [];

  if (options.showAttack) {
    buttons.push(`<button type="button" class="roll-btn illusive-dnd-ms-item-action" data-action="attack">Attack</button>`);
  }
  if (options.showDamage) {
    buttons.push(`<button type="button" class="roll-btn illusive-dnd-ms-item-action" data-action="damage">Damage</button>`);
  }
  if (options.canUse && !options.showAttack && !options.showDamage) {
    buttons.push(`<button type="button" class="roll-btn illusive-dnd-ms-item-action" data-action="use">Use</button>`);
  } else if (options.canUse && (options.showAttack || options.showDamage)) {
    buttons.push(`<button type="button" class="roll-btn illusive-dnd-ms-item-action" data-action="use">Use</button>`);
  }
  if (options.canEquip) {
    buttons.push(
      `<button type="button" class="roll-btn illusive-dnd-ms-item-action" data-action="equip">${
        options.equipped ? "Unequip" : "Equip"
      }</button>`
    );
  }
  if (options.canPrepare) {
    buttons.push(
      `<button type="button" class="roll-btn illusive-dnd-ms-item-action" data-action="prepare">${
        options.prepared ? "Unprepare" : "Prepare"
      }</button>`
    );
  }
  buttons.push(`<button type="button" class="roll-btn illusive-dnd-ms-item-action is-muted" data-action="close">Close</button>`);

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "roll-dialog-overlay illusive-dnd-ms-overlay illusive-dnd-ms-item-overlay";
    overlay.style.zIndex = OVERLAY_Z;
    overlay.innerHTML = `
      <div class="standalone-roll-dialog illusive-dnd-ms-item-dialog">
        <div class="roll-dialog-header">
          <div class="illusive-dnd-ms-item-heading">
            <img class="illusive-dnd-ms-item-thumb" src="${escapeHtml(item.img || "icons/svg/item-bag.svg")}" alt="" />
            <div class="illusive-dnd-ms-item-titles">
              <span class="roll-dialog-title">${escapeHtml(item.name)}</span>
              ${subtitle ? `<span class="illusive-dnd-ms-item-subtitle">${escapeHtml(subtitle)}</span>` : ""}
            </div>
          </div>
          <button type="button" class="roll-dialog-close" data-action="close" aria-label="Close">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="illusive-dnd-ms-item-description">${description}</div>
        <div class="roll-dialog-buttons illusive-dnd-ms-item-actions">${buttons.join("")}</div>
      </div>
    `;
    document.body.appendChild(overlay);
    bindOverlayActions(overlay, resolve);
  });
}

const ACCENT_THEMES = [
  { hex: "#b794f6", name: "Violet" },
  { hex: "#7ab6c4", name: "Teal" },
  { hex: "#62d58a", name: "Verdant" },
  { hex: "#f0c14a", name: "Gold" },
  { hex: "#ef6b6b", name: "Crimson" },
  { hex: "#4fc3f7", name: "Sky" },
  { hex: "#ff8a65", name: "Ember" },
  { hex: "#ce93d8", name: "Lilac" },
  { hex: "#ffffff", name: "White" },
  { hex: "#1a1a1a", name: "Black" }
];

/**
 * Full UI theme picker (named theme rows — not swatch circles).
 * @returns {Promise<string|null>} chosen hex or null if cancelled
 */
export async function openAccentColorOverlay(currentColor = "#b794f6") {
  closeOverlays(".illusive-dnd-ms-accent-overlay");
  const {
    getMobileAccentColor,
    setMobileAccentColor,
    applyMobileAccentColor,
    MOBILE_ACCENT_DEFAULT
  } = await import("./mobile-accent.mjs");
  const initial = getMobileAccentColor() || currentColor || MOBILE_ACCENT_DEFAULT;

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "roll-dialog-overlay illusive-dnd-ms-overlay illusive-dnd-ms-accent-overlay";
    overlay.style.zIndex = OVERLAY_Z;

    const rows = ACCENT_THEMES.map(({ hex, name }) => {
      const active = hex.toLowerCase() === initial.toLowerCase() ? " is-active" : "";
      return `
        <button type="button" class="illusive-dnd-ms-theme-row${active}" data-action="preset" data-color="${hex}" style="--theme:${hex}">
          <span class="illusive-dnd-ms-theme-preview" style="background:${hex}" aria-hidden="true"></span>
          <span class="illusive-dnd-ms-theme-meta">
            <strong>${name}</strong>
            <small>${hex}</small>
          </span>
        </button>
      `;
    }).join("");

    overlay.innerHTML = `
      <div class="standalone-roll-dialog illusive-dnd-ms-accent-dialog">
        <div class="roll-dialog-header">
          <span class="roll-dialog-title">UI Theme</span>
          <button type="button" class="roll-dialog-close" data-action="cancel" aria-label="Close">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <p class="illusive-dnd-ms-accent-hint">Themes your whole mobile client. Only you see this.</p>
        <div class="illusive-dnd-ms-theme-list">${rows}</div>
        <div class="illusive-dnd-ms-theme-custom">
          <label for="illusive-dnd-ms-accent-input">Custom color</label>
          <div class="illusive-dnd-ms-theme-custom-row">
            <input id="illusive-dnd-ms-accent-input" type="color" value="${escapeHtml(initial)}" />
            <span id="illusive-dnd-ms-accent-hex" class="illusive-dnd-ms-theme-hex">${escapeHtml(initial)}</span>
          </div>
        </div>
        <div class="roll-dialog-buttons illusive-dnd-ms-item-actions illusive-dnd-ms-accent-actions">
          <button type="button" class="roll-btn" data-action="apply">Apply</button>
          <button type="button" class="roll-btn is-muted" data-action="cancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector("#illusive-dnd-ms-accent-input");
    const hexLabel = overlay.querySelector("#illusive-dnd-ms-accent-hex");
    let chosen = initial;

    const setChosen = (hex) => {
      chosen = hex;
      if (input) input.value = hex;
      if (hexLabel) hexLabel.textContent = hex;
      overlay.querySelectorAll(".illusive-dnd-ms-theme-row").forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.color?.toLowerCase() === hex.toLowerCase());
      });
      applyMobileAccentColor(hex);
    };

    let done = false;
    const finish = async (save) => {
      if (done) return;
      done = true;
      overlay.remove();
      if (!save) {
        applyMobileAccentColor(initial);
        resolve(null);
        return;
      }
      const hex = await setMobileAccentColor(chosen);
      resolve(hex);
    };

    overlay.addEventListener("pointerup", (ev) => {
      if (ev.target === overlay) void finish(false);
    });
    overlay.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("pointerup", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const action = btn.dataset.action;
        if (action === "preset") setChosen(btn.dataset.color);
        else if (action === "apply") void finish(true);
        else if (action === "cancel") void finish(false);
      });
    });
    input?.addEventListener("input", () => setChosen(input.value));
    requestAnimationFrame(() => overlay.classList.add("visible"));
  });
}

/** Built-in DSN texture ids (Dice So Nice 6.x). */
const DSN_TEXTURES = [
  ["none", "DICESONICE.TextureNone"],
  ["cloudy", "DICESONICE.TextureCloudsTransparent"],
  ["cloudy_2", "DICESONICE.TextureClouds"],
  ["fire", "DICESONICE.TextureFire"],
  ["marble", "DICESONICE.TextureMarble"],
  ["water", "DICESONICE.TextureWaterTransparent"],
  ["water_2", "DICESONICE.TextureWater"],
  ["ice", "DICESONICE.TextureIceTransparent"],
  ["ice_2", "DICESONICE.TextureIce"],
  ["paper", "DICESONICE.TexturePaper"],
  ["speckles", "DICESONICE.TextureSpeckles"],
  ["glitter", "DICESONICE.TextureGlitter"],
  ["glitter_2", "DICESONICE.TextureGlitterTransparent"],
  ["stars", "DICESONICE.TextureStars"],
  ["stainedglass", "DICESONICE.TextureStainedGlass"],
  ["skulls", "DICESONICE.TextureSkulls"],
  ["leopard", "DICESONICE.TextureLeopard"],
  ["tiger", "DICESONICE.TextureTiger"],
  ["cheetah", "DICESONICE.TextureCheetah"],
  ["dragon", "DICESONICE.TextureDragon"],
  ["lizard", "DICESONICE.TextureLizard"],
  ["bird", "DICESONICE.TextureBird"],
  ["astral", "DICESONICE.TextureAstralSea"],
  ["wood", "DICESONICE.TextureWood"],
  ["metal", "DICESONICE.TextureMetal"],
  ["stone", "DICESONICE.TextureStone"],
  ["radial", "DICESONICE.TextureRadial"],
  ["bronze01", "DICESONICE.TextureBronze1"],
  ["bronze02", "DICESONICE.TextureBronze2"],
  ["bronze03", "DICESONICE.TextureBronze3"],
  ["bronze03a", "DICESONICE.TextureBronze3a"],
  ["bronze03b", "DICESONICE.TextureBronze3b"],
  ["bronze04", "DICESONICE.TextureBronze4"],
  ["brick", "DICESONICE.TextureBrick"],
  ["fiber", "DICESONICE.TextureFiber"],
  ["fuel", "DICESONICE.TextureFuel"],
  ["watercolor", "DICESONICE.TextureWatercolor"],
  ["alienrock", "DICESONICE.TextureAlienRock"],
  ["hell", "DICESONICE.TextureHell"],
  ["lava", "DICESONICE.TextureLava"],
  ["portal", "DICESONICE.TexturePortal"],
  ["tile", "DICESONICE.TextureTile"]
];

const DSN_MATERIALS = [
  ["auto", "DICESONICE.MaterialAuto"],
  ["chrome", "DICESONICE.MaterialChrome"],
  ["frosted", "DICESONICE.MaterialFrosted"],
  ["glass", "DICESONICE.MaterialGlass"],
  ["iridescent", "DICESONICE.MaterialIridescent"],
  ["metal", "DICESONICE.MaterialMetal"],
  ["plastic", "DICESONICE.MaterialPlastic"],
  ["pristine", "DICESONICE.MaterialPristine"],
  ["resin", "DICESONICE.MaterialResin"],
  ["stone", "DICESONICE.MaterialStone"],
  ["velvet", "DICESONICE.MaterialVelvet"],
  ["wood", "DICESONICE.MaterialWood"]
];

const DSN_COLORSETS = [
  ["custom", "DICESONICE.ColorCustom"],
  ["royal_velvet", "DICESONICE.ColorRoyalVelvet"],
  ["foundry", "DICESONICE.ColorFoundry"],
  ["rainbow", "DICESONICE.ColorRainblow"],
  ["random", "DICESONICE.ColorRaNdOm"],
  ["black", "DICESONICE.ColorBlack"],
  ["white", "DICESONICE.ColorWhite"],
  ["grey", "DICESONICE.ColorGrey"],
  ["red", "DICESONICE.ColorRed"],
  ["blue", "DICESONICE.ColorBlue"],
  ["green", "DICESONICE.ColorGreen"],
  ["yellow", "DICESONICE.ColorYellow"],
  ["pink", "DICESONICE.ColorPink"],
  ["cyan", "DICESONICE.ColorCyan"],
  ["prism", "DICESONICE.ColorPrism"],
  ["amber", "DICESONICE.ColorAmber"],
  ["bronze", "DICESONICE.ColorBronze"],
  ["sea_glass", "DICESONICE.ColorSeaGlass"],
  ["alienrock", "DICESONICE.ColorAlienRock"],
  ["portal", "DICESONICE.ColorPortal"],
  ["tile", "DICESONICE.ColorTile"],
  ["breebaby", "DICESONICE.ColorPastelSunset"],
  ["pinkdreams", "DICESONICE.ColorPinkDreams"],
  ["inspired", "DICESONICE.ColorInspired"],
  ["bloodmoon", "DICESONICE.ColorBloodMoon"],
  ["starynight", "DICESONICE.ColorStaryNight"],
  ["glitterparty", "DICESONICE.ColorGlitterParty"],
  ["astralsea", "DICESONICE.ColorAstralSea"],
  ["dragons", "DICESONICE.ColorDragons"],
  ["birdup", "DICESONICE.ColorBirdUp"],
  ["hell", "DICESONICE.ColorHell"],
  ["tigerking", "DICESONICE.ColorTigerKing"],
  ["toxic", "DICESONICE.ColorToxic"],
  ["radiant", "DICESONICE.ColorRadiant"],
  ["fire", "DICESONICE.ColorFire"],
  ["ice", "DICESONICE.ColorIce"],
  ["cold", "DICESONICE.ColorCold"],
  ["poison", "DICESONICE.ColorPoison"],
  ["acid", "DICESONICE.ColorAcid"],
  ["thunder", "DICESONICE.ColorThunder"],
  ["lightning", "DICESONICE.ColorLightning"],
  ["air", "DICESONICE.ColorAir"],
  ["water", "DICESONICE.ColorWater"],
  ["earth", "DICESONICE.ColorEarth"],
  ["force", "DICESONICE.ColorForce"],
  ["psychic", "DICESONICE.ColorPsychic"],
  ["necrotic", "DICESONICE.ColorNecrotic"]
];

function dsnLocalize(key, fallback) {
  try {
    const label = game.i18n?.localize?.(key);
    if (label && label !== key) return label;
  } catch {
    /* ignore */
  }
  return fallback ?? key.replace(/^DICESONICE\./, "").replace(/([a-z])([A-Z])/g, "$1 $2");
}

function dsnSelectOptions(entries, selected) {
  const current = selected || "";
  const ids = new Set(entries.map(([id]) => id));
  const list = [...entries];
  if (current && !ids.has(current)) list.unshift([current, current]);
  return list.map(([id, labelKey]) => {
    const label = labelKey.startsWith("DICESONICE.")
      ? dsnLocalize(labelKey, id)
      : labelKey;
    const sel = id === current ? " selected" : "";
    return `<option value="${escapeHtml(id)}"${sel}>${escapeHtml(label)}</option>`;
  }).join("");
}

function dsnSystemOptions(selected) {
  const systems = game.dice3d?.DiceFactory?.systems
    ?? game.dice3d?.box?.dicefactory?.systems
    ?? null;
  const entries = [];
  if (systems?.forEach) {
    systems.forEach((sys, id) => {
      entries.push([id, sys?.name || id]);
    });
  }
  if (!entries.length) {
    entries.push(
      ["standard", "Standard"],
      ["foundry_vtt", "Foundry VTT"],
      ["spectrum", "Spectrum"],
      ["dot", "Dot"],
      ["dot_b", "Dot (Black)"]
    );
  }
  entries.sort((a, b) => {
    if (a[0] === "standard") return -1;
    if (b[0] === "standard") return 1;
    return String(a[1]).localeCompare(String(b[1]));
  });
  return dsnSelectOptions(entries, selected || "standard");
}

function dsnFontOptions(selected) {
  const entries = [["auto", dsnLocalize("DICESONICE.FontAuto", "Auto (Theme)")]];
  try {
    const choices = foundry.applications.settings.menus.FontConfig.getAvailableFontChoices?.() ?? {};
    for (const [id, label] of Object.entries(choices)) {
      entries.push([id, label || id]);
    }
  } catch {
    /* FontConfig unavailable */
  }
  return dsnSelectOptions(entries, selected || "auto");
}

/** Normalize to #rrggbb for <input type="color">. */
function normalizeHexColor(value, fallback = "#000000") {
  if (value == null || value === "") return fallback;
  let c = String(value).trim();
  if (c.startsWith("0x") || c.startsWith("0X")) c = `#${c.slice(2)}`;
  if (!c.startsWith("#") && /^[0-9a-fA-F]{3,8}$/.test(c)) c = `#${c}`;
  if (/^#[0-9a-fA-F]{3}$/.test(c)) {
    c = `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  }
  if (/^#[0-9a-fA-F]{8}$/.test(c)) c = c.slice(0, 7);
  if (!/^#[0-9a-fA-F]{6}$/i.test(c)) return fallback;
  return c.toLowerCase();
}

/**
 * Same source desktop DiceConfig uses: Dice3D.APPEARANCE(game.user).
 */
function loadDesktopAppearance() {
  const Dice3D = game.dice3d?.constructor;
  let appearance = null;

  try {
    if (typeof Dice3D?.APPEARANCE === "function") {
      appearance = foundry.utils.duplicate(Dice3D.APPEARANCE(game.user));
    }
  } catch (err) {
    console.warn("ILLUSIVE_DND | Dice3D.APPEARANCE failed", err);
  }

  if (!appearance) {
    const flag = game.user.getFlag("dice-so-nice", "appearance") ?? {};
    const base = typeof Dice3D?.DEFAULT_APPEARANCE === "function"
      ? Dice3D.DEFAULT_APPEARANCE(game.user)
      : {
        global: {
          labelColor: "#ffffff",
          diceColor: "#000000",
          outlineColor: "#000000",
          edgeColor: "#000000",
          texture: "none",
          material: "auto",
          font: "auto",
          colorset: "custom",
          system: "standard"
        }
      };
    appearance = foundry.utils.mergeObject(
      foundry.utils.duplicate(base),
      flag,
      { inplace: false, applyOperators: true }
    );
  }

  const global = appearance.global ?? (appearance.global = {});
  const factory = game.dice3d?.DiceFactory ?? game.dice3d?.box?.dicefactory;
  const rawFlag = game.user.getFlag("dice-so-nice", "appearance");

  // DiceConfig: if user has no saved appearance yet, use factory preferences
  if (!rawFlag?.global) {
    if (factory?.preferredSystem && factory.preferredSystem !== "standard") {
      global.system = factory.preferredSystem;
    }
    if (factory?.preferredColorset && factory.preferredColorset !== "custom") {
      global.colorset = factory.preferredColorset;
    }
  }

  if (!global.system) global.system = "standard";
  if (!global.colorset) global.colorset = "custom";
  if (!global.texture) global.texture = "none";
  if (!global.material) global.material = "auto";
  if (!global.font) global.font = "auto";

  global.labelColor = normalizeHexColor(global.labelColor, "#ffffff");
  global.diceColor = normalizeHexColor(global.diceColor, "#000000");
  global.outlineColor = normalizeHexColor(global.outlineColor, "#000000");
  global.edgeColor = normalizeHexColor(global.edgeColor, global.diceColor);

  return appearance;
}

function readDiceEnabled() {
  try {
    const Dice3D = game.dice3d?.constructor;
    if (typeof Dice3D?.CONFIG === "function") {
      const cfg = Dice3D.CONFIG(game.user);
      if (cfg?.visibility) return cfg.visibility !== "none";
      if (typeof cfg?.enabled === "boolean") return cfg.enabled;
    }
  } catch {
    /* fall through */
  }
  const userSettings = game.user.getFlag("dice-so-nice", "settings");
  if (userSettings?.visibility) return userSettings.visibility !== "none";
  if (userSettings && typeof userSettings.enabled === "boolean") return userSettings.enabled;
  return true;
}

/**
 * Lightweight Dice So Nice appearance editor (no DiceConfig canvas).
 * Prefills from the same desktop user flags Dice So Nice uses.
 * @returns {Promise<boolean>}
 */
export async function openDiceSoNiceSettings() {
  const mod = game.modules.get("dice-so-nice");
  if (!mod?.active) {
    ui.notifications?.warn?.("Dice So Nice is not enabled in this world.");
    return false;
  }

  closeOverlays(".illusive-dnd-ms-dsn-overlay");

  const appearance = loadDesktopAppearance();
  const global = appearance.global ?? (appearance.global = {});
  const enabled = readDiceEnabled();

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "roll-dialog-overlay illusive-dnd-ms-overlay illusive-dnd-ms-dsn-overlay illusive-dnd-ms-settings-overlay";
    overlay.style.zIndex = OVERLAY_Z;

    overlay.innerHTML = `
      <div class="standalone-roll-dialog illusive-dnd-ms-settings-dialog illusive-dnd-ms-dsn-dialog">
        <div class="roll-dialog-header">
          <span class="roll-dialog-title">My Dice</span>
          <button type="button" class="roll-dialog-close" data-action="cancel" aria-label="Close">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <p class="illusive-dnd-ms-settings-hint">Loaded from your Dice So Nice settings. Use Test Roll to preview.</p>
        <div class="illusive-dnd-ms-dsn-form">
          <label class="illusive-dnd-ms-dsn-check">
            <input type="checkbox" id="illusive-dnd-dsn-enabled" ${enabled ? "checked" : ""} />
            <span>Enable 3D dice</span>
          </label>
          <label class="illusive-dnd-ms-dsn-field">
            <span>Dice presets</span>
            <select id="illusive-dnd-dsn-system">${dsnSystemOptions(global.system)}</select>
          </label>
          <label class="illusive-dnd-ms-dsn-field">
            <span>Theme</span>
            <select id="illusive-dnd-dsn-colorset">${dsnSelectOptions(DSN_COLORSETS, global.colorset)}</select>
          </label>
          <label class="illusive-dnd-ms-dsn-field">
            <span>Texture</span>
            <select id="illusive-dnd-dsn-texture">${dsnSelectOptions(DSN_TEXTURES, global.texture)}</select>
          </label>
          <label class="illusive-dnd-ms-dsn-field">
            <span>Material</span>
            <select id="illusive-dnd-dsn-material">${dsnSelectOptions(DSN_MATERIALS, global.material)}</select>
          </label>
          <label class="illusive-dnd-ms-dsn-field">
            <span>Font</span>
            <select id="illusive-dnd-dsn-font">${dsnFontOptions(global.font)}</select>
          </label>
          <label class="illusive-dnd-ms-dsn-field">
            <span>Dice color</span>
            <input type="color" id="illusive-dnd-dsn-dice" value="${escapeHtml(global.diceColor)}" />
          </label>
          <label class="illusive-dnd-ms-dsn-field">
            <span>Label color</span>
            <input type="color" id="illusive-dnd-dsn-label" value="${escapeHtml(global.labelColor)}" />
          </label>
          <label class="illusive-dnd-ms-dsn-field">
            <span>Outline color</span>
            <input type="color" id="illusive-dnd-dsn-outline" value="${escapeHtml(global.outlineColor)}" />
          </label>
          <label class="illusive-dnd-ms-dsn-field">
            <span>Edge color</span>
            <input type="color" id="illusive-dnd-dsn-edge" value="${escapeHtml(global.edgeColor)}" />
          </label>
        </div>
        <div class="roll-dialog-buttons illusive-dnd-ms-item-actions illusive-dnd-ms-accent-actions illusive-dnd-ms-dsn-actions">
          <button type="button" class="roll-btn illusive-dnd-ms-dsn-test" data-action="test">Test Roll</button>
          <button type="button" class="roll-btn" data-action="apply">Save</button>
          <button type="button" class="roll-btn is-muted" data-action="cancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const colorInputs = () => ["#illusive-dnd-dsn-dice", "#illusive-dnd-dsn-label", "#illusive-dnd-dsn-outline", "#illusive-dnd-dsn-edge"]
      .map((sel) => overlay.querySelector(sel))
      .filter(Boolean);

    const syncColorInputsEnabled = () => {
      const custom = (overlay.querySelector("#illusive-dnd-dsn-colorset")?.value || "custom") === "custom";
      for (const el of colorInputs()) el.disabled = !custom;
    };

    // Force DOM values from desktop appearance (belt-and-suspenders with selected attrs)
    const setVal = (sel, value) => {
      const el = overlay.querySelector(sel);
      if (!el || value == null || value === "") return;
      el.value = value;
    };
    setVal("#illusive-dnd-dsn-system", global.system);
    setVal("#illusive-dnd-dsn-colorset", global.colorset);
    setVal("#illusive-dnd-dsn-texture", global.texture);
    setVal("#illusive-dnd-dsn-material", global.material);
    setVal("#illusive-dnd-dsn-font", global.font);
    setVal("#illusive-dnd-dsn-dice", global.diceColor);
    setVal("#illusive-dnd-dsn-label", global.labelColor);
    setVal("#illusive-dnd-dsn-outline", global.outlineColor);
    setVal("#illusive-dnd-dsn-edge", global.edgeColor);
    const en = overlay.querySelector("#illusive-dnd-dsn-enabled");
    if (en) en.checked = enabled;
    syncColorInputsEnabled();
    overlay.querySelector("#illusive-dnd-dsn-colorset")?.addEventListener("change", syncColorInputsEnabled);

    const readFormAppearance = () => {
      const nextAppearance = foundry.utils.duplicate(appearance);
      const colorset = overlay.querySelector("#illusive-dnd-dsn-colorset")?.value || "custom";
      const patch = {
        system: overlay.querySelector("#illusive-dnd-dsn-system")?.value || "standard",
        colorset,
        texture: overlay.querySelector("#illusive-dnd-dsn-texture")?.value || "none",
        material: overlay.querySelector("#illusive-dnd-dsn-material")?.value || "auto",
        font: overlay.querySelector("#illusive-dnd-dsn-font")?.value || "auto"
      };

      // Match desktop DiceConfig: named themes do not store per-color overrides
      if (colorset === "custom") {
        patch.diceColor = overlay.querySelector("#illusive-dnd-dsn-dice")?.value || "#000000";
        patch.labelColor = overlay.querySelector("#illusive-dnd-dsn-label")?.value || "#ffffff";
        patch.outlineColor = overlay.querySelector("#illusive-dnd-dsn-outline")?.value || "#000000";
        patch.edgeColor = overlay.querySelector("#illusive-dnd-dsn-edge")?.value
          || overlay.querySelector("#illusive-dnd-dsn-dice")?.value
          || "#000000";
      } else if (foundry.data?.operators?.ForcedDeletion) {
        const del = foundry.data.operators.ForcedDeletion;
        patch.labelColor = del;
        patch.diceColor = del;
        patch.outlineColor = del;
        patch.edgeColor = del;
      }

      nextAppearance.global = foundry.utils.mergeObject(nextAppearance.global ?? {}, patch, {
        inplace: false,
        applyOperators: true
      });
      return nextAppearance;
    };

    const persistSettings = async () => {
      const nextEnabled = Boolean(overlay.querySelector("#illusive-dnd-dsn-enabled")?.checked);
      const nextAppearance = readFormAppearance();
      await game.user.setFlag("dice-so-nice", "appearance", nextAppearance);

      const userSettings = foundry.utils.duplicate(game.user.getFlag("dice-so-nice", "settings") ?? {});
      userSettings.enabled = nextEnabled;
      const prevVis = userSettings.visibility;
      userSettings.visibility = nextEnabled
        ? (prevVis && prevVis !== "none" ? prevVis : "all")
        : "none";
      await game.user.setFlag("dice-so-nice", "settings", userSettings);

      try {
        if (game.dice3d?.DiceFactory) {
          game.dice3d.DiceFactory.preferredColorset = nextAppearance.global.colorset;
          game.dice3d.DiceFactory.preferredSystem = nextAppearance.global.system;
        }
      } catch {
        /* optional cache hint */
      }

      return nextAppearance;
    };

    const runTestRoll = async () => {
      const btn = overlay.querySelector('[data-action="test"]');
      if (btn) btn.disabled = true;
      overlay.classList.remove("visible");
      overlay.style.pointerEvents = "none";
      try {
        await persistSettings();
        const roll = new Roll("1d20");
        await roll.evaluate({ allowInteractive: false });
        const dsn = game.dice3d;
        if (dsn?.showForRoll) {
          const prev = dsn.messageHookDisabled;
          dsn.messageHookDisabled = false;
          try {
            await dsn.showForRoll(roll, game.user, true, null, false);
          } finally {
            dsn.messageHookDisabled = prev;
          }
        } else {
          await roll.toMessage({
            speaker: ChatMessage.getSpeaker(),
            flavor: "Dice test"
          });
        }
      } catch (err) {
        console.error("ILLUSIVE_DND | DSN test roll failed", err);
        ui.notifications?.error?.("Test roll failed.");
      } finally {
        overlay.style.pointerEvents = "";
        overlay.classList.add("visible");
        if (btn) btn.disabled = false;
      }
    };

    let done = false;
    const finish = async (save) => {
      if (done) return;
      done = true;
      if (!save) {
        overlay.remove();
        resolve(false);
        return;
      }
      try {
        await persistSettings();
        ui.notifications?.info?.("Dice appearance saved.");
        overlay.remove();
        resolve(true);
      } catch (err) {
        console.error("ILLUSIVE_DND | save DSN appearance failed", err);
        ui.notifications?.error?.("Could not save dice settings.");
        overlay.remove();
        resolve(false);
      }
    };

    overlay.addEventListener("pointerup", (ev) => {
      if (ev.target === overlay) void finish(false);
    });
    overlay.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("pointerup", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const action = btn.dataset.action;
        if (action === "apply") void finish(true);
        else if (action === "cancel") void finish(false);
        else if (action === "test") void runTestRoll();
      });
    });
    requestAnimationFrame(() => overlay.classList.add("visible"));
  });
}
