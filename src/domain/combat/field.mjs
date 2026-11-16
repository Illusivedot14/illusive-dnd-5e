/**
 * Pure rules for zones, antimagic, teleports, slots, and light.
 * Summons, the ethereal plane, and doors are not in this file.
 */

/** A closed circle blocks entering, leaving, or either. */
export function barrierBlocks({ fromInside, toInside, blocks, exceptSource = false, isSource = false } = {}) {
  if (!blocks) return false;
  if (exceptSource && isSource) return false;
  if (blocks === "enter") return !fromInside && toInside;
  if (blocks === "leave") return fromInside && !toInside;
  if (blocks === "both") return Boolean(fromInside) !== Boolean(toInside);
  return false;
}

/**
 * Antimagic stops the caster. A globe stops a leveled spell on a creature inside it.
 * @returns {"suppress"|"ward"|null}
 */
export function spellBlocked({ casterInsideSuppress = false, targetInsideWard = false, spellLevel = 0, wardLevel = null } = {}) {
  if (casterInsideSuppress) return "suppress";
  const level = Number(spellLevel) || 0;
  const cap = Number(wardLevel);
  if (targetInsideWard && Number.isFinite(cap) && level > 0 && level <= cap) return "ward";
  return null;
}

/** Highest expended spell slot at or under `maxLevel`, or the pact slot. */
export function slotRestoreKey(spells, maxLevel) {
  const cap = Number(maxLevel) || 0;
  if (!spells || cap <= 0) return null;
  for (let level = cap; level >= 1; level -= 1) {
    const pool = spells[`spell${level}`];
    const max = Number(pool?.max) || 0;
    const value = Number(pool?.value) || 0;
    if (max > 0 && value < max) return `spell${level}`;
  }
  const pact = spells.pact;
  const pactLevel = Number(pact?.level) || 0;
  if (pactLevel > 0 && pactLevel <= cap && (Number(pact?.max) || 0) > (Number(pact?.value) || 0)) return "pact";
  return null;
}

/** A point on the line from origin to target, 5 feet short of the target, when that point is in range. */
export function teleportBeside(origin, target, maxFeet, grid = {}) {
  const size = Number(grid.size) || 100;
  const distance = Number(grid.distance) || 5;
  const ax = Number(origin?.x) || 0;
  const ay = Number(origin?.y) || 0;
  const tx = Number(target?.x) || 0;
  const ty = Number(target?.y) || 0;
  const dx = tx - ax;
  const dy = ty - ay;
  const len = Math.hypot(dx, dy);
  const feet = (len / size) * distance;
  const cap = Number(maxFeet) || 0;
  if (!(cap > 0) || feet > cap + 5) return null;
  const back = (5 / distance) * size;
  if (len <= back) return { x: ax, y: ay };
  return {
    x: tx - (dx / len) * back,
    y: ty - (dy / len) * back
  };
}

export function swappedPoints(a, b) {
  return {
    a: { x: Number(b?.x) || 0, y: Number(b?.y) || 0 },
    b: { x: Number(a?.x) || 0, y: Number(a?.y) || 0 }
  };
}

export function lightHides(level) {
  return level === "dim" || level === "dark";
}

/** Types this attacker ignores resistance to, for this damage source. */
export function bypassTypes(entries, { spell = false, attack = false } = {}) {
  const out = [];
  for (const entry of entries ?? []) {
    const type = String(entry?.type ?? "").toLowerCase();
    if (!type) continue;
    if (entry.spells && !spell) continue;
    if (entry.attacks && !attack) continue;
    out.push(type);
  }
  return out;
}
