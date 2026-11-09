import { illusiveDnd } from "../i18n/index.mjs";

/** Resources shown on the L gem — skip them in the strip to avoid doubling. */
const STRIP_SKIP = new Set(["legact"]);

function diamondsFromPool(value, max) {
  const remaining = Math.max(0, Math.min(max, Number(value) || 0));
  const used = Math.max(0, max - remaining);
  const diamonds = [];
  for (let i = 0; i < remaining; i += 1) diamonds.push({ filled: true });
  for (let i = 0; i < used; i += 1) diamonds.push({ filled: false });
  return diamonds;
}

function normalizeResource(id, res, fallbackLabel) {
  if (!res || typeof res !== "object") return null;
  const max = Number(res.max);
  if (!Number.isFinite(max) || max <= 0) return null;

  let value = Number(res.value);
  if (!Number.isFinite(value) && Number.isFinite(Number(res.spent))) {
    value = Math.max(0, max - Number(res.spent));
  }
  if (!Number.isFinite(value)) value = 0;
  value = Math.max(0, Math.min(max, value));

  const rawLabel = typeof res.label === "string" ? res.label.trim() : "";
  const label = (rawLabel && rawLabel.length <= 28) ? rawLabel : (fallbackLabel || id);

  return {
    id,
    kind: "resource",
    label,
    value,
    max,
    diamonds: max <= 8 ? diamondsFromPool(value, max) : null,
    tipDetail: `${value} / ${max}`
  };
}

/** Pact magic pool (`system.spells.pact`). */
export function getPactMagic(actor) {
  const pact = actor?.system?.spells?.pact;
  const max = Number(pact?.max) || 0;
  if (max <= 0) return null;
  const value = Math.max(0, Math.min(max, Number(pact?.value) || 0));
  const level = Number(pact?.level) || 0;
  const entry = {
    id: "pact",
    kind: "pact",
    label: illusiveDnd.actionBar("pactMagic"),
    value,
    max,
    level,
    subtitle: level > 0 ? illusiveDnd.actionBar("pactLevel", { level }) : null,
    diamonds: diamondsFromPool(value, max)
  };
  entry.tipDetail = entry.subtitle
    ? `${entry.subtitle} · ${value} / ${max}`
    : `${value} / ${max}`;
  return entry;
}

/**
 * Class / creature resources (ki, sorcery, lair, resistance, …).
 * Legendary actions stay off this list — they already have the gold gem.
 */
export function getClassResources(actor) {
  const resources = actor?.system?.resources;
  if (!resources || typeof resources !== "object") return [];

  const out = [];
  const order = ["primary", "secondary", "tertiary", "legres", "lair"];
  const seen = new Set();

  for (const id of order) {
    if (STRIP_SKIP.has(id)) continue;
    const fallback = id === "legres"
      ? illusiveDnd.actionBar("legendaryResistance")
      : id === "lair"
        ? illusiveDnd.actionBar("lairActions")
        : id;
    const entry = normalizeResource(id, resources[id], fallback);
    if (!entry) continue;
    if (id === "legres") entry.kind = "resistance";
    if (id === "lair") entry.kind = "lair";
    out.push(entry);
    seen.add(id);
  }

  for (const [id, res] of Object.entries(resources)) {
    if (seen.has(id) || STRIP_SKIP.has(id)) continue;
    const entry = normalizeResource(id, res, id);
    if (entry) out.push(entry);
  }

  return out;
}

/** Leftover legendary resistance uses on this creature. Null if they have none. */
export function buildLegendaryResistance(actor) {
  const entry = normalizeResource(
    "legres",
    actor?.system?.resources?.legres,
    illusiveDnd.actionBar("legendaryResistance")
  );
  if (!entry) return null;
  return {
    ...entry,
    kind: "resistance",
    remaining: entry.value,
    label: illusiveDnd.actionBar("legendaryResistance")
  };
}

/** Spend or put back one use. `delta` is usually -1 or +1. */
export async function adjustLegendaryResistance(actor, delta) {
  const current = buildLegendaryResistance(actor);
  if (!current || typeof actor?.update !== "function") return false;
  const step = Number(delta);
  if (!Number.isFinite(step) || step === 0) return false;

  const next = Math.max(0, Math.min(current.max, current.remaining + step));
  if (next === current.remaining) return false;

  await actor.update({ "system.resources.legres.value": next });
  return true;
}

/**
 * Action-bar resource strip: class/creature resources (not pact — those show
 * on leveled spell group headers via the pact slot fallback).
 * Resistance lives on the creature gem, not over the spells.
 * @returns {object[]}
 */
export function buildActionBarResources(actor) {
  if (!actor) return [];
  return getClassResources(actor).filter((entry) => entry.id !== "legres");
}

/**
 * Build diamond pips for a leveled spell group, falling back to the shared
 * pact pool when this level has no prepared slots (typical warlock).
 */
export function buildSpellSlotDiamondsForLevel(actor, level) {
  if (!Number.isFinite(level) || level < 1) return null;
  const spells = actor?.system?.spells ?? {};
  const leveled = spells[`spell${level}`];
  const leveledMax = Number(leveled?.max) || 0;
  if (leveledMax > 0) {
    return diamondsFromPool(leveled.value, leveledMax);
  }

  const pact = spells.pact;
  const pactMax = Number(pact?.max) || 0;
  const pactLevel = Number(pact?.level) || 0;
  if (pactMax > 0 && level <= pactLevel) {
    return diamondsFromPool(pact.value, pactMax);
  }
  return null;
}

/** True when the actor can spend a slot of this key, including pact fallback. */
export function hasAvailableSpellSlot(actor, slotKey) {
  if (!slotKey || !actor) return true;
  const spells = actor.system?.spells ?? {};
  if ((spells[slotKey]?.value ?? 0) > 0) return true;

  if (String(slotKey).startsWith("spell")) {
    const level = Number(String(slotKey).slice(5));
    const pact = spells.pact;
    if (
      Number.isFinite(level)
      && level > 0
      && (Number(pact?.max) || 0) > 0
      && level <= (Number(pact?.level) || 0)
      && (Number(pact?.value) || 0) > 0
    ) {
      return true;
    }
  }
  return false;
}
