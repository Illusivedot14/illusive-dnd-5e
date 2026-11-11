/**
 * Verbal, somatic, and material components of a spell.
 * Subtle Spell removes the verbal and somatic ones.
 */

const LETTERS = Object.freeze({
  v: "verbal",
  s: "somatic",
  m: "material",
  vocal: "verbal",
  somatic: "somatic",
  material: "material"
});

function propertyList(properties) {
  if (!properties) return [];
  if (typeof properties.has === "function" && typeof properties[Symbol.iterator] === "function") {
    try { return [...properties]; } catch { /* fall through */ }
  }
  if (Array.isArray(properties)) return properties;
  return Object.entries(properties).filter(([, on]) => on).map(([key]) => key);
}

export function spellComponents(item) {
  const out = { verbal: false, somatic: false, material: false, recorded: false };
  const mark = (raw) => {
    const key = LETTERS[String(raw ?? "").toLowerCase()];
    if (key) out[key] = true;
  };
  const comp = item?.system?.components;
  if (comp && typeof comp === "object") {
    out.recorded = true;
    if (comp.vocal || comp.v) out.verbal = true;
    if (comp.somatic || comp.s) out.somatic = true;
    if (comp.material || comp.m) out.material = true;
  }
  for (const part of propertyList(item?.system?.properties)) mark(part);
  if (item?.system?.materials?.value || item?.system?.materials?.consumed) {
    out.material = true;
    out.recorded = true;
  }
  return out;
}

/** Components the cast still requires after metamagic. */
export function componentsForCast(item, metamagic) {
  const components = spellComponents(item);
  if (metamagic === "subtle") {
    return { verbal: false, somatic: false, material: components.material, recorded: components.recorded };
  }
  return components;
}

/**
 * A cast others can notice. Subtle Spell leaves only a material component.
 * A spell that lists no components is silent. A spell with no component record
 * is still a cast someone can see.
 */
export function castIsPerceptible(components) {
  if (components?.verbal || components?.somatic || components?.material) return true;
  return components?.recorded !== true;
}

function effectNames(actor) {
  const names = [];
  for (const effect of actor?.appliedEffects ?? actor?.effects ?? []) {
    if (effect?.disabled) continue;
    if (effect?.name) names.push(String(effect.name).toLowerCase());
  }
  return names;
}

export function isSilenced(actor) {
  const statuses = actor?.statuses;
  if (typeof statuses?.has === "function" && statuses.has("silenced")) return true;
  return effectNames(actor).some((name) => name === "silence" || name === "silenced");
}

/**
 * A free hand for a somatic component. Each equipped weapon or shield uses one
 * hand. A two-handed weapon can be held in one hand while casting.
 */
export function hasFreeHand(actor) {
  let hands = 0;
  for (const item of actor?.items ?? []) {
    if (item?.system?.equipped === false) continue;
    const shield = item?.type === "equipment" && item?.system?.type?.value === "shield";
    const weapon = item?.type === "weapon";
    if (shield || weapon) hands += 1;
  }
  return hands < 2;
}

/** "verbal" or "somatic" when the caster cannot provide that component, else null. */
export function componentBlock(actor, components) {
  if (!components) return null;
  if (components.verbal && isSilenced(actor)) return "verbal";
  if (components.somatic && !hasFreeHand(actor)) return "somatic";
  return null;
}
