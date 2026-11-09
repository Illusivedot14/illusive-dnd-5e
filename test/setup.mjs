/**
 * Global stubs that must exist *at module-evaluation time*.
 *
 * Several source modules touch Foundry globals while the module body runs — most
 * importantly `common/i18n/settings-ui.mjs` declares `class IllusiveDndSubsettingsForm
 * extends FormApplication`, which is re-exported through the `i18n.mjs` barrel and
 * therefore pulled in by almost every module. If `FormApplication` (and friends)
 * are undefined when that class is defined, the import throws.
 *
 * Per-test runtime state (game/CONFIG/canvas/ui + settings) is installed by
 * `installFoundry()` in test/helpers.mjs.
 */
import { vi } from "vitest";

// Foundry augments the JS `Math` object with a few helpers.
if (typeof Math.clamp !== "function") {
  Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}

class FormApplication {
  constructor(object = {}, options = {}) {
    this.object = object;
    this.options = options;
  }
  static get defaultOptions() {
    return {};
  }
  activateListeners() {}
}
globalThis.FormApplication = FormApplication;

globalThis.Hooks = {
  on: vi.fn(),
  once: vi.fn(),
  off: vi.fn(),
  call: vi.fn(),
  callAll: vi.fn()
};

globalThis.foundry = {
  utils: {
    mergeObject: (target, source = {}) => ({ ...target, ...source }),
    fetchJsonWithTimeout: vi.fn(async () => ({})),
    randomID: () => Math.random().toString(36).slice(2, 12),
    getProperty: (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj)
  },
  applications: {
    handlebars: {
      loadTemplates: vi.fn(async () => {}),
      renderTemplate: vi.fn(async () => "")
    },
    api: {
      DialogV2: {
        confirm: vi.fn(async () => true),
        prompt: vi.fn(async () => null)
      }
    },
    ux: {
      FormDataExtended: class {
        constructor() {
          this.object = {};
        }
      },
      ContextMenu: class {
        constructor() {}
      }
    },
    apps: {
      CombatTrackerConfig: class {
        render() {}
      }
    }
  }
};

// Foundry adds Number.isNumeric.
if (typeof Number.isNumeric !== "function") {
  Number.isNumeric = (value) =>
    value !== "" && value !== null && value !== undefined && !Number.isNaN(Number(value));
}
