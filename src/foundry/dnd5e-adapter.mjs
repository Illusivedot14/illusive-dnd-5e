/**
 * dnd5e system adapter — edition context + activity/item.use only.
 * Combat resolution (hits, damage apply, economy) lives in application/resolve-activity.
 */

export function getConcentrationEffect(actor, item) {
  const effects = actor?.effects ?? actor?.appliedEffects ?? [];
  for (const effect of effects) {
    const isConc = effect?.statuses?.has?.("concentrating")
      || effect?.getFlag?.("dnd5e", "type") === "concentration"
      || /concentrat/i.test(effect?.name ?? "");
    if (!isConc) continue;
    if (!item) return effect;
    const origin = effect.origin ?? effect.getFlag?.("dnd5e", "itemUuid");
    if (!origin || origin === item.uuid) return effect;
  }
  return null;
}

/**
 * @returns {{ edition: "2014"|"2024", source: string|null }}
 */
export function resolveRulesContext(actor, item) {
  const fromItem = item?.system?.source?.rules
    ?? item?.flags?.dnd5e?.rulesVersion
    ?? null;
  const fromActor = actor?.flags?.dnd5e?.rulesVersion
    ?? actor?.system?.details?.rules
    ?? null;
  let fromWorld = null;
  try {
    fromWorld = game.settings?.get?.("dnd5e", "rulesVersion") ?? null;
  } catch {
    fromWorld = null;
  }

  const raw = String(fromItem ?? fromActor ?? fromWorld ?? "2024").toLowerCase();
  if (raw.includes("2014") || raw === "legacy") {
    return { edition: "2014", source: "dnd5e" };
  }
  return { edition: "2024", source: "dnd5e" };
}

async function resolveDocuments({ actorUuid, itemUuid, activityId, item, activity }) {
  let resolvedItem = item ?? null;
  let resolvedActivity = activity ?? null;

  if (!resolvedItem && itemUuid && typeof fromUuid === "function") {
    resolvedItem = await fromUuid(itemUuid);
  }
  if (!resolvedActivity && resolvedItem && activityId) {
    const acts = resolvedItem.system?.activities;
    resolvedActivity = acts?.get?.(activityId)
      ?? acts?.contents?.find?.((a) => a.id === activityId)
      ?? null;
  }
  return { item: resolvedItem, activity: resolvedActivity };
}

/**
 * dnd5e `usage.spell.slot` is a slot key ("spell3", "pact"), not a level.
 * A level prefers a regular slot with charges left, then a matching pact slot.
 */
export function spellSlotKeyForLevel(actor, level) {
  if (typeof level === "string" && !/^\d+$/.test(level)) return level;
  const n = Number(level);
  if (!Number.isFinite(n) || n <= 0) return null;
  const spells = actor?.system?.spells ?? {};
  const key = `spell${n}`;
  if ((Number(spells[key]?.value) || 0) > 0) return key;
  const pact = spells.pact;
  if (Number(pact?.level) === n && (Number(pact?.value) || 0) > 0) return "pact";
  return key;
}

/**
 * activity.use(usage, dialog, message) — dice/UI stay in dnd5e.
 * Set subsequentActions:false when Illusive will await rollAttack/rollDamage.
 * Resolves undefined when the use was dismissed or not allowed.
 */
export async function useActivity({
  item = null,
  activity = null,
  actorUuid = null,
  itemUuid = null,
  activityId = null,
  event = null,
  useOptions = {}
} = {}) {
  const resolved = await resolveDocuments({ actorUuid, itemUuid, activityId, item, activity });
  const docItem = resolved.item;
  const docActivity = resolved.activity;

  if (!docItem && !docActivity) {
    throw new Error("dnd5e-adapter.useActivity: missing item/activity");
  }

  const usage = { event };
  if (useOptions.subsequentActions === false) usage.subsequentActions = false;
  if (useOptions.subsequentActions === true) usage.subsequentActions = true;
  if (useOptions.spellLevel != null) {
    const actor = docActivity?.actor ?? docItem?.actor ?? null;
    const slot = spellSlotKeyForLevel(actor, useOptions.spellLevel);
    if (slot) usage.spell = { slot };
  }
  // Illusive owns AoE placement — stop dnd5e from placing a second area.
  if (useOptions.createMeasuredTemplate === false) {
    usage.create = { ...(usage.create ?? {}), measuredTemplate: false };
  }

  const dialog = {
    configure: useOptions.configureDialog === true
  };

  if (docActivity?.use) return docActivity.use(usage, dialog, {});
  if (docItem?.use) return docItem.use(usage, dialog, {});
  throw new Error("dnd5e-adapter.useActivity: no use() on activity or item");
}
