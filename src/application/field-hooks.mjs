/**
 * Initiative, pending dice, and granted movement. Wired from foundry/hooks.mjs.
 */

import { MODULE_ID } from "../constants.mjs";
import { setDocFlag, unsetDocFlag, updateDoc } from "../foundry/write-gateway.mjs";
import { gridFeetBetween } from "../domain/spatial/geometry.mjs";
import { isFriendly } from "../domain/combat/disposition.mjs";

function hasItem(actor, id) {
  return [...(actor?.items ?? [])].some((item) => item?.system?.identifier === id
    || new RegExp(`^${id.replace(/-/g, " ")}$`, "i").test(String(item?.name ?? "")));
}

function actorOf(first) {
  return first?.subject?.actor ?? first?.subject ?? first?.actor ?? (first?.items ? first : null);
}

/** Add a stored die to a dnd5e pre-roll config, then clear it. */
export async function attachPendingDie(first) {
  const actor = actorOf(first);
  const die = actor?.getFlag?.(MODULE_ID, "pendingDie");
  if (!die) return;
  const rolls = Array.isArray(first?.rolls) ? first.rolls : [];
  const roll = rolls[0];
  if (Array.isArray(roll?.parts)) roll.parts.push(String(die));
  else if (roll && typeof roll.alter === "function" && !/[dD]/.test(String(die))) roll.alter(1, Number(die) || 0);
  await unsetDocFlag(actor, MODULE_ID, "pendingDie");
}

/** Half proficiency on Athletics for Remarkable Athlete, when the roll config exposes parts. */
export function prepareSkillRoll(config) {
  const actor = actorOf(config);
  const skill = config?.skill ?? config?.rolls?.[0]?.options?.skill;
  if (skill !== "ath" || !hasItem(actor, "remarkable-athlete")) return;
  const bonus = Math.floor((Number(actor?.system?.attributes?.prof) || 0) / 2);
  const roll = config?.rolls?.[0];
  if (bonus > 0 && Array.isArray(roll?.parts)) roll.parts.push(String(bonus));
}

/** Ambush adds proficiency. Remarkable Athlete sets advantage on the roll when the roll object allows it. */
export function prepareInitiativeRoll(actor, roll) {
  if (!actor || !roll) return;
  if (hasItem(actor, "ambush")) {
    const prof = Number(actor.system?.attributes?.prof) || 0;
    if (Array.isArray(roll.parts)) roll.parts.push(String(prof));
    else if (typeof roll.alter === "function") roll.alter(1, prof);
  }
  if (hasItem(actor, "remarkable-athlete") && roll.options) roll.options.advantage = true;
}

/** After Alert's initiative roll, a dialog can swap totals with an ally in the combat. */
export async function offerInitiativeSwap(actor) {
  if (!hasItem(actor, "alert")) return;
  const combat = globalThis.game?.combat;
  const mine = [...(combat?.combatants ?? [])].find((entry) => entry?.actor === actor || entry?.actor?.uuid === actor?.uuid);
  if (!mine || mine.initiative == null) return;
  const allies = [...(combat?.combatants ?? [])].filter((entry) => {
    if (!entry || entry === mine || entry.initiative == null || !entry.actor) return false;
    const a = entry.token?.object ?? entry.token;
    const b = mine.token?.object ?? mine.token;
    return a && b ? isFriendly(b, a) : true;
  });
  if (!allies.length) return;
  const dialog = globalThis.foundry?.applications?.api?.DialogV2;
  if (!dialog?.wait) return;
  let picked = null;
  try {
    picked = await dialog.wait({
      window: { title: "Alert" },
      buttons: [
        ...allies.map((entry) => ({
          action: entry.id,
          label: entry.actor?.name ?? entry.name ?? "Ally",
          callback: () => entry.id
        })),
        { action: "keep", label: "Keep", callback: () => null }
      ]
    });
  } catch {
    return;
  }
  const ally = allies.find((entry) => entry.id === picked);
  if (!ally) return;
  const mineTotal = mine.initiative;
  const allyTotal = ally.initiative;
  await updateDoc(mine, { initiative: allyTotal });
  await updateDoc(ally, { initiative: mineTotal });
}

/** Reduce a granted move by the distance just walked. */
export async function spendFreeMove(tokenDoc, prior) {
  const actor = tokenDoc?.actor;
  const left = Number(actor?.getFlag?.(MODULE_ID, "freeMoveFeet")) || 0;
  if (!(left > 0) || !prior) return;
  const grid = globalThis.canvas?.scene?.grid ?? {};
  const cost = gridFeetBetween(
    { x: prior.x, y: prior.y },
    { x: tokenDoc.x, y: tokenDoc.y },
    { gridSize: Number(grid.size) || 100, gridDistance: Number(grid.distance) || 5 }
  );
  const next = left - (Number(cost) || 0);
  if (next <= 0) await unsetDocFlag(actor, MODULE_ID, "freeMoveFeet");
  else await setDocFlag(actor, MODULE_ID, "freeMoveFeet", next);
}
