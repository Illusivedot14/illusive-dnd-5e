/**
 * Token aura PIXI paint. Flag persistence lives in foundry/token-aura.
 */

import {
  DEFAULT_AURA_COLOR,
  auraDrawRadiusPixels,
  readTokenAuras,
  writeTokenAuras as writeTokenAurasFoundry
} from "../../../foundry/token-aura.mjs";

export {
  MAX_AURAS,
  MAX_AURA_FEET,
  DEFAULT_AURA_COLOR,
  AURA_FEET_CHOICES,
  AURA_COLORS,
  clampAuraFeet,
  auraRadiusPixels,
  auraDrawRadiusPixels,
  readTokenAuras,
  isTokenAuraOn,
  unusedAuraColor
} from "../../../foundry/token-aura.mjs";

const GFX_NAME = "illusiveDndAura";
const FILL_ALPHA = 0.18;
const STROKE_ALPHA = 0.9;
const STROKE_WIDTH = 3;

function colorNumber(hex) {
  const Color = globalThis.Color ?? globalThis.foundry?.utils?.Color;
  if (typeof Color?.from === "function") {
    try {
      return Number(Color.from(hex));
    } catch {
      // fall through to parseInt
    }
  }
  const n = parseInt(String(hex).replace("#", ""), 16);
  return Number.isFinite(n) ? n : parseInt(DEFAULT_AURA_COLOR.slice(1), 16);
}

export async function writeTokenAuras(token, auras) {
  return writeTokenAurasFoundry(token, auras, paintTokenAura);
}

function findAuraGraphics(token) {
  return token.children?.find?.((child) => child?.name === GFX_NAME) ?? null;
}

function ensureAuraGraphics(token) {
  let gfx = findAuraGraphics(token);
  if (gfx) return gfx;

  const Graphics = globalThis.PIXI?.Graphics;
  if (typeof Graphics !== "function") return null;

  gfx = new Graphics();
  gfx.name = GFX_NAME;
  gfx.eventMode = "none";
  gfx.interactive = false;
  gfx.interactiveChildren = false;
  token.addChildAt(gfx, 0);
  return gfx;
}

function drawAuraCircle(gfx, x, y, radius, color) {
  if (!(radius > 0)) return;

  if (typeof gfx.circle === "function" && typeof gfx.fill === "function") {
    gfx.circle(x, y, radius).fill({ color, alpha: FILL_ALPHA });
    gfx.circle(x, y, radius).stroke({ width: STROKE_WIDTH, color, alpha: STROKE_ALPHA });
    return;
  }

  if (typeof gfx.lineStyle === "function" && typeof gfx.beginFill === "function") {
    gfx.lineStyle(STROKE_WIDTH, color, STROKE_ALPHA);
    gfx.beginFill(color, FILL_ALPHA);
    gfx.drawCircle(x, y, radius);
    gfx.endFill();
  }
}

const auraPaintKey = new WeakMap();

function auraPaintSignature(token, auras, visible) {
  if (!visible) return "off";
  const width = Number(token.w) || Number(token.document?.width) * Number(canvas?.grid?.size) || 0;
  const height = Number(token.h) || Number(token.document?.height) * Number(canvas?.grid?.size) || 0;
  const rings = auras.map((aura) => `${aura.feet}:${aura.color}`).join(",");
  return `${width}x${height}|${rings}`;
}

export function paintTokenAura(token) {
  if (!token || token.destroyed) return;
  if (!globalThis.PIXI?.Graphics) return;

  const auras = readTokenAuras(token.document);
  const visible = token.visible !== false && auras.length > 0;
  const signature = auraPaintSignature(token, auras, visible);
  let gfx = findAuraGraphics(token);
  if (auraPaintKey.get(token) === signature && (signature === "off" ? !gfx?.visible : gfx)) return;

  if (!visible) {
    if (gfx) {
      gfx.visible = false;
      gfx.clear();
    }
    auraPaintKey.set(token, signature);
    return;
  }

  gfx = ensureAuraGraphics(token);
  if (!gfx) return;

  const width = Number(token.w) || Number(token.document?.width) * Number(canvas?.grid?.size) || 0;
  const height = Number(token.h) || Number(token.document?.height) * Number(canvas?.grid?.size) || 0;
  const x = width / 2;
  const y = height / 2;

  gfx.clear();
  const rings = [...auras].sort((a, b) => b.feet - a.feet);
  for (const aura of rings) {
    drawAuraCircle(gfx, x, y, auraDrawRadiusPixels(aura.feet, token), colorNumber(aura.color));
  }
  gfx.visible = true;
  auraPaintKey.set(token, signature);

  const index = token.getChildIndex?.(gfx);
  if (Number.isFinite(index) && index > 0) token.addChildAt(gfx, 0);
}

export function paintAllTokenAuras() {
  const tokens = canvas?.tokens?.placeables ?? canvas?.tokens ?? [];
  for (const token of tokens) paintTokenAura(token);
}

export function bindTokenAuras() {
  Hooks.on("canvasReady", paintAllTokenAuras);
  Hooks.on("refreshToken", (token) => paintTokenAura(token));
  Hooks.on("updateToken", (doc) => paintTokenAura(doc?.object));
}
