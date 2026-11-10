/**
 * Automated Animations matches an item by its displayed name. A translated name
 * misses the English auto-recognition list. These helpers find that list entry
 * from an English key (identifier, base weapon, original name) so the caller
 * can hand AA the entry's own label.
 */

export const MENUS = Object.freeze(["melee", "range", "ontoken", "templatefx", "aura", "preset"]);
export const AREA_MENUS = Object.freeze(["templatefx", "aura", "preset"]);

export function normalize(text) {
  return String(text ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export const rinse = (text) => String(text ?? "").replace(/\s+/g, "").toLowerCase();

export function sortedEntries(settings, menus = MENUS) {
  const all = menus.flatMap((menu) => (settings?.[menu] ?? [])
    .filter((e) => e?.label)
    .map((e) => ({ ...e, menu: e.menu ?? menu })));
  return all.sort((a, b) => b.label.replace(/\s+/g, "").length - a.label.replace(/\s+/g, "").length);
}

export function aaSearch(entries, name) {
  if (!name) return null;
  const rinsed = rinse(name);
  const exact = entries.find((e) => e.advanced?.exactMatch && e.label === name);
  if (exact) return exact;
  return entries.find((e) => !e.advanced?.exactMatch
    && rinsed.includes(rinse(e.label))
    && !(e.advanced?.excludedTerms ?? []).some((t) => t && rinsed.includes(rinse(t)))) ?? null;
}

export function aaNative(settings, { names = [], itemName = "", isTemplate = false } = {}) {
  let found = null;
  for (const name of names) {
    found = aaSearch(sortedEntries(settings), name);
    if (found) break;
  }
  if (found && isTemplate && ["melee", "range", "ontoken"].includes(found.menu)) {
    found = aaSearch(sortedEntries(settings, ["templatefx"]), itemName);
  }
  return found;
}

function keySearch(entries, key) {
  if (!key) return null;
  const exact = entries.find((e) => e.advanced?.exactMatch && normalize(e.label) === key);
  if (exact) return exact;
  return entries.find((e) => {
    if (e.advanced?.exactMatch) return false;
    const label = normalize(e.label);
    return label && key.includes(label)
      && !(e.advanced?.excludedTerms ?? []).some((t) => normalize(t) && key.includes(normalize(t)));
  }) ?? null;
}

/** English lookup keys AA would not already try from the displayed name. */
export function englishKeys({ name = "", activityName = "", babeleName = "", identifier = "", baseItem = "" } = {}) {
  const own = new Set([normalize(name), normalize(activityName)]);
  const keys = [];
  const push = (text) => {
    const key = normalize(text);
    if (key && !own.has(key) && !keys.includes(key)) keys.push(key);
  };
  push(babeleName);
  if (identifier && identifier !== "new-item") push(identifier);
  push(baseItem);
  return keys;
}

/**
 * The auto-recognition label to give AA, or null when AA already finds the item
 * or no English key matches.
 */
export function resolveLabel(settings, { keys = [], nativeNames = [], itemName = "", isTemplate = false } = {}) {
  if (aaNative(settings, { names: nativeNames, itemName, isTemplate })) return null;
  const entries = sortedEntries(settings, isTemplate ? AREA_MENUS : MENUS);
  for (const key of keys) {
    const entry = keySearch(entries, key);
    if (entry) return { label: entry.label, menu: entry.menu, key };
  }
  return null;
}
