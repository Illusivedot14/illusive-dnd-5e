/**
 * Step library — what a declaration can do.
 *
 * patch steps rewrite the moment's outcome (the consumer of that moment applies
 * them); write steps change documents through the write gateway. Every step
 * declares how it is undone:
 *   "none-needed"  — a patch; it only exists inside the moment
 *   "gateway"      — the write gateway records the inverse (undo restores it)
 *   "irreversible" — a chat card / dice; undo cannot take it back
 *
 * `to` selects creatures: "self" | "trigger" | "target" (first) | "targets" | "damaged"
 * | "ally" (the reactor's chosen ally, else self) | "nearTarget" (the attacked
 * creature within 5 ft of self).
 */

export const SELECTORS = Object.freeze(["self", "trigger", "target", "targets", "damaged", "ally", "nearTarget"]);

/** Damage types a step can take from the moment: every type, or only the elemental ones. */
export const TYPE_SOURCES = Object.freeze(["trigger", "elemental"]);

export const STEPS = Object.freeze({
  // ---- patches ---------------------------------------------------------
  advantage: { kind: "patch", patch: "attackAdvantage", inverse: "none-needed", params: [] },
  disadvantage: { kind: "patch", patch: "attackDisadvantage", inverse: "none-needed", params: [] },
  attackBonus: { kind: "patch", patch: "attackBonus", inverse: "none-needed", params: ["value"] },
  attackPenalty: { kind: "patch", patch: "attackPenalty", inverse: "none-needed", params: ["value"] },
  acBonus: { kind: "patch", patch: "acBonus", inverse: "none-needed", params: ["value"], targeted: true },
  damageReduce: { kind: "patch", patch: "damageReduce", inverse: "none-needed", params: ["value"], targeted: true },
  damageMultiplier: { kind: "patch", patch: "damageMultiplier", inverse: "none-needed", params: ["value"], targeted: true },
  resist: { kind: "patch", patch: "resistTypes", inverse: "none-needed", params: ["types"], targeted: true },
  // On an attack hit this rerolls the attack; on a save or check, the d20.
  reroll: { kind: "patch", patch: "rerollD20", inverse: "none-needed", params: ["keep", "advantage"] },
  cancelCast: { kind: "patch", patch: "cancelCast", inverse: "none-needed", params: [] },
  // 2024: the caster saves against the reactor's DC. 2014: automatic up to the counter slot, else a check.
  counterspell: { kind: "patch", patch: "cancelCast", inverse: "none-needed", params: [] },
  // ---- writes ----------------------------------------------------------
  damage: { kind: "write", inverse: "gateway", params: ["value", "damageType"], targeted: true },
  heal: { kind: "write", inverse: "gateway", params: ["value"], targeted: true },
  tempHp: { kind: "write", inverse: "gateway", params: ["value"], targeted: true },
  applyStatus: { kind: "write", inverse: "gateway", params: ["status"], targeted: true },
  removeStatus: { kind: "write", inverse: "gateway", params: ["status"], targeted: true },
  applyEffect: { kind: "write", inverse: "gateway", params: ["effect"], targeted: true },
  endEffect: { kind: "write", inverse: "gateway", params: ["name"], targeted: true },
  setFlag: { kind: "write", inverse: "gateway", params: ["key", "value"], targeted: true },
  // `item` names another item to spend from (a pattern, e.g. "superiority"); default is the source item.
  spendUses: { kind: "write", inverse: "gateway", params: ["amount", "item"] },
  // Advantage on the creature's next attack, check or save within a minute.
  grantAdvantage: { kind: "write", inverse: "gateway", params: [], targeted: true },
  // Bonus damage on a later hit; ownTurnOnly arms at the creature's next turn.
  hitRider: { kind: "write", inverse: "gateway", params: ["formula", "damageType", "meleeOnly", "ownTurnOnly"], targeted: true },
  // Resistance that outlasts the moment, as an effect ending at `until` (a special duration).
  resistEffect: { kind: "write", inverse: "gateway", params: ["types", "until"], targeted: true },
  note: { kind: "write", inverse: "irreversible", params: ["text"] }
});

export const STEP_IDS = Object.freeze(Object.keys(STEPS));

const OPTIONAL = new Set(["damageType", "amount", "value", "item", "keep", "advantage", "meleeOnly", "ownTurnOnly"]);

export function stepDef(id) {
  return STEPS[id] ?? null;
}

export function isPatchStep(step) {
  return stepDef(step?.step)?.kind === "patch";
}

/** A numeric value or a formula string ("2d8", "5 * @sourceLevel"). */
function isValue(v) {
  return (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.trim().length > 0);
}

function isTypes(types) {
  return TYPE_SOURCES.includes(types) || Array.isArray(types);
}

export function stepErrors(step, path = "do") {
  const def = stepDef(step?.step);
  if (!def) return [`${path}: unknown step "${step?.step}"`];
  const errors = [];
  if (def.targeted && step.to != null && !SELECTORS.includes(step.to)) {
    errors.push(`${path}: unknown selector "${step.to}"`);
  }
  for (const param of def.params) {
    if (OPTIONAL.has(param) && step[param] == null) continue;
    if (step[param] == null) errors.push(`${path}: "${step.step}" needs "${param}"`);
  }
  if (step.value != null && !isValue(step.value)) errors.push(`${path}: "value" must be a number or formula`);
  if (["damage", "heal", "tempHp", "attackBonus", "attackPenalty", "acBonus", "damageReduce", "damageMultiplier"]
    .includes(step.step) && step.value == null) {
    errors.push(`${path}: "${step.step}" needs "value"`);
  }
  if (["resist", "resistEffect"].includes(step.step) && step.types != null && !isTypes(step.types)) {
    errors.push(`${path}: "${step.step}.types" must be a list, "trigger" or "elemental"`);
  }
  if (step.keep != null && !["lower", "new"].includes(step.keep)) {
    errors.push(`${path}: "keep" must be "lower" or "new"`);
  }
  return errors;
}

/** Default selector when a targeted step omits `to`. */
export function defaultSelector(step) {
  if (step?.step === "damage") return "trigger";
  return "self";
}
