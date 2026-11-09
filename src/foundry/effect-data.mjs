import { MODULE_ID } from "../constants.mjs";
import { collectActiveEffects, getEffectImage } from "./effect-icons.mjs";
import { getEffectDisposition } from "./effect-disposition.mjs";
import {
  getRemainingRounds,
  getTimedBadgeText,
  hasTimedDuration,
  isEffectDurationExpired
} from "./effect-duration.mjs";

export {
  buildRoundDurationUpdate,
  getRemainingRounds,
  getTimedBadgeText,
  hasTimedDuration,
  isEffectDurationExpired,
  isManagedRoundEffect
} from "./effect-duration.mjs";

const IGNORED_DURATION_LABELS = new Set(["none", "permanent", ""]);

function effectHasConcentrating(effect) {
  const statuses = effect?.statuses;
  if (!statuses) return false;
  if (typeof statuses.has === "function") return statuses.has("concentrating");
  return [...statuses].includes("concentrating");
}

function getDurationLabel(effect) {
  const rounds = getRemainingRounds(effect);
  if (rounds !== null) {
    return rounds === 1 ? "1 Round" : `${rounds} Rounds`;
  }

  effect.updateDuration?.();

  const label = effect.duration?.label?.trim() ?? "";
  if (label && !IGNORED_DURATION_LABELS.has(label.toLowerCase())) return label;

  return "";
}

function normalizeText(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\.([A-Z])/g, ". $1")
    .trim();
}

function htmlToDescriptionLines(html) {
  const root = document.createElement("div");
  root.innerHTML = html ?? "";

  const lines = [];

  const pushLine = (text, bullet = false) => {
    const normalized = normalizeText(text);
    if (!normalized) return;
    lines.push(bullet ? `• ${normalized}` : normalized);
  };

  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pushLine(node.textContent ?? "");
      return;
    }

    if (node.nodeName === "LI") {
      pushLine(node.textContent ?? "", true);
      return;
    }

    if (node.nodeName === "BR") {
      return;
    }

    if (["P", "DIV", "SECTION", "H1", "H2", "H3", "H4", "H5", "H6"].includes(node.nodeName)) {
      pushLine(node.textContent ?? "");
      return;
    }

    for (const child of node.childNodes) walk(child);
  };

  walk(root);

  return [...new Set(lines)];
}

async function getEffectDescriptionLines(effect) {
  if (!effect.description) return [];

  try {
    const html = await foundry.applications.ux.TextEditor.implementation.enrichHTML(effect.description, {
      async: true
    });
    return htmlToDescriptionLines(html);
  } catch {
    return htmlToDescriptionLines(effect.description);
  }
}

export async function buildTokenStatusData(token) {
  const actor = token?.actor;
  if (!actor) return [];

  const statuses = [];

  for (const effect of collectActiveEffects(actor)) {
    try {
      const roundsRemaining = getRemainingRounds(effect);
      const timedBadge = getTimedBadgeText(effect);
      const img = getEffectImage(effect);
      const durationLabel = getDurationLabel(effect);
      const descriptionLines = await getEffectDescriptionLines(effect);
      const disposition = getEffectDisposition(effect);

      const statusIds = [...(effect.statuses ?? [])];
      statuses.push({
        uuid: effect.uuid || effect.id || "",
        statusId: statusIds[0] || "",
        name: effect.name,
        img,
        roundsRemaining,
        timedBadge,
        showTimedBadge: hasTimedDuration(effect) && timedBadge !== null,
        expiringSoon: roundsRemaining === 1,
        disposition,
        durationLabel,
        descriptionLines,
        hasDescription: descriptionLines.length > 0,
        isConcentration: effectHasConcentrating(effect)
      });
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to build status for effect "${effect.name}"`, error);
    }
  }

  statuses.sort((a, b) => Number(b.isConcentration) - Number(a.isConcentration));
  return statuses;
}
