/**
 * Weapon masteries as rules. planMastery reads this list.
 * A new mastery is an entry. `effect` names the applier in application/mastery.mjs.
 * `effect: "steps"` runs `do` (damage with a number, or applyStatus) with no new code.
 */

export const MASTERY_RULES = Object.freeze([
  { id: "graze", on: "weaponMastery", phase: "miss", effect: "abilityModDamage" },
  { id: "cleave", on: "weaponMastery", phase: "hit", effect: "extraAdjacentAttack" },
  { id: "nick", on: "weaponMastery", phase: "hit", effect: "lightAttackAsAttackAction" },
  { id: "push", on: "weaponMastery", phase: "hit", effect: "push10" },
  { id: "sap", on: "weaponMastery", phase: "hit", effect: "disadvantageNextAttack" },
  { id: "slow", on: "weaponMastery", phase: "hit", effect: "reduceSpeed10" },
  { id: "topple", on: "weaponMastery", phase: "hit", effect: "conSaveOrProne" },
  { id: "vex", on: "weaponMastery", phase: "hit", effect: "advantageNextAttackVsTarget" }
]);
