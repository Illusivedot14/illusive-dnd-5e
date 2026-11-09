/**
 * Cover use cases for HUD / combat previews.
 */

import { applyCoverToDefenses } from "../domain/combat/cover.mjs";
import { evaluateTokenCover } from "../foundry/cover-adapter.mjs";
import { resolveRulesContext } from "../foundry/dnd5e-adapter.mjs";
import { featureEnabled } from "./levels.mjs";
import { adjudicateSoftCover } from "./cover-prompt.mjs";
import { tokenFromUuid as resolveToken } from "../foundry/token-lookup.mjs";

/**
 * @param {{ attackerUuid: string, targetUuid: string, edition?: string }} args
 */
export function evaluate({ attackerUuid, targetUuid, edition } = {}) {
  if (!featureEnabled("coverMatrix")) {
    return {
      level: "none",
      acBonus: 0,
      dexSaveBonus: 0,
      canTarget: true,
      reason: "automation-level",
      factors: [],
      ambiguous: false
    };
  }

  const attacker = resolveToken(attackerUuid);
  const target = resolveToken(targetUuid);
  if (!attacker || !target) {
    return {
      level: "none",
      acBonus: 0,
      dexSaveBonus: 0,
      canTarget: true,
      reason: "missing-token",
      factors: [],
      ambiguous: false
    };
  }

  const ed = edition
    ?? resolveRulesContext(attacker.actor ?? target.actor).edition
    ?? "2024";

  return evaluateTokenCover(attacker, target, { edition: ed });
}

/**
 * Combat resolution path: evaluate cover, then GM-adjudicate soft half/¾ band.
 */
export async function evaluateForCombat({ attackerUuid, targetUuid, edition } = {}) {
  const cover = evaluate({ attackerUuid, targetUuid, edition });
  if (!cover?.ambiguous) return cover;
  const attacker = resolveToken(attackerUuid);
  const target = resolveToken(targetUuid);
  return adjudicateSoftCover({
    cover,
    targetName: target?.name ?? target?.document?.name ?? "Target",
    attackerName: attacker?.name ?? attacker?.document?.name ?? null
  });
}

export function previewDefenses({ attackerUuid, targetUuid, ac, dexSave } = {}) {
  const cover = evaluate({ attackerUuid, targetUuid });
  return applyCoverToDefenses({ ac, dexSave }, cover);
}