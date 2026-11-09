import { MODULE_ID, MODULE_PATH } from "../constants.mjs";
import { illusiveDnd } from "./catalog.mjs";
import { illusiveDndMenu, illusiveDndSetting } from "./labels.mjs";

const MODULE_KEY_RE = /illusive-dnd-5e\./;

const MENU_KEYS = {
  displayMenu: "display",
  partyMenu: "party",
  turnTrackerMenu: "turnTracker",
  actionBarMenu: "actionBar",
  bossBarMenu: "bossBar",
  cameraPadMenu: "cameraPad",
  mobileMenu: "mobile"
};

/** Desired main-config order: enable checkbox, then its settings menu. */
const MAIN_CONFIG_ORDER = [
  "displayMenu",
  "enablePartyStatus",
  "partyMenu",
  "enableTurnTracker",
  "turnTrackerMenu",
  "enableActionBar",
  "actionBarMenu",
  "enableBossBar",
  "bossBarMenu",
  "bossBarStyleConfiguration",
  "enableCameraPad",
  "cameraPadMenu",
  "enableMobileSheet",
  "mobileMenu"
];

let settingsPatchBound = false;

function patchElementText(el, text) {
  if (!el || !text) return;
  if (el.textContent !== text) el.textContent = text;
}

function patchSettingsFormGroup(formGroup, settingKey) {
  if (!formGroup) return;
  patchElementText(formGroup.querySelector(":scope > label"), illusiveDndSetting(settingKey, "name"));
  patchElementText(formGroup.querySelector(".hint, .notes"), illusiveDndSetting(settingKey, "hint"));

  const select = formGroup.querySelector("select");
  if (select) {
    for (const option of select.options) {
      option.textContent = illusiveDndSetting(settingKey, option.value);
    }
  }
}

function patchMenuFormGroup(formGroup, menuKey) {
  if (!formGroup) return;
  const button = formGroup.querySelector("button");
  patchElementText(formGroup.querySelector(":scope > label"), illusiveDndMenu(menuKey, "name"));
  patchElementText(formGroup.querySelector(".hint, .notes"), illusiveDndMenu(menuKey, "hint"));
  if (button) {
    const icon = button.querySelector("i");
    button.innerHTML = `${icon?.outerHTML ?? ""} ${illusiveDndMenu(menuKey, "label")}`.trim();
  }
}

function findFormGroupForKey(root, key) {
  const input = root.querySelector(`[name="${MODULE_ID}.${key}"]`);
  if (input) return input.closest(".form-group, fieldset, .form-group-stacked, [data-setting-id]");

  const button = root.querySelector(`button[data-key="${key}"]`)
    ?? root.querySelector(`button[data-menu="${MODULE_ID}.${key}"]`)
    ?? root.querySelector(`button[data-action="menu"][data-key="${key}"]`);
  if (button) return button.closest(".form-group, fieldset, .form-group-stacked, [data-setting-id]");

  // Foundry v14 sometimes nests menu id differently
  for (const btn of root.querySelectorAll("button")) {
    if (btn.dataset.key === key || btn.dataset.menu?.endsWith(`.${key}`) || btn.dataset.menu === key) {
      return btn.closest(".form-group, fieldset, .form-group-stacked, [data-setting-id]");
    }
  }
  return null;
}

/**
 * Foundry lists all menus then all settings. Move our rows into one list as:
 * [] enable / [menu] / [] enable / [menu]
 */
function reorderMainConfig(root) {
  const keyed = MAIN_CONFIG_ORDER
    .map((key) => ({ key, group: findFormGroupForKey(root, key) }))
    .filter((entry) => entry.group);
  if (keyed.length < 2) return;

  // Anchor in the settings column (where enable checkboxes live)
  const host = (
    keyed.find((entry) => entry.key.startsWith("enable"))?.group
    ?? keyed[0].group
  ).parentElement;
  if (!host) return;

  const marker = document.createComment("illusive-dnd-settings-order");
  const first = keyed[0].group;
  host.insertBefore(marker, first);

  for (const { group } of keyed) {
    host.insertBefore(group, marker);
  }
  marker.remove();
}

export function bindI18nHooks() {
  if (settingsPatchBound) return;
  settingsPatchBound = true;

  Hooks.on("renderSettingsConfig", (_app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;

    for (const input of root.querySelectorAll(`[name^="${MODULE_ID}."]`)) {
      const settingKey = input.getAttribute("name").slice(MODULE_ID.length + 1);
      patchSettingsFormGroup(input.closest(".form-group"), settingKey);
    }

    for (const [menuId, menuKey] of Object.entries(MENU_KEYS)) {
      const button = root.querySelector(`button[data-key="${menuId}"]`)
        ?? root.querySelector(`button[data-menu="${MODULE_ID}.${menuId}"]`);
      if (button) patchMenuFormGroup(button.closest(".form-group"), menuKey);
    }

    root.querySelectorAll(".form-group").forEach((formGroup) => {
      if (!MODULE_KEY_RE.test(formGroup.textContent ?? "")) return;
      const button = formGroup.querySelector("button");
      if (!button) return;
      for (const [menuId, menuKey] of Object.entries(MENU_KEYS)) {
        if (button.dataset.key === menuId || button.dataset.menu?.endsWith(menuId)) {
          patchMenuFormGroup(formGroup, menuKey);
        }
      }
    });

    reorderMainConfig(root);
  });
}

function listWorldUsers() {
  return [...(game.users ?? [])];
}

