/**
 * Display-sized portrait cache for HUD cards.
 * Uses Foundry's ImageHelper.createThumbnail so full-res art is not
 * decoded into ~88–170px portrait slots.
 *
 * Portrait crop uses top-aligned cover (dnd5e sheet `object-position: top`).
 * Token-mode crop uses contain (sheet `.portrait.token`).
 */

import {
  portraitCropForArtwork,
  resolvePortraitArtwork,
  resolvePortraitSrc
} from "../../foundry/actor-data.mjs";

const THUMB_SIZE = 128;

/** @type {Map<string, string>} */
const ready = new Map();
/** @type {Map<string, Promise<string>>} */
const pending = new Map();
const MAX_CACHE = 64;

/** @typedef {"top" | "center" | "contain"} PortraitCrop */

function cacheKey(src, crop) {
  return `${src}|${THUMB_SIZE}x${THUMB_SIZE}|${crop}`;
}

function remember(key, url) {
  if (ready.size >= MAX_CACHE) {
    const first = ready.keys().next().value;
    if (first) ready.delete(first);
  }
  ready.set(key, url);
  return url;
}

function getImageHelper() {
  return foundry?.helpers?.media?.ImageHelper
    ?? globalThis.ImageHelper
    ?? null;
}

/**
 * Cover-draw, top-aligned (sheet portrait mode).
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} img
 * @param {number} size
 * @param {number} iw
 * @param {number} ih
 */
function drawCoverTop(ctx, img, size, iw, ih) {
  const ir = iw / ih;
  let dw;
  let dh;
  let dx;
  let dy;
  if (ir > 1) {
    dh = size;
    dw = size * ir;
    dx = (size - dw) / 2;
    dy = 0;
  } else {
    dw = size;
    dh = size / ir;
    dx = 0;
    dy = 0;
  }
  ctx.drawImage(img, dx, dy, dw, dh);
}

/**
 * Cover-draw centered (legacy / generic).
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} img
 * @param {number} size
 * @param {number} iw
 * @param {number} ih
 */
function drawCoverCentered(ctx, img, size, iw, ih) {
  const ir = iw / ih;
  let dw;
  let dh;
  let dx;
  let dy;
  if (ir > 1) {
    dh = size;
    dw = size * ir;
    dx = (size - dw) / 2;
    dy = 0;
  } else {
    dw = size;
    dh = size / ir;
    dx = 0;
    dy = (size - dh) / 2;
  }
  ctx.drawImage(img, dx, dy, dw, dh);
}

/**
 * Letterbox into a square (sheet token portrait mode).
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} img
 * @param {number} size
 * @param {number} iw
 * @param {number} ih
 */
function drawContain(ctx, img, size, iw, ih) {
  const scale = Math.min(size / iw, size / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (size - dw) / 2;
  const dy = (size - dh) / 2;
  ctx.drawImage(img, 0, 0, iw, ih, dx, dy, dw, dh);
}

/**
 * @param {string} src
 * @param {PortraitCrop} crop
 * @returns {Promise<string>} data URL or original src on failure
 */
async function buildThumb(src, crop = "top") {
  const helper = getImageHelper();
  if (helper?.createThumbnail && crop !== "contain") {
    try {
      const result = await helper.createThumbnail(src, {
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        format: "image/webp",
        quality: 0.75,
        center: crop === "center"
      });
      if (result?.thumb) return result.thumb;
    } catch (err) {
      console.warn("illusive-dnd-5e | portrait thumb (ImageHelper) failed", src, err);
    }
  }

  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.decoding = "async";
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`load failed: ${src}`));
      el.src = src;
    });

    const canvas = document.createElement("canvas");
    canvas.width = THUMB_SIZE;
    canvas.height = THUMB_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return src;

    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (crop === "contain") drawContain(ctx, img, THUMB_SIZE, iw, ih);
    else if (crop === "center") drawCoverCentered(ctx, img, THUMB_SIZE, iw, ih);
    else drawCoverTop(ctx, img, THUMB_SIZE, iw, ih);

    return canvas.toDataURL("image/webp", 0.75);
  } catch (err) {
    console.warn("illusive-dnd-5e | portrait thumb (canvas) failed", src, err);
    return src;
  }
}

