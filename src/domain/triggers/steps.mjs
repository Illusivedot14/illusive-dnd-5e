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
 * creature within 5 ft of self) | "nearby" (creatures within `feet`, default 60).
 */

export const SELECTORS = Object.freeze(["self", "trigger", "target", "targets", "damaged", "ally", "nearTarget", "nearby"]);

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
  /** Half the damage of this hit or save. */
  halve: { kind: "patch", patch: "damageMultiplier", inverse: "none-needed", params: [], targeted: true },
  /** This attack misses the reactor. */
  miss: { kind: "patch", patch: "forceMiss", inverse: "none-needed", params: [], targeted: true },
  /** The attacker saves or the attack is wasted. */
  ward: { kind: "patch", patch: "cancelAttack", inverse: "none-needed", params: ["ability", "dc"] },
  /** A critical hit becomes a normal hit. */
  uncrit: { kind: "patch", patch: "uncrit", inverse: "none-needed", params: [] },
  /** The attack strikes the reactor instead. */
  intercept: { kind: "patch", patch: "redirect", inverse: "none-needed", params: [] },
  /** This save deals no damage on a success and half on a failure. */
  evade: { kind: "patch", patch: "saveEvasion", inverse: "none-needed", params: [] },
  /** One extra action this turn. */
  grantAction: { kind: "write", inverse: "gateway", params: [] },
  /** Set dashed, disengaged, or dodging on this turn's budget. */
  budget: { kind: "write", inverse: "gateway", params: ["key"] },
  /** Drop the target to 0 when its current hit points are at or under `hp`. */
  slayBelow: { kind: "write", inverse: "gateway", params: ["hp"], targeted: true },
  /** A miss becomes a hit. */
  connect: { kind: "patch", patch: "forceHit", inverse: "none-needed", params: [] },
  /** Move to 5 feet from the selected creature, when that space is within `feet`. */
  teleport: { kind: "write", inverse: "gateway", params: ["feet"] },
  /** Trade places with the nearest ally within 5 feet. */
  swap: { kind: "write", inverse: "gateway", params: [] },
  /** The creature may move up to `feet` without spending speed or provoking. */
  grantMove: { kind: "write", inverse: "gateway", params: ["feet"], targeted: true },
  /** One extra reaction this turn. */
  grantReaction: { kind: "write", inverse: "gateway", params: [], targeted: true },
  /** Restore the highest expended slot at or under `level`. */
  restoreSlot: { kind: "write", inverse: "gateway", params: ["level"] },
  /** Store a die on the next attack roll, check, or save. */
  pendingDie: { kind: "write", inverse: "gateway", params: ["value"], targeted: true },
  /** Ask once, then resist that type or ignore resistance to it. */
  chooseType: { kind: "write", inverse: "gateway", params: ["key"] },
  /** Apply or remove a status from the light at this token. */
  veil: { kind: "write", inverse: "gateway", params: ["status"], targeted: true },
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
  // Bonus damage folded into the hit that is being resolved. "@item" rolls the source item.
  bonusDamage: { kind: "patch", patch: "bonusDamage", inverse: "none-needed", params: ["value"], targeted: true },
  // Bonus damage on a later hit; ownTurnOnly arms at the creature's next turn.
  hitRider: { kind: "write", inverse: "gateway", params: ["formula", "damageType", "meleeOnly", "ownTurnOnly"], targeted: true },
  // Resistance that outlasts the moment, as an effect ending at `until` (a special duration).
  resistEffect: { kind: "write", inverse: "gateway", params: ["types", "until"], targeted: true },
  note: { kind: "write", inverse: "irreversible", params: ["text"] },
  // Roll a save. onFail is a status. damage is applied in full on a failure, scaled by onSave on a success.
  save: { kind: "write", inverse: "gateway", params: ["ability", "dc"], targeted: true },
  // Shove the creature this many feet directly away from the source.
  push: { kind: "write", inverse: "gateway", params: ["feet"], targeted: true },
  // A region around the source. when: turnStart, enter, or square. follow defaults on.
  zone: { kind: "write", inverse: "gateway", params: ["feet", "when"] },
  // Athletics vs Athletics or Acrobatics (2014), or a Strength or Dexterity save (2024).
  grapple: { kind: "write", inverse: "gateway", params: [], targeted: true },
  // Source check against each target. onWin is a status applied to the loser.
  contest: { kind: "write", inverse: "gateway", params: ["ability", "vs"], targeted: true },
  // Deny action, bonus, reaction, or move, or give an order, confusion, or slow.
  control: { kind: "write", inverse: "gateway", params: [], targeted: true },
  // Spend sorcery points and remember the option. Heightened and Careful change the next save.
  metamagic: { kind: "write", inverse: "gateway", params: ["option"] },
  // Replace hit points (and AC) with the beast, or restore them when end is set.
  wildShape: { kind: "write", inverse: "gateway", params: [] },
  // Grant inspiration, or spend it for advantage on the next d20.
  inspiration: { kind: "write", inverse: "gateway", params: [] },
  // mode "store" rolls the dice. mode "replace" spends one on this d20.
  portent: { kind: "patch", patch: "d20Replace", inverse: "none-needed", params: ["mode"] },
  // Spend the pool and heal that many points.
  layOnHands: { kind: "write", inverse: "gateway", params: ["value"], targeted: true },
  // Spend one use and treat the failed save as a success.
  legendaryResistance: { kind: "patch", patch: "saveSuccess", inverse: "none-needed", params: [] },
  // At the start of the turn, a d6 at or above `on` (default 6) restores the item's uses.
  recharge: { kind: "write", inverse: "gateway", params: ["item"] },
  // The hit lands on an ally instead.
  redirect: { kind: "patch", patch: "redirect", inverse: "none-needed", params: [] },
  // At 0 hit points, stand back up at half and leave a copy beside you.
  split: { kind: "write", inverse: "gateway", params: [] },
  // Copy an effect onto creatures in range. The aura sync uses this same copy.
  aura: { kind: "write", inverse: "gateway", params: ["feet"] },
  // Pull the creature this many feet toward the source.
  pull: { kind: "write", inverse: "gateway", params: ["feet"], targeted: true },
  // Mark the creature so the source's mark riders apply to it.
  mark: { kind: "write", inverse: "gateway", params: [], targeted: true },
  // The creature regains its reaction.
  freeReaction: { kind: "write", inverse: "gateway", params: [] },
  // At the start of each of the creature's turns, the named effect ends on a successful save.
  repeatSave: { kind: "write", inverse: "gateway", params: ["ability", "dc", "name"], targeted: true },
  // The named effect ends when the creature takes an action.
  endOnAction: { kind: "write", inverse: "gateway", params: ["name"], targeted: true },
  // The attacker has disadvantage on its next attack against this ally.
  lingeringDisadvantage: { kind: "write", inverse: "gateway", params: [] },
  // Slide a zone the caster placed and can move.
  moveZone: { kind: "write", inverse: "gateway", params: ["feet"] },
  // Terrain under the creature catches fire.
  ignite: { kind: "write", inverse: "gateway", params: [] }
});

