import { MODULE_ID } from "../../constants.mjs";
import { settingOn } from "./hud-settings.mjs";
import { isTouchTableClient } from "./hooks/touch-table.mjs";
import { applyEarlyMobileBootClass, isOversizedDisplay, isPhoneOrTablet, persistMobileBootFlag } from "./mobile-boot.mjs";

const RELOAD_GUARD = "illusive-dnd-mobile-client-reload";

/** Phones and tablets. A Windows touch table is still a desktop canvas. */
export function isNativeMobile() {
  return isPhoneOrTablet();
}

/**
 * Sheet-only on phones and tablets.
 * GM, the Touchscreen user, and any display larger than a tablet keep the canvas.
 */
export function detectMobileDevice() {
  if (isOversizedDisplay()) return false;

  const mode = getMobileClientMode();
  if (mode === "forceMobile") return true;
  if (mode === "forceDesktop") return false;

  const user = game.user;
  if (user) {
    if (user.isGM || isTouchTableClient()) return false;
    return isNativeMobile();
  }

  return isNativeMobile();
}

export function getMobileClientMode() {
  try {
    return game.settings.get(MODULE_ID, "mobileClientMode") ?? "auto";
  } catch {
    return "auto";
  }
}

export function isMobileClient() {
  return detectMobileDevice();
}

export function isIllusiveMobileMode() {
  return settingOn("enableMobileSheet") && isMobileClient();
}

export function desktopHudEnabled() {
  return !isIllusiveMobileMode();
}

function applyBodyClass(active) {
  persistMobileBootFlag(active);
}

/** Returns true when a reload was triggered. */
export async function syncMobileClientSettings() {
  if (!game.settings) return false;

  const wantNoCanvas = isIllusiveMobileMode();
  applyBodyClass(wantNoCanvas);

  let haveNoCanvas = false;
  try {
    haveNoCanvas = game.settings.get("core", "noCanvas") === true;
  } catch {
    return false;
  }

  let managed = false;
  try {
    managed = game.settings.get(MODULE_ID, "illusiveDndManagedNoCanvas") === true;
  } catch {
    managed = false;
  }

  // Already correct
  if (wantNoCanvas === haveNoCanvas) {
    if (wantNoCanvas && !managed) {
      try { await game.settings.set(MODULE_ID, "illusiveDndManagedNoCanvas", true); } catch { /* ignore */ }
    }
    sessionStorage.removeItem(RELOAD_GUARD);
    return false;
  }

  // Enter sheets-only: set noCanvas and reload.
  if (wantNoCanvas && !haveNoCanvas) {
    const guard = sessionStorage.getItem(RELOAD_GUARD);
    if (guard === "enter") {
      // Previous reload did not stick — clear guard and try once more
      sessionStorage.removeItem(RELOAD_GUARD);
    }
    try {
      // Sticky boot flag BEFORE reload so the next paint never shows desktop chrome
      persistMobileBootFlag(true);
      await game.settings.set("core", "noCanvas", true);
      await game.settings.set(MODULE_ID, "illusiveDndManagedNoCanvas", true);
      try {
        await game.settings.set("core", "performanceMode", 0);
        await game.settings.set("core", "maxFPS", 30);
        await game.settings.set("core", "lightAnimation", false);
        await game.settings.set("core", "visionAnimation", false);
      } catch { /* optional core knobs */ }
      sessionStorage.setItem(RELOAD_GUARD, "enter");
      window.location.reload();
      return true;
    } catch (err) {
      console.error(`${MODULE_ID} | failed to enable noCanvas`, err);
      return false;
    }
  }

  // Desktop always gets the map back, even if some other client left noCanvas on.
  if (!wantNoCanvas && haveNoCanvas) {
    try {
      persistMobileBootFlag(false);
      await game.settings.set("core", "noCanvas", false);
      await game.settings.set(MODULE_ID, "illusiveDndManagedNoCanvas", false);
      sessionStorage.setItem(RELOAD_GUARD, "leave");
      window.location.reload();
      return true;
    } catch (err) {
      console.error(`${MODULE_ID} | failed to disable noCanvas`, err);
      return false;
    }
  }

  sessionStorage.removeItem(RELOAD_GUARD);
  return false;
}

/**
 * Owned mobile carousel actors.
 * Includes every owned character (not only scene tokens) so the full party
 * stays visible, plus any other OWNER actor that has a token on the current scene.
 */
export function getMobileSheetActors() {
  const primaryId = game.user?.character?.id ?? null;
  const scene = game.scenes?.current ?? game.scenes?.active ?? null;
  const tokenActorIds = new Set(
    (scene?.tokens ?? []).map((t) => t.actorId).filter(Boolean)
  );

  const byId = new Map();
  for (const actor of game.actors ?? []) {
    if (!actor?.testUserPermission?.(game.user, "OWNER")) continue;
    const onScene = tokenActorIds.has(actor.id);
    const isCharacter = actor.type === "character";
    if (!isCharacter && !onScene) continue;
    byId.set(actor.id, actor);
  }

  const sorted = [...byId.values()].sort((a, b) => {
    if (a.id === primaryId) return -1;
    if (b.id === primaryId) return 1;
    if (a.type !== b.type) return a.type === "character" ? -1 : 1;
    return String(a.name ?? "").localeCompare(String(b.name ?? ""), game.i18n?.lang);
  });

  const max = 16;
  return sorted.length > max ? sorted.slice(0, max) : sorted;
}