/** Sync hit from cache, else null. */
export function getCachedPortraitThumb(src, crop = "top") {
  if (!src) return "";
  return ready.get(cacheKey(src, crop)) ?? null;
}

/**
 * Set an <img> to a display-sized thumb (async if not cached).
 * @param {HTMLImageElement} el
 * @param {string} src
 * @param {string} [alt]
 * @param {{ crop?: PortraitCrop }} [options]
 */
export function applyPortraitSrc(el, src, alt = "", { crop = "top" } = {}) {
  if (!(el instanceof HTMLImageElement)) return;
  if (alt) el.alt = alt;
  if (!src) {
    el.removeAttribute("src");
    delete el.dataset.fullSrc;
    delete el.dataset.portraitCrop;
    return;
  }

  el.dataset.portraitCrop = crop;
  const cached = getCachedPortraitThumb(src, crop);
  if (cached) {
    if (el.getAttribute("src") !== cached) el.src = cached;
    el.dataset.fullSrc = src;
    return;
  }

  el.dataset.fullSrc = src;
  void resolvePortraitThumb(src, crop).then((thumb) => {
    if (el.dataset.fullSrc !== src || el.dataset.portraitCrop !== crop) return;
    const next = thumb || src;
    if (el.getAttribute("src") !== next) el.src = next;
  });
}

function syncPortraitFrameClasses(el, isToken) {
  const frame = el.closest(
    ".illusive-dnd-turn-portrait, .illusive-dnd-portrait-card, .illusive-dnd-mock-portrait-block, .illusive-dnd-full-portrait-block"
  );
  if (!frame) return;
  frame.classList.toggle("illusive-dnd-portrait-token-art", isToken);
  frame.classList.toggle("illusive-dnd-portrait-avatar-art", !isToken);
}

/**
 * Resolve sheet artwork for an actor, then thumb it for HUD display.
 * @param {HTMLImageElement} el
 * @param {Actor|null|undefined} actor
 * @param {{ alt?: string, fallbackSrc?: string }} [options]
 */
export function applyActorPortrait(el, actor, { alt = "", fallbackSrc = "" } = {}) {
  if (!(el instanceof HTMLImageElement)) return;
  if (alt) el.alt = alt;

  const syncIsToken = actor?.getFlag?.("dnd5e", "showTokenPortrait") === true;
  const syncSrc = actor ? resolvePortraitSrc(actor) : (fallbackSrc || "");
  const syncCrop = portraitCropForArtwork(syncIsToken);
  if (syncSrc) applyPortraitSrc(el, syncSrc, alt, { crop: syncCrop });
  syncPortraitFrameClasses(el, syncIsToken);

  if (!actor) return;

  const job = `${actor.id}:${performance.now()}`;
  el.dataset.portraitJob = job;

  void resolvePortraitArtwork(actor).then(({ src, isToken }) => {
    if (el.dataset.portraitJob !== job) return;
    const crop = portraitCropForArtwork(isToken);
    applyPortraitSrc(el, src, alt, { crop });
    syncPortraitFrameClasses(el, isToken);
  });
}

/**
 * Resolve a display-sized data URL for `src` (cached).
 * @param {string} src
 * @param {PortraitCrop} [crop]
 * @returns {Promise<string>}
 */
export function resolvePortraitThumb(src, crop = "top") {
  if (!src) return Promise.resolve("");
  const key = cacheKey(src, crop);
  const hit = ready.get(key);
  if (hit) return Promise.resolve(hit);

  let job = pending.get(key);
  if (!job) {
    job = buildThumb(src, crop).then((url) => {
      pending.delete(key);
      return remember(key, url);
    }, (err) => {
      pending.delete(key);
      throw err;
    });
    pending.set(key, job);
  }
  return job;
}
