import { illusiveDnd } from "../i18n/index.mjs";
import { MODULE_ID } from "../constants.mjs";

const SAVED_LIGHT_FLAG = "savedLight";
const CUSTOM_LIGHT_FLAG = "customLight";

/** Player-facing light presets (no Token Config required). */
export const LIGHT_PRESETS = Object.freeze({
  torch: {
    id: "torch",
    bright: 20,
    dim: 40,
    color: "#fabb66",
    alpha: 0.45,
    animation: { type: "torch", speed: 2, intensity: 3, reverse: false }
  },
  lantern: {
    id: "lantern",
    bright: 30,
    dim: 60,
    color: "#ffdd99",
    alpha: 0.4,
    animation: { type: "torch", speed: 1, intensity: 2, reverse: false }
  },
  candle: {
    id: "candle",
    bright: 5,
    dim: 10,
    color: "#ffaa55",
    alpha: 0.35,
    animation: { type: "torch", speed: 3, intensity: 2, reverse: false }
  },
  off: {
    id: "off",
    bright: 0,
    dim: 0
  }
});

function canUpdateTokenDocument(doc) {
  if (!doc || !game.user) return false;
  if (game.user.isGM) return true;
  if (typeof doc.canUserModify === "function") return doc.canUserModify(game.user, "update");
  return Boolean(doc.isOwner);
}

/** True when the token currently emits light (Foundry has no light.enabled anymore). */
export function isTokenLightOn(token) {
  const light = token?.document?.light;
  return (Number(light?.bright) || 0) > 0 || (Number(light?.dim) || 0) > 0;
}

function lightRadii(light) {
  return {
    bright: Number(light?.bright) || 0,
    dim: Number(light?.dim) || 0
  };
}

function readRadiiFlag(doc, flag) {
  const saved = doc.getFlag?.(MODULE_ID, flag);
  if (!saved || typeof saved !== "object") return null;
  const bright = Number(saved.bright) || 0;
  const dim = Number(saved.dim) || 0;
  if (bright <= 0 && dim <= 0) return null;
  return {
    bright,
    dim,
    color: saved.color ?? null,
    alpha: Number.isFinite(Number(saved.alpha)) ? Number(saved.alpha) : null,
    animation: saved.animation ?? null
  };
}

function matchesRadii(a, b) {
  return (Number(a?.bright) || 0) === (Number(b?.bright) || 0)
    && (Number(a?.dim) || 0) === (Number(b?.dim) || 0);
}

function isNamedPresetRadii(radii) {
  return Object.values(LIGHT_PRESETS).some(
    (preset) => preset.id !== "off" && matchesRadii(preset, radii)
  );
}

function snapshotLight(doc) {
  const light = doc.light ?? {};
  const radii = lightRadii(light);
  if (radii.bright <= 0 && radii.dim <= 0) return null;
  return {
    ...radii,
    color: light.color ?? null,
    alpha: Number.isFinite(Number(light.alpha)) ? Number(light.alpha) : null,
    animation: light.animation
      ? {
        type: light.animation.type ?? null,
        speed: Number(light.animation.speed) || 5,
        intensity: Number(light.animation.intensity) || 5,
        reverse: Boolean(light.animation.reverse)
      }
      : null
  };
}

async function rememberLight(doc, snapshot) {
  if (!snapshot) return;
  await doc.setFlag(MODULE_ID, SAVED_LIGHT_FLAG, {
    bright: snapshot.bright,
    dim: snapshot.dim
  });
  if (!isNamedPresetRadii(snapshot)) {
    await doc.setFlag(MODULE_ID, CUSTOM_LIGHT_FLAG, snapshot);
  }
}

function resolveCustomLight(doc) {
  const flagged = readRadiiFlag(doc, CUSTOM_LIGHT_FLAG);
  if (flagged) return flagged;

  const current = snapshotLight(doc);
  if (current && !isNamedPresetRadii(current)) return current;

  const saved = readRadiiFlag(doc, SAVED_LIGHT_FLAG);
  if (saved && !isNamedPresetRadii(saved)) return saved;

  return null;
}

function presetMatchesLight(preset, light) {
  return matchesRadii(preset, lightRadii(light));
}

/** Choices for the light-source dropdown. */
export function collectLightPresetChoices(token) {
  const doc = token?.document;
  const light = doc?.light;
  const on = isTokenLightOn(token);
  const custom = resolveCustomLight(doc);
  const customActive = Boolean(on && custom && matchesRadii(custom, lightRadii(light)));

  return [
    {
      id: "torch",
      label: illusiveDnd.actionBar("lightPresetTorch"),
      meta: "20 / 40",
      isActive: on && presetMatchesLight(LIGHT_PRESETS.torch, light)
    },
    {
      id: "lantern",
      label: illusiveDnd.actionBar("lightPresetLantern"),
      meta: "30 / 60",
      isActive: on && presetMatchesLight(LIGHT_PRESETS.lantern, light)
    },
    {
      id: "candle",
      label: illusiveDnd.actionBar("lightPresetCandle"),
      meta: "5 / 10",
      isActive: on && presetMatchesLight(LIGHT_PRESETS.candle, light)
    },
    {
      id: "custom",
      label: illusiveDnd.actionBar("lightPresetCustom"),
      meta: custom ? `${custom.bright} / ${custom.dim}` : illusiveDnd.actionBar("lightPresetCustomSet"),
      isActive: customActive
    },
    {
      id: "off",
      label: illusiveDnd.actionBar("lightPresetOff"),
      meta: null,
      isActive: !on
    }
  ];
}