export function bindMobileClientHooks() {
  applyBodyClass(isIllusiveMobileMode());
  suppressMobileClientNotices();
  bindChatPopups();

  Hooks.on("changeSetting", (data) => {
    if (data.namespace === MODULE_ID && (data.key === "enableMobileSheet" || data.key === "mobileClientMode")) {
      void syncMobileClientSettings();
    }
  });
}

const SUPPRESSED_MOBILE_NOTICE_KEYS = new Set([
  "INFO.SceneViewCanvasDisabled",
  "SCENE.GenerateThumbNoCanvas",
  "ERROR.RESOLUTION.Window",
  "ERROR.RESOLUTION.Scale",
  "ERROR.RESOLUTION.Screen",
  "BackgroundTextureSize"
]);

let mobileNoticesPatched = false;

/**
 * Sheet-only mobile never uses the canvas / desktop viewport — mute Foundry toasts
 * about disabled canvas, tiny phone windows, and oversized textures.
 */
export function suppressMobileClientNotices() {
  if (!isIllusiveMobileMode()) return;
  if (mobileNoticesPatched || !ui?.notifications?.notify) return;
  mobileNoticesPatched = true;

  const original = ui.notifications.notify.bind(ui.notifications);
  ui.notifications.notify = function illusiveDndNotify(message, type = "info", options = {}) {
    if (shouldSuppressMobileNotice(message)) return null;
    return original(message, type, options);
  };

  // Permanent resolution errors may already be queued before our ready hook.
  clearExistingSuppressedNotifications();
}

function shouldSuppressMobileNotice(message) {
  if (!isIllusiveMobileMode()) return false;
  const raw = String(message ?? "");
  if (SUPPRESSED_MOBILE_NOTICE_KEYS.has(raw)) return true;
  if (/game Canvas is disabled/i.test(raw)) return true;
  if (/Disable Game Canvas/i.test(raw) && /thumbnail/i.test(raw)) return true;
  if (/usable window dimensions/i.test(raw)) return true;
  if (/requires a screen resolution/i.test(raw)) return true;
  if (/maximum texture size/i.test(raw)) return true;
  if (/background texture with dimensions/i.test(raw)) return true;
  return false;
}

function clearExistingSuppressedNotifications() {
  const root = document.getElementById("notifications");
  if (!root) return;
  for (const el of [...root.querySelectorAll(".notification")]) {
    const text = el.textContent ?? "";
    if (shouldSuppressMobileNotice(text)) el.remove();
  }
}

let chatPopupsBound = false;

function chatPopupsMuted() {
  try {
    return game.settings.get(MODULE_ID, "mobileMuteChatPopups") === true;
  } catch {
    return false;
  }
}

function chatLogOpen() {
  const pop = document.getElementById("chat-popout");
  if (!pop || pop.hidden) return false;
  const style = getComputedStyle(pop);
  return style.display !== "none" && style.visibility !== "hidden";
}

function stripHtml(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = String(html ?? "");
  return (tmp.textContent ?? "").replace(/\s+/g, " ").trim();
}

function canSeeChat(message) {
  if (!message) return false;
  if (typeof message.visible === "boolean") return message.visible;
  const whispers = message.whisper ?? [];
  if (!whispers.length) return true;
  const userId = game.user?.id;
  if (message.author?.id === userId || message.user === userId) return true;
  return whispers.includes(userId);
}

function chatPopupText(message) {
  const speaker = String(message.speaker?.alias || message.author?.name || "").trim();
  const flavor = stripHtml(message.flavor);
  const content = stripHtml(message.content);
  const totals = (message.rolls ?? [])
    .map((roll) => roll?.total)
    .filter((n) => Number.isFinite(n));
  const score = totals.length ? totals.join(", ") : "";
  let body = [speaker, flavor, content !== flavor ? content : "", score && `= ${score}`]
    .filter(Boolean)
    .join(" — ")
    .trim();
  if (body.length > 160) body = `${body.slice(0, 157)}...`;
  return body;
}

function onCreateChatMessage(message) {
  if (!isIllusiveMobileMode() || chatPopupsMuted() || chatLogOpen() || !canSeeChat(message)) return;
  const text = chatPopupText(message);
  if (!text) return;
  ui.notifications?.info?.(text, { localize: false, console: false });
}

function bindChatPopups() {
  if (chatPopupsBound) return;
  chatPopupsBound = true;
  Hooks.on("createChatMessage", (message) => onCreateChatMessage(message));
}