function cameraPadUserChoices(value) {
  const users = listWorldUsers();
  let selected;
  if (Array.isArray(value)) selected = new Set(value);
  else if (value === "gm") selected = new Set(users.filter((user) => user.isGM).map((user) => user.id));
  else if (value === "all") selected = new Set(users.map((user) => user.id));
  else {
    selected = new Set(
      users
        .filter((user) => String(user.name ?? "").trim().toLowerCase() === "touchscreen")
        .map((user) => user.id)
    );
  }

  return users
    .map((user) => ({ id: user.id, name: user.name, selected: selected.has(user.id) }))
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
}

function submittedIdList(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (raw && typeof raw === "object") {
    return Object.entries(raw)
      .filter(([, on]) => Boolean(on))
      .map(([id]) => id);
  }
  return [];
}

export function buildSettingField(key) {
  const registered = game.settings.settings.get(`${MODULE_ID}.${key}`);
  if (!registered) return null;
  // World-scoped settings are GM-only; hide them from players' per-client submenus.
  if (registered.scope === "world" && !game.user.isGM) return null;

  const value = game.settings.get(MODULE_ID, key);
  const hasChoices = Boolean(registered.choices);
  const isUserList = registered.type === Array && key === "cameraPadVisibleTo";
  const isBoolean = registered.type === Boolean;
  const isNumber = registered.type === Number;
  const isSelect = registered.type === String && hasChoices;
  const isFile = registered.type === String && !hasChoices && Boolean(registered.filePicker);
  const isColor = registered.type === String && !hasChoices && !isFile
    && (key.toLowerCase().includes("color") || /^#[0-9a-fA-F]{6}$/i.test(String(registered.default ?? "")));
  const isString = registered.type === String && !hasChoices && !isFile && !isColor && !isUserList;

  const field = {
    key,
    name: illusiveDndSetting(key, "name"),
    hint: illusiveDndSetting(key, "hint"),
    value: value ?? registered.default ?? "",
    isBoolean,
    isNumber,
    isSelect,
    isFile,
    isColor,
    isString,
    isUserList,
    filePickerType: typeof registered.filePicker === "string" ? registered.filePicker : "image"
  };

  if (isUserList) {
    field.users = cameraPadUserChoices(value);
    field.empty = illusiveDndSetting(key, "empty");
  }

  if (field.isNumber && registered.range) {
    field.range = {
      min: registered.range.min ?? 0,
      max: registered.range.max ?? 100,
      step: registered.range.step ?? 1
    };
  }

  if (field.isSelect) {
    field.choices = Object.fromEntries(
      Object.keys(registered.choices).map((choiceKey) => [choiceKey, illusiveDndSetting(key, choiceKey)])
    );
  }

  if (field.isColor) {
    field.value = String(field.value || registered.default || "#000000");
  }

  return field;
}

export class IllusiveDndSubsettingsForm extends FormApplication {
  constructor(settingKeys, options = {}) {
    super({}, options);
    this._keys = settingKeys;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["illusive-dnd-subsettings"],
      width: 520,
      height: "auto",
      closeOnSubmit: true
    });
  }

  get title() {
    return this.options.windowTitle ?? illusiveDnd.t("settings.menus.configure");
  }

  get template() {
    return `${MODULE_PATH}/src/hud/templates/settings-submenu.hbs`;
  }

  getData() {
    return {
      fields: this._keys.map(buildSettingField).filter(Boolean),
      saveLabel: illusiveDnd.t("settings.menus.save")
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find('input[type="range"]').on("input", (event) => {
      const output = event.target.nextElementSibling;
      if (output?.classList.contains("range-value")) output.textContent = event.target.value;
    });

    html.find('[data-action="file-picker"]').on("click", async (event) => {
      event.preventDefault();
      const btn = event.currentTarget;
      const target = btn.dataset.target;
      const type = btn.dataset.type || "image";
      const input = html.find(`[name="${target}"]`)[0];
      if (!input) return;

      const Picker = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
      if (!Picker) return;
      const fp = new Picker({
        type,
        current: input.value || "",
        callback: (path) => {
          input.value = path;
        }
      });
      if (typeof fp.browse === "function") await fp.browse(input.value || "");
      else fp.render?.(true);
    });
  }

  async _updateObject(_event, formData) {
    for (const key of this._keys) {
      const registered = game.settings.settings.get(`${MODULE_ID}.${key}`);
      if (!registered) continue;
      if (registered.scope === "world" && !game.user.isGM) continue;

      if (registered.type === Boolean) {
        await game.settings.set(MODULE_ID, key, Boolean(formData[key]));
        continue;
      }

      if (registered.type === Array) {
        await game.settings.set(MODULE_ID, key, submittedIdList(formData[key]));
        continue;
      }

      if (!(key in formData)) continue;
      let value = formData[key];
      if (registered.type === Number) value = Number(value);
      await game.settings.set(MODULE_ID, key, value);
    }
  }
}

export function registerSettingsSubmenu(menuKey, { menuId, titleKey, icon, settingKeys, restricted = false }) {
  const MenuClass = class extends IllusiveDndSubsettingsForm {
    constructor() {
      super(settingKeys, { windowTitle: illusiveDnd.t(titleKey) });
    }
  };

  game.settings.registerMenu(MODULE_ID, menuKey, {
    name: illusiveDndMenu(menuId, "name"),
    label: illusiveDndMenu(menuId, "label"),
    hint: illusiveDndMenu(menuId, "hint"),
    icon: icon ?? "fas fa-sliders",
    restricted,
    type: MenuClass
  });
}