function seedCustomFormValues(doc) {
  const custom = resolveCustomLight(doc);
  if (custom) {
    return {
      bright: custom.bright,
      dim: custom.dim,
      color: custom.color || "#fabb66"
    };
  }
  const current = lightRadii(doc.light);
  if (current.bright > 0 || current.dim > 0) {
    return {
      bright: current.bright,
      dim: current.dim,
      color: doc.light?.color || "#fabb66"
    };
  }
  return { bright: 20, dim: 40, color: "#fabb66" };
}

/** Prompt anyone who can update the token for custom bright / dim / color. */
export async function promptCustomLight(token) {
  const doc = token?.document;
  if (!doc) return null;
  if (!canUpdateTokenDocument(doc)) {
    ui.notifications.warn(illusiveDnd.warning("noOwner"));
    return null;
  }

  const seed = seedCustomFormValues(doc);
  const content = `
    <form class="illusive-dnd-light-custom-form flexcol">
      <p class="notes">${illusiveDnd.actionBar("lightCustomPrompt")}</p>
      <div class="form-group">
        <label>${illusiveDnd.actionBar("lightCustomBright")}</label>
        <input type="number" name="bright" value="${seed.bright}" min="0" step="1" autofocus>
      </div>
      <div class="form-group">
        <label>${illusiveDnd.actionBar("lightCustomDim")}</label>
        <input type="number" name="dim" value="${seed.dim}" min="0" step="1">
      </div>
      <div class="form-group">
        <label>${illusiveDnd.actionBar("lightCustomColor")}</label>
        <input type="color" name="color" value="${seed.color}">
      </div>
    </form>
  `;

  return new Promise((resolve) => {
    const dialog = new foundry.applications.api.DialogV2({
      window: {
        title: illusiveDnd.actionBar("lightPresetCustom"),
        icon: "fas fa-lightbulb"
      },
      content,
      buttons: [
        {
          action: "cancel",
          icon: "fas fa-times",
          label: illusiveDnd.ui("cancel"),
          callback: () => resolve(null)
        },
        {
          action: "submit",
          icon: "fas fa-check",
          label: illusiveDnd.actionBar("lightCustomApply"),
          default: true,
          callback: async (_event, _button, dlg) => {
            const form = dlg.element.querySelector("form");
            const data = new foundry.applications.ux.FormDataExtended(form).object;
            const bright = Math.max(0, Math.floor(Number(data.bright) || 0));
            const dim = Math.max(0, Math.floor(Number(data.dim) || 0));
            const color = typeof data.color === "string" && data.color ? data.color : "#fabb66";
            if (bright <= 0 && dim <= 0) {
              ui.notifications.warn(illusiveDnd.actionBar("lightCustomInvalid"));
              return false;
            }
            resolve({
              bright,
              dim,
              color,
              alpha: 0.45,
              animation: { type: "torch", speed: 2, intensity: 3, reverse: false }
            });
            return true;
          }
        }
      ],
      close: () => resolve(null)
    });
    dialog.render(true);
  });
}

async function applyCustomLight(doc, custom) {
  const update = {
    "light.bright": custom.bright,
    "light.dim": custom.dim
  };
  if (custom.color != null) update["light.color"] = custom.color;
  if (custom.alpha != null) update["light.alpha"] = custom.alpha;
  if (custom.animation) update["light.animation"] = custom.animation;

  await doc.setFlag(MODULE_ID, SAVED_LIGHT_FLAG, {
    bright: custom.bright,
    dim: custom.dim
  });
  await doc.setFlag(MODULE_ID, CUSTOM_LIGHT_FLAG, custom);
  await doc.update(update);
  return true;
}

/**
 * Apply a named light preset to the token.
 * Owners can do this without Token Config permission.
 * @param {{ promptCustom?: (token: object) => Promise<object|null> }} [options]
 */
export async function applyLightPreset(token, presetId, options = {}) {
  const doc = token?.document;
  if (!doc) return false;
  if (!canUpdateTokenDocument(doc)) {
    ui.notifications.warn(illusiveDnd.warning("noOwner"));
    return false;
  }

  if (presetId === "custom") {
    const prompt = options.promptCustom ?? promptCustomLight;
    const custom = await prompt(token);
    if (!custom) return false;
    return applyCustomLight(doc, custom);
  }

  const preset = LIGHT_PRESETS[presetId];
  if (!preset) return false;

  const current = snapshotLight(doc);

  if (preset.id === "off") {
    await rememberLight(doc, current);
    await doc.update({
      "light.bright": 0,
      "light.dim": 0,
      "light.animation.type": null
    });
    return true;
  }

  await doc.setFlag(MODULE_ID, SAVED_LIGHT_FLAG, {
    bright: preset.bright,
    dim: preset.dim
  });
  await doc.update({
    "light.bright": preset.bright,
    "light.dim": preset.dim,
    "light.color": preset.color,
    "light.alpha": preset.alpha,
    "light.animation": preset.animation
  });
  return true;
}

/** Fallback Off↔last radii (or torch). Prefer the preset dropdown. */
export async function toggleTokenLight(token) {
  const doc = token?.document;
  if (!doc) return false;
  if (!canUpdateTokenDocument(doc)) {
    ui.notifications.warn(illusiveDnd.warning("noOwner"));
    return false;
  }

  const current = snapshotLight(doc);
  if (current) return applyLightPreset(token, "off");

  const custom = resolveCustomLight(doc);
  if (custom) return applyCustomLight(doc, custom);

  const saved = readRadiiFlag(doc, SAVED_LIGHT_FLAG);
  if (saved) {
    await doc.update({ "light.bright": saved.bright, "light.dim": saved.dim });
    return true;
  }

  return applyLightPreset(token, "torch");
}