export const STEP_IDS = Object.freeze(Object.keys(STEPS));

const OPTIONAL = new Set(["damageType", "amount", "value", "item", "keep", "advantage", "meleeOnly", "ownTurnOnly", "onFail", "onSave", "damage"]);
const SAVE_ABILITIES = new Set(["str", "dex", "con", "int", "wis", "cha"]);
const ZONE_WHENS = new Set(["turnStart", "enter", "square", "enterOrTurn"]);
const META_OPTIONS = new Set(["subtle", "distant", "extended", "careful", "empowered", "quickened", "heightened", "twinned"]);
const CONTROL_DENIALS = new Set(["action", "bonus", "reaction", "move"]);
const AURA_AFFECTS = new Set(["ally", "enemy", "self", "any"]);

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
  if (step.step === "budget" && !["dashed", "disengaged", "dodging"].includes(step.key)) {
    errors.push(`${path}: "key" must be "dashed", "disengaged", or "dodging"`);
  }
  if (step.step === "slayBelow" && !(Number(step.hp) > 0)) {
    errors.push(`${path}: "hp" must be greater than 0`);
  }
  if (step.step === "chooseType" && !Array.isArray(step.types)) {
    errors.push(`${path}: "types" must be a list`);
  }
  if (step.step === "save" || step.step === "ward") {
    if (!SAVE_ABILITIES.has(step.ability)) errors.push(`${path}: "ability" must be a saving throw`);
    if (!isValue(step.dc)) errors.push(`${path}: "dc" must be a number or formula`);
  }
  if (step.step === "push" && !(Number(step.feet) > 0)) errors.push(`${path}: "feet" must be greater than 0`);
  if (step.step === "zone") {
    if (!(Number(step.feet) > 0)) errors.push(`${path}: "feet" must be greater than 0`);
    if (!ZONE_WHENS.has(step.when)) {
      errors.push(`${path}: "when" must be "turnStart", "enter", "square", or "enterOrTurn"`);
    }
  }
  if (step.onSave != null && !["none", "half", "full"].includes(step.onSave)) {
    errors.push(`${path}: "onSave" must be "none", "half" or "full"`);
  }
  if (step.step === "control") {
    const orders = ["approach", "flee", "halt", "grovel", "drop"];
    const shaped = Array.isArray(step.deny) || step.confusion || step.slow || orders.includes(step.order);
    if (!shaped) errors.push(`${path}: "control" needs "deny", "order", "confusion", or "slow"`);
    if (Array.isArray(step.deny) && step.deny.some((part) => !CONTROL_DENIALS.has(part))) {
      errors.push(`${path}: "deny" must list action, bonus, reaction, or move`);
    }
  }
  if (step.step === "pull" && !(Number(step.feet) > 0)) errors.push(`${path}: "feet" must be greater than 0`);
  if (step.step === "repeatSave") {
    if (!SAVE_ABILITIES.has(step.ability)) errors.push(`${path}: "ability" must be a saving throw`);
    if (!isValue(step.dc)) errors.push(`${path}: "dc" must be a number or formula`);
  }
  if (step.step === "moveZone" && !(Number(step.feet) > 0)) errors.push(`${path}: "feet" must be greater than 0`);
  if (step.step === "metamagic" && !META_OPTIONS.has(step.option)) {
    errors.push(`${path}: "option" must be a metamagic option`);
  }
  if (step.step === "portent" && !["store", "replace"].includes(step.mode)) {
    errors.push(`${path}: "mode" must be "store" or "replace"`);
  }
  if (step.step === "layOnHands" && !isValue(step.value)) {
    errors.push(`${path}: "value" must be a number or formula`);
  }
  if (step.step === "aura") {
    if (!(Number(step.feet) > 0)) errors.push(`${path}: "feet" must be greater than 0`);
    if (step.affects != null && !AURA_AFFECTS.has(step.affects)) {
      errors.push(`${path}: "affects" must be "ally", "enemy", "self", or "any"`);
    }
  }
  return errors;
}

/** Default selector when a targeted step omits `to`. */
export function defaultSelector(step) {
  if (step?.step === "damage") return "trigger";
  if (["save", "push", "pull", "grapple", "contest", "control", "layOnHands", "mark", "repeatSave"].includes(step?.step)) return "target";
  return "self";
}
