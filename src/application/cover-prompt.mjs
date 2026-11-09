/**
 * GM soft-cover adjudication (half vs three-quarters vs none).
 */

import { coverResultForLevel } from "../domain/combat/cover.mjs";
import { debugLog, DEBUG_CHANNELS } from "../foundry/debug.mjs";
import { illusiveDndLocalize } from "../i18n/index.mjs";

/**
 * @param {{
 *   cover: object,
 *   targetName?: string,
 *   attackerName?: string
 * }} args
 * @returns {Promise<object>} cover result with chosen level
 */
export async function adjudicateSoftCover({ cover, targetName = "Target", attackerName = null } = {}) {
  if (!cover?.ambiguous) return cover;

  const DialogV2 = foundry?.applications?.api?.DialogV2;
  if (!DialogV2?.wait) {
    debugLog(DEBUG_CHANNELS.COMBAT, "cover.soft-fallback", {
      targetName,
      level: cover.level,
      reason: "no-dialog"
    });
    return { ...cover, ambiguous: false };
  }

  const pct = Math.round((Number(cover.blockedFraction) || 0) * 100);
  const title = illusiveDndLocalize("cover.softTitle");
  const hint = illusiveDndLocalize("cover.softHint")
    .replace("{target}", targetName)
    .replace("{pct}", String(pct))
    .replace("{attacker}", attackerName ?? "");
  const content = `<p>${hint}</p>`;

  let choice = null;
  try {
    choice = await DialogV2.wait({
      window: { title },
      content,
      rejectClose: false,
      modal: true,
      buttons: [
        {
          action: "none",
          label: illusiveDndLocalize("cover.none"),
          callback: () => "none"
        },
        {
          action: "half",
          label: illusiveDndLocalize("cover.half"),
          default: true,
          callback: () => "half"
        },
        {
          action: "three-quarters",
          label: illusiveDndLocalize("cover.threeQuarters"),
          callback: () => "three-quarters"
        }
      ]
    });
  } catch {
    choice = null;
  }

  const level = choice === "none" || choice === "half" || choice === "three-quarters"
    ? choice
    : (cover.level === "half" ? "half" : "half");

  const resolved = coverResultForLevel(level, {
    edition: cover.edition,
    factors: [
      ...(cover.factors ?? []),
      { code: "gm-choice", detail: `GM chose ${level}` }
    ]
  });
  resolved.blockedFraction = cover.blockedFraction;
  resolved.ambiguous = false;
  resolved.gmAdjudicated = true;

  debugLog(DEBUG_CHANNELS.COMBAT, "cover.soft-chosen", {
    targetName,
    fraction: cover.blockedFraction,
    suggested: cover.level,
    chosen: level
  });

  return resolved;
}
