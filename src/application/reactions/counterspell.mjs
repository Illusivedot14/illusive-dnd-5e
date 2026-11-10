/**
 * Counterspell outcome (the `counterspell` declaration step).
 * 2024 (PHB 2024 Counterspell): caster makes a Con save vs reactor's spell save DC;
 *   on failure the spell fails, its action is wasted, and its slot is not expended.
 * 2014 (PHB 2014 Counterspell): auto-success if spell level <= the counter slot level (3+);
 *   otherwise reactor makes a spellcasting ability check DC 10 + spell level.
 */

import { rollAsOwner } from "../dice.mjs";

function abilityMod(actor, key) {
  return Number(actor?.system?.abilities?.[key]?.mod) || 0;
}

function editionOf(ctx) {
  return ctx?.rulesContext?.legacy || ctx?.rulesContext?.edition === "2014" ? "2014" : "2024";
}

export async function resolveCounterspell({ reactor, caster, spellLevel = 0, ctx = {} } = {}) {
  const edition = editionOf(ctx);
  if (edition === "2014") {
    const level = Number(spellLevel) || 0;
    const counterLevel = Math.max(3, Number(ctx.counterSlotLevel) || 3);
    if (level <= counterLevel) return { countered: true, edition, auto: true, counterLevel };
    const ability = reactor?.system?.attributes?.spellcasting || "int";
    const dc = 10 + level;
    let total = null;
    try {
      total = Number((await rollAsOwner(reactor, "check", { ability, target: dc }))?.total);
    } catch {
      total = null;
    }
    if (!Number.isFinite(total)) total = 10 + abilityMod(reactor, ability);
    return { countered: total >= dc, edition, dc, total, counterLevel };
  }

  const dc = Number(reactor?.system?.attributes?.spell?.dc) || 13;
  let total = null;
  try {
    total = Number((await rollAsOwner(caster, "save", { ability: "con", target: dc }))?.total);
  } catch {
    total = null;
  }
  if (!Number.isFinite(total)) return { countered: true, edition, dc, total: null };
  return { countered: total < dc, edition, dc, total, refundSlot: total < dc };
}

/** The patches a Counterspell use emits. */
export async function counterspellPatches(ctx, source) {
  const outcome = await resolveCounterspell({
    reactor: ctx.reactor ?? ctx.actor,
    caster: ctx.caster,
    spellLevel: ctx.spellLevel,
    ctx
  });
  return outcome.countered
    ? [{ type: "cancelCast", source, refundSlot: Boolean(outcome.refundSlot), detail: outcome }]
    : [{ type: "note", source, detail: { ...outcome, countered: false } }];
}
