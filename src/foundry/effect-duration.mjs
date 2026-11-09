import { MODULE_ID } from "../constants.mjs";

const IGNORED_LABELS = new Set(["none", "permanent", ""]);

function readFlag(effect, key) {
  const value = effect.getFlag?.(MODULE_ID, key);
  if (value !== undefined && value !== null) return value;
  return effect.flags?.[MODULE_ID]?.[key];
}

/** Effect was timed via Set Duration (has our roundTotal flag). */
export function isManagedRoundEffect(effect) {
  const total = readFlag(effect, "roundTotal");
  return Number.isFinite(total) && total > 0;
}

/** Write only module flags — never touch Foundry duration fields (dnd5e marks those expired instantly). */
export function buildRoundDurationUpdate(rounds) {
  const combat = game.combat;
  const update = { [`flags.${MODULE_ID}.roundTotal`]: rounds };

  if (combat?.started) {
    update[`flags.${MODULE_ID}.combatId`] = combat.id;
    update[`flags.${MODULE_ID}.startRound`] = combat.round ?? 1;
  }

  return update;
}

export function getRemainingRounds(effect) {
  const total = readFlag(effect, "roundTotal");
  if (!Number.isFinite(total) || total <= 0) return null;

  const combat = game.combat;
  const combatId = readFlag(effect, "combatId");
  const startRound = readFlag(effect, "startRound");

  if (!combat?.started || combatId == null || String(combatId) !== String(combat.id)) {
    return total;
  }

  const start = Number.isFinite(startRound) ? startRound : (combat.round ?? 1);
  return Math.max(0, total - ((combat.round ?? 1) - start));
}

export function isEffectDurationExpired(effect) {
  return isManagedRoundEffect(effect) && getRemainingRounds(effect) === 0;
}

export function hasTimedDuration(effect) {
  if (isManagedRoundEffect(effect)) return true;

  const label = effect.duration?.label?.trim?.() ?? "";
  return Boolean(label) && !IGNORED_LABELS.has(label.toLowerCase()) && !/round/i.test(label);
}

export function getTimedBadgeText(effect) {
  const rounds = getRemainingRounds(effect);
  if (rounds !== null) return String(rounds);

  const label = effect.duration?.label?.trim?.() ?? "";
  if (!label || IGNORED_LABELS.has(label.toLowerCase()) || /round/i.test(label)) return null;

  const match = label.match(/^(\d+)\s*(\w)/i);
  if (match) return `${match[1]}${match[2].toLowerCase()}`;
  return label.length > 4 ? label.slice(0, 4) : label;
}

/** @deprecated Use isEffectDurationExpired */
export function isRoundEffectExpired(effect) {
  return isEffectDurationExpired(effect);
}

function actorEffects(actor) {
  if (!actor) return [];
  return [
    ...(actor.temporaryEffects ?? []),
    ...(actor.appliedEffects ?? actor.effects?.contents ?? [])
  ];
}

export async function expireRoundBasedEffects(combat) {
  if (!combat?.started || !game.user.isGM) return;

  const seen = new Set();

  for (const combatant of combat.combatants ?? []) {
    for (const effect of actorEffects(combatant.actor)) {
      if (!effect || seen.has(effect.id)) continue;
      if (!isManagedRoundEffect(effect) || getRemainingRounds(effect) !== 0) continue;

      seen.add(effect.id);
      try {
        await effect.delete();
      } catch (error) {
        console.warn(`${MODULE_ID} | Failed to delete expired effect "${effect.name}"`, error);
      }
    }
  }
}
