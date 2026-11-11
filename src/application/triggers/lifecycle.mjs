/**
 * Turn and cast bookkeeping the declaration steps leave behind:
 * a repeated save, a confused turn, a readied spell's slot, empowered dice.
 */

import { MODULE_ID } from "../../constants.mjs";
import { isHostile } from "../../domain/combat/disposition.mjs";
import { evaluateSaveVsDc } from "../../domain/combat/save-outcome.mjs";
import { spellSlotKeyForLevel } from "../../foundry/dnd5e-adapter.mjs";
import { tokenForActor } from "../../foundry/token-lookup.mjs";
import { createEmbedded, deleteDocs, setDocFlag, updateDoc } from "../../foundry/write-gateway.mjs";
import { rollAsOwner, rollVisible } from "../dice.mjs";

async function d6ish(faces, flavor) {
  try {
    const roll = await rollVisible(`1d${faces}`, { flavor });
    const total = Number(roll?.total);
    if (Number.isFinite(total) && total > 0) return total;
  } catch {
    /* no dice */
  }
  return 0;
}

/** On the creature's turn, a repeated save ends the named effect when it succeeds. */
export async function tickRepeatSaves(actor) {
  if (!actor) return [];
  const ended = [];
  for (const effect of [...(actor.effects ?? [])]) {
    const spec = effect.flags?.[MODULE_ID]?.repeatSave;
    if (!spec?.ability) continue;
    let saved = false;
    try {
      const total = Number((await rollAsOwner(actor, "save", {
        ability: spec.ability,
        target: spec.dc
      }))?.total);
      saved = evaluateSaveVsDc({ total, dc: spec.dc }).success;
    } catch {
      saved = false;
    }
    if (!saved) continue;
    const result = await deleteDocs([effect]);
    ended.push(...(result?.undo ?? []));
  }
  return ended;
}

async function shuffle(actor, feet, toward = null) {
  const token = tokenForActor(actor);
  const doc = token?.document;
  if (!doc || typeof doc.x !== "number" && doc.x == null) return;
  const grid = globalThis.canvas?.scene?.grid ?? globalThis.canvas?.grid ?? {};
  const size = Number(grid.size) || 100;
  const distance = Number(grid.distance) || 5;
  const pixels = (feet / distance) * size;
  const ox = Number(doc.x) || 0;
  const oy = Number(doc.y) || 0;
  let dx = pixels;
  let dy = 0;
  if (toward?.document) {
    const tx = Number(toward.document.x) || 0;
    const ty = Number(toward.document.y) || 0;
    const len = Math.hypot(tx - ox, ty - oy) || 1;
    const step = Math.min(pixels, len);
    dx = ((tx - ox) / len) * step;
    dy = ((ty - oy) / len) * step;
  } else {
    const face = await d6ish(8, "Confusion direction");
    const angle = ((face || 1) - 1) * (Math.PI / 4);
    dx = Math.cos(angle) * pixels;
    dy = Math.sin(angle) * pixels;
  }
  await updateDoc(doc, { x: ox + dx, y: oy + dy }, { illusiveSkipOA: true, illusiveDndForced: true });
}

function nearestEnemy(actor) {
  const self = tokenForActor(actor);
  if (!self) return null;
  let best = null;
  for (const token of globalThis.canvas?.tokens?.placeables ?? []) {
    if (!token || token === self || !isHostile(self, token)) continue;
    const dx = (Number(token.document?.x) || 0) - (Number(self.document?.x) || 0);
    const dy = (Number(token.document?.y) || 0) - (Number(self.document?.y) || 0);
    const dist = Math.hypot(dx, dy);
    if (!best || dist < best.dist) best = { token, dist };
  }
  return best?.token ?? null;
}

/**
 * Confusion's turn: 1 do nothing, 2–6 wander, 7–8 close in, 9–10 act.
 * A missing die leaves the creature able to act.
 */
export async function tickConfusion(actor) {
  if (!actor?.getFlag?.(MODULE_ID, "confusion")) return null;
  const face = await d6ish(10, "Confusion");
  let deny = [];
  if (face === 1) deny = ["action", "bonus", "reaction", "move"];
  else if (face >= 2 && face <= 6) {
    deny = ["action"];
    await shuffle(actor, 15);
  } else if (face >= 7 && face <= 8) {
    const foe = nearestEnemy(actor);
    if (foe) await shuffle(actor, 15, foe);
  }
  await setDocFlag(actor, MODULE_ID, "control", deny);
  return { face, deny };
}

/** The readied spell's placeholder concentration ends when the spell is released or the ready lapses. */
export async function releaseReadiedConcentration(actor) {
  const held = [...(actor?.effects ?? [])].filter((effect) => effect.flags?.[MODULE_ID]?.readiedConcentration);
  if (!held.length) return [];
  const result = await deleteDocs(held);
  return result?.undo ?? [];
}

/** Spend the spell's slot and begin concentration when the spell is readied. */
export async function holdReadiedSpell(actor, item) {
  if (!actor || item?.type !== "spell") return {};
  const level = Number(item.system?.level) || 0;
  const held = { slotHeld: true };
  if (level > 0) {
    const key = spellSlotKeyForLevel(actor, level);
    const current = Number(actor.system?.spells?.[key]?.value) || 0;
    if (key && current > 0) {
      await updateDoc(actor, { [`system.spells.${key}.value`]: current - 1 });
      held.slotKey = key;
    }
  }
  const props = item.system?.properties;
  const concentrates = Boolean(item.system?.duration?.concentration)
    || props?.has?.("concentration")
    || (Array.isArray(props) && props.includes("concentration"));
  if (concentrates) {
    await createEmbedded(actor, "ActiveEffect", [{
      name: item.name ?? "Concentration",
      statuses: ["concentrating"],
      origin: item.uuid,
      duration: { seconds: 6 },
      flags: { [MODULE_ID]: { readiedConcentration: true } }
    }]);
    held.concentrating = true;
  }
  return held;
}

/** Empowered Spell: reroll up to `count` of the lowest damage dice, keeping the higher result. */
export async function empowerRolls(rolls, count) {
  const n = Math.max(0, Number(count) || 0);
  if (!n) return rolls ?? [];
  for (const roll of rolls ?? []) {
    const dice = roll?.dice ?? [];
    const pool = [];
    for (const die of dice) {
      const face = Number(die.faces) || 6;
      for (let i = 0; i < (die.results?.length ?? 0); i += 1) {
        pool.push({ die, i, face, result: Number(die.results[i]?.result) || 0 });
      }
    }
    pool.sort((a, b) => a.result - b.result);
    for (const entry of pool.slice(0, n)) {
      let next = entry.result;
      if (globalThis.Roll) {
        try {
          const rolled = await new globalThis.Roll(`1d${entry.face}`).evaluate();
          if (Number.isFinite(Number(rolled?.total))) next = Number(rolled.total);
        } catch {
          next = entry.result;
        }
      }
      if (next <= entry.result) continue;
      entry.die.results[entry.i].result = next;
      if (Number.isFinite(Number(roll.total))) roll.total = Number(roll.total) + (next - entry.result);
    }
  }
  return rolls ?? [];
}

export function chaMod(actor) {
  return Math.max(1, Number(actor?.system?.abilities?.cha?.mod) || 1);
}
