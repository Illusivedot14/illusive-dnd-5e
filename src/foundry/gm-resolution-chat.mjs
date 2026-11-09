/**
 * GM-only chat card for a completed combat resolution.
 * Players never see this — no action-bar strip.
 */

import { MODULE_ID } from "../constants.mjs";
import { buildHudView } from "../application/hud-view.mjs";

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function gmUsers() {
  return (game.users ?? []).filter((u) => u?.isGM).map((u) => u.id).filter(Boolean);
}

function gmResolutionChatEnabled() {
  try {
    return game.settings.get(MODULE_ID, "gmResolutionChat") !== false;
  } catch {
    return true;
  }
}

/**
 * @param {object} resolution  Action resolution state
 */
export async function postGmResolutionChat(resolution) {
  if (!gmResolutionChatEnabled()) return null;
  if (!resolution || typeof ChatMessage?.create !== "function") return null;
  if (!["completed", "corrected", "awaiting-reaction"].includes(resolution.phase)) return null;

  const whisper = gmUsers();
  if (!whisper.length && !game.user?.isGM) return null;

  const view = buildHudView(resolution);
  if (!view) return null;

  const legacy = view.explanation?.some((e) => e.legacy)
    ? `<span class="illusive-dnd-gm-res-legacy">2014 / Legacy</span>`
    : "";
  const hits = (view.targets ?? []).length
    ? `<div class="illusive-dnd-gm-res-targets">${escapeHtml(String(view.targets.length))} target(s)</div>`
    : "";
  const rolls = (view.rolls ?? [])
    .map((r) => {
      const kind = r.kind ?? "roll";
      const total = r.total != null ? r.total : "?";
      const crit = r.isCritical ? " (crit)" : "";
      return `<li>${escapeHtml(kind)}: <strong>${escapeHtml(total)}</strong>${crit}</li>`;
    })
    .join("");

  const content = `
    <div class="illusive-dnd-gm-resolution" data-resolution-id="${escapeHtml(view.id)}">
      <div class="illusive-dnd-gm-res-phase">${escapeHtml(view.phase)}</div>
      <div class="illusive-dnd-gm-res-headline">${escapeHtml(view.headline)}</div>
      ${legacy}
      ${hits}
      ${rolls ? `<ul class="illusive-dnd-gm-res-rolls">${rolls}</ul>` : ""}
    </div>
  `;

  try {
    return await ChatMessage.create({
      content,
      speaker: { alias: "Illusive" },
      whisper: whisper.length ? whisper : (game.user?.isGM ? [game.user.id] : []),
      flags: {
        [MODULE_ID]: {
          resolutionId: view.id,
          phase: view.phase
        }
      }
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | GM resolution chat failed`, err);
    return null;
  }
}
