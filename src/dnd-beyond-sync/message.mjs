/** Game-log events the old ddb-sync socket acted on. */
export const SHEET_UPDATE = "character-sheet/character-update/fulfilled";

export function isHealthUpdate(eventType) {
  return eventType === SHEET_UPDATE || eventType === "character-sheet/character-update";
}

export function characterIdOf(message) {
  const id = message?.characterId
    ?? message?.entityId
    ?? message?.data?.character?.id
    ?? message?.character?.id
    ?? message?.data?.characterId
    ?? message?.data?.entityId
    ?? null;
  return id == null || String(id).trim() === "" ? null : String(id);
}

export function messageKey(message) {
  const characterId = characterIdOf(message) ?? "unknown";
  const eventType = message?.eventType ?? message?.type ?? "unknown";
  const id = message?.id ?? message?.messageId ?? message?.rollId ?? "";
  return `${characterId}-${eventType}-${id}`;
}

/** Current hit points after Beyond's removedHitPoints, capped at 0. */
export function hpFromRemoved(max, removed) {
  const cap = Number(max);
  const gone = Number(removed);
  const ceiling = Number.isFinite(cap) ? cap : 0;
  const damage = Number.isFinite(gone) ? gone : 0;
  return Math.max(0, ceiling - damage);
}

function sheetNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function chosenComponentIds(character) {
  const ids = new Set();
  for (const list of Object.values(character?.choices ?? {})) {
    if (!Array.isArray(list)) continue;
    for (const choice of list) {
      if (choice?.componentId != null) ids.add(choice.componentId);
    }
  }
  return ids;
}

function modifiers(character, type, subType, { includeChosen = false } = {}) {
  const chosen = includeChosen ? chosenComponentIds(character) : null;
  const groups = Object.values(character?.modifiers ?? {});
  const mods = [];
  for (const list of groups) {
    if (!Array.isArray(list)) continue;
    for (const mod of list) {
      if (mod?.type !== type || mod?.subType !== subType) continue;
      if (mod.isGranted === false && !chosen?.has(mod.componentId)) continue;
      mods.push(mod);
    }
  }
  return mods;
}

function constitutionScore(character) {
  const read = (list) => (list ?? []).find((entry) => entry?.id === 3);
  const override = sheetNumber(read(character?.overrideStats)?.value);
  if (override != null && override !== 0) return override;
  const base = sheetNumber(read(character?.stats)?.value) ?? 10;
  const bonus = sheetNumber(read(character?.bonusStats)?.value) ?? 0;
  const extra = modifiers(character, "bonus", "constitution-score", { includeChosen: true })
    .reduce((sum, mod) => sum + (sheetNumber(mod.value) ?? 0), 0);
  return base + bonus + extra;
}

function characterLevel(character) {
  return (character?.classes ?? []).reduce((sum, entry) => sum + (sheetNumber(entry.level) ?? 0), 0);
}

function hasDice(mod) {
  const dice = mod?.dice;
  return Boolean(dice && (dice.diceCount || dice.diceString));
}

function itemIsApplied(character, mod) {
  return (character?.inventory ?? []).some((row) => {
    const definitionId = row?.definition?.id;
    if (definitionId !== mod?.componentId && row?.id !== mod?.componentId) return false;
    if (!row.equipped) return false;
    if (mod.requiresAttunement && !row.isAttuned) return false;
    return true;
  });
}

/** Flat maximum bonuses. A modifier with dice is a healing roll, and an item bonus counts only while that item is equipped. */
function flatHitPoints(character) {
  const chosen = chosenComponentIds(character);
  let total = 0;
  for (const [group, list] of Object.entries(character?.modifiers ?? {})) {
    if (!Array.isArray(list)) continue;
    for (const mod of list) {
      if (mod?.type !== "bonus" || mod?.subType !== "hit-points") continue;
      if (mod.isGranted === false && !chosen.has(mod.componentId)) continue;
      if (hasDice(mod)) continue;
      if (group === "item" && !itemIsApplied(character, mod)) continue;
      total += sheetNumber(mod.value) ?? sheetNumber(mod.fixedValue) ?? 0;
    }
  }
  return total;
}

/**
 * Beyond is the source of truth.
 * The maximum is hit dice, Constitution, and hit points per level.
 * The bonus box is a separate max modifier, and it can be negative.
 * An override replaces the maximum. Current hit points subtract removedHitPoints.
 */
export function hitPointsFromSheet(character) {
  const base = sheetNumber(character?.baseHitPoints);
  const bonus = sheetNumber(character?.bonusHitPoints) ?? 0;
  const override = sheetNumber(character?.overrideHitPoints);
  if (base == null && override == null) return null;
  const level = characterLevel(character);
  const constitution = Math.floor((constitutionScore(character) - 10) / 2);
  const perLevel = modifiers(character, "bonus", "hit-points-per-level")
    .reduce((sum, mod) => sum + (sheetNumber(mod.value) ?? 0) * level, 0);
  const flat = flatHitPoints(character);
  const replaced = override != null && override !== 0;
  const max = Math.max(0, replaced ? override : (base ?? 0) + (constitution * level) + perLevel + flat);
  const tempmax = replaced ? 0 : bonus;
  const temp = Math.max(0, sheetNumber(character?.temporaryHitPoints) ?? 0);
  return {
    max,
    tempmax,
    value: hpFromRemoved(max + tempmax, character?.removedHitPoints),
    temp,
    overridden: replaced
  };
}

export function isSheetUpdate(message) {
  return message?.eventType === SHEET_UPDATE;
}
