/**
 * Per-player mobile UI theme (client setting → full CSS variable palette).
 */

import { MODULE_ID } from "../../../constants.mjs";

const DEFAULT_ACCENT = "#b794f6";

function normalizeHex(value) {
  const raw = String(value ?? "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const [, a, b, c] = raw;
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase();
  }
  return null;
}

function hexToRgb(hex) {
  const n = normalizeHex(hex);
  if (!n) return { r: 183, g: 148, b: 246 };
  return {
    r: parseInt(n.slice(1, 3), 16),
    g: parseInt(n.slice(3, 5), 16),
    b: parseInt(n.slice(5, 7), 16)
  };
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p, q, t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
  };
}

function rgbToHex({ r, g, b }) {
  const h = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function rgba(r, g, b, a) {
  return `rgba(${r},${g},${b},${a})`;
}

/** Build a complete dark UI palette from one accent hue. */
export function buildMobileTheme(accentHex) {
  const hex = normalizeHex(accentHex) ?? DEFAULT_ACCENT;
  const rgb = hexToRgb(hex);
  const { h, s } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  // White/black/grey are achromatic (s≈0, h=0). Never force saturation — that
  // used to turn them into a red-tinted UI (hue 0 + fake sat).
  const achromatic = s < 0.035;
  const sat = achromatic ? 0 : Math.min(0.62, Math.max(0.28, s));
  const tone = (ss, ll) => hslToRgb(h, ss, ll);
  const toneHex = (ss, ll) => rgbToHex(tone(ss, ll));

  const bgPrimary = tone(sat * 0.55, 0.08);
  const bgSecondary = tone(sat * 0.58, 0.13);
  const btnBg = tone(sat * 0.6, 0.17);
  const textPrimary = tone(Math.min(0.35, sat * 0.45), 0.95);
  const textSecondary = tone(Math.min(0.4, sat * 0.5), 0.72);
  const textMuted = tone(Math.min(0.35, sat * 0.45), 0.52);
  const pageBg = tone(sat * 0.5, 0.06);
  const shadow = tone(sat * 0.4, 0.04);

  // Near-black accents disappear on a dark UI — use light greys for chrome.
  // Near-white accents keep full white for highlights.
  const accentRgb = achromatic && rgb.r + rgb.g + rgb.b < 96
    ? { r: 220, g: 220, b: 220 }
    : rgb;

  return {
    hex,
    r: accentRgb.r,
    g: accentRgb.g,
    b: accentRgb.b,
    vars: {
      "--mobile-accent": achromatic && rgb.r + rgb.g + rgb.b < 96 ? rgbToHex(accentRgb) : hex,
      "--mobile-accent-70": rgba(accentRgb.r, accentRgb.g, accentRgb.b, 0.7),
      "--mobile-accent-50": rgba(accentRgb.r, accentRgb.g, accentRgb.b, 0.5),
      "--mobile-accent-45": rgba(accentRgb.r, accentRgb.g, accentRgb.b, 0.45),
      "--mobile-accent-20": rgba(accentRgb.r, accentRgb.g, accentRgb.b, 0.22),
      "--mobile-accent-10": rgba(accentRgb.r, accentRgb.g, accentRgb.b, 0.12),
      "--mobile-border": rgba(accentRgb.r, accentRgb.g, accentRgb.b, 0.28),
      "--mobile-btn-border": rgba(accentRgb.r, accentRgb.g, accentRgb.b, 0.4),
      "--mobile-btn-bg-subtle": rgba(accentRgb.r, accentRgb.g, accentRgb.b, 0.14),
      "--mobile-bg-primary": toneHex(sat * 0.55, 0.08),
      "--mobile-bg-secondary": toneHex(sat * 0.58, 0.13),
      "--mobile-bg-tertiary": rgba(accentRgb.r, accentRgb.g, accentRgb.b, 0.14),
      "--mobile-bg-button": rgba(accentRgb.r, accentRgb.g, accentRgb.b, 0.12),
      "--mobile-bg-button-active": rgba(accentRgb.r, accentRgb.g, accentRgb.b, 0.24),
      "--mobile-btn-bg": toneHex(sat * 0.6, 0.17),
      "--mobile-text-primary": toneHex(Math.min(0.35, sat * 0.45), 0.95),
      "--mobile-text-secondary": toneHex(Math.min(0.4, sat * 0.5), 0.72),
      "--mobile-text-muted": toneHex(Math.min(0.35, sat * 0.45), 0.52),
      "--mobile-shadow": rgba(shadow.r, shadow.g, shadow.b, 0.45),
      "--mobile-shadow-strong": rgba(shadow.r, shadow.g, shadow.b, 0.7),
      "--mobile-page-bg": toneHex(sat * 0.5, 0.06),
      "--mobile-page-bg-rgb": `${pageBg.r}, ${pageBg.g}, ${pageBg.b}`
    }
  };
}

export function getMobileAccentColor() {
  try {
    return normalizeHex(game.settings.get(MODULE_ID, "mobileAccentColor")) ?? DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}

export function applyMobileAccentColor(color = getMobileAccentColor()) {
  const theme = buildMobileTheme(color);
  const targets = [
    document.documentElement,
    document.body,
    document.getElementById("illusive-dnd-mobile-sheet-root"),
    document.getElementById("illusive-dnd-mobile-carousel"),
    document.getElementById("illusive-dnd-mobile-nocanvas-bg"),
    document.getElementById("illusive-dnd-mobile-move"),
    document.getElementById("illusive-dnd-mobile-dice-roller")
  ];
  for (const el of targets) {
    if (!el) continue;
    for (const [key, value] of Object.entries(theme.vars)) {
      el.style.setProperty(key, value);
    }
  }
  return theme.hex;
}

export async function setMobileAccentColor(color) {
  const hex = normalizeHex(color) ?? DEFAULT_ACCENT;
  await game.settings.set(MODULE_ID, "mobileAccentColor", hex);
  applyMobileAccentColor(hex);
  return hex;
}

export { DEFAULT_ACCENT as MOBILE_ACCENT_DEFAULT };
