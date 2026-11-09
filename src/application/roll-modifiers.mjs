/**
 * Automatic attack / check / save advantage-disadvantage from statuses & marks.
 */

import { MODULE_ID } from "../constants.mjs";
import { collectToggleAttackModifiers } from "./feature-toggles.mjs";
import { evaluateFlanking } from "./flanking.mjs";
import { evaluateVisibilityBetween, actorVisionFlags } from "./perception.mjs";
import { hasAnyStatus, DEFENDER_GRANTS_ADVANTAGE } from "../domain/combat/conditions.mjs";
import { isMeleeAttack, isRangedAttack } from "../domain/combat/activity-kind.mjs";
import { hasNextD20Advantage, consumeNextD20Advantage } from "./reactions/reaction-state.mjs";
import { unsetDocFlag } from "../foundry/write-gateway.mjs";

/** Silvery Barbs grant: advantage on the next attack, check, or save. */
function applyGrantedAdvantage(actor, reasons) {
  if (!hasNextD20Advantage(actor)) return false;
  reasons.push("silvery-barbs");
  return true;
}

/** Spend one-shot advantage sources a roll used (the reasons list from a collector). */
export async function consumeRollAdvantage(actor, reasons = []) {
  if (reasons.includes("silvery-barbs")) await consumeNextD20Advantage(actor);
}

const ABILITY_LABELS = Object.freeze({
  str: "strength",
  dex: "dexterity",
  con: "constitution",
  int: "intelligence",
  wis: "wisdom",
  cha: "charisma"
});

const GRANT_ADV_STATUSES = new Set([
  "faerie-fire", "faerieFire", "guiding-bolt", "blinded", "paralyzed",
  "restrained", "stunned", "unconscious", "petrified", "incapacitated"
]);

/**
 * Collect attack roll modifiers for attacker vs optional defender.
 * @returns {{ advantage: boolean, disadvantage: boolean, attackBonus: number, damageBonus: number, reasons: string[] }}
 */
export function collectAttackModifiers({
  attacker,
  defender = null,
  item = null,
  attackerToken = null,
  defenderToken = null
} = {}) {
  const reasons = [];
  let advantage = false;
  let disadvantage = false;
  let attackBonus = 0;
  let damageBonus = 0;

  if (typeof attacker?.hasConditionEffect === "function") {
    if (attacker.hasConditionEffect("attackDisadvantage")) {
      disadvantage = true;
      reasons.push("attacker-condition");
    }
  } else if (attacker?.statuses?.has?.("poisoned")) {
    disadvantage = true;
    reasons.push("poisoned");
  }

  // Frightened: disadvantage only while the source is in sight (simplified: source token present).
  if (attacker?.statuses?.has?.("frightened") || attacker?.effects?.some?.((e) => e.statuses?.has?.("frightened"))) {
    const frightEffect = [...(attacker.effects ?? [])].find((e) => e.statuses?.has?.("frightened"));
    const origin = frightEffect?.origin;
    let sourceVisible = true;
    if (origin && attackerToken) {
      const sourceToken = canvas.tokens?.placeables?.find(
        (t) => t.actor && (String(origin).includes(t.actor.uuid) || String(origin).includes(t.actor.id))
      );
      if (sourceToken) {
        sourceVisible = !sourceToken.document?.hidden
          && (typeof attackerToken.isVisible === "boolean" ? true : true);
      }
    }
    if (sourceVisible) {
      disadvantage = true;
      reasons.push("frightened");
    }
  }

  if (attacker?.statuses?.has?.("invisible") || attacker?.statuses?.has?.("hiding")) {
    advantage = true;
    reasons.push("unseen-attacker");
  }
  if (defender?.statuses?.has?.("invisible") && !attacker?.statuses?.has?.("seeInvisibility")) {
    disadvantage = true;
    reasons.push("invisible-target");
  }
  if (defender?.statuses?.has?.("prone") && item) {
    if (isRangedAttack(null, item)) {
      disadvantage = true;
      reasons.push("prone-ranged");
    } else {
      advantage = true;
      reasons.push("prone-melee");
    }
  }
  if (hasAnyStatus(defender, DEFENDER_GRANTS_ADVANTAGE)) {
    advantage = true;
    reasons.push("defender-incapacitating");
  }
  if (attacker?.statuses?.has?.("restrained")) {
    disadvantage = true;
    reasons.push("attacker-restrained");
  }
  if (attacker?.statuses?.has?.("blinded")) {
    disadvantage = true;
    reasons.push("blinded");
  }

  // Target grants advantage (Faerie Fire, Guiding Bolt effect names / statuses).
  if (defenderGrantsAttackAdvantage(defender)) {
    advantage = true;
    reasons.push("grant-advantage");
  }

  if (applyGrantedAdvantage(attacker, reasons)) advantage = true;

  // Help action: one-shot advantage flag on the helper's chosen target.
  try {
    const help = defender?.getFlag?.(MODULE_ID, "helpedBy");
    if (help && attacker && (help.attackerUuid === attacker.uuid || help === true)) {
      advantage = true;
      reasons.push("help");
    }
  } catch {
    /* ignore */
  }

  // Flanking (optional DMG rule — always on for Illusive full automation).
  if (attackerToken && defenderToken && evaluateFlanking(attackerToken, defenderToken)) {
    advantage = true;
    reasons.push("flanking");
  }

  // Sight pair from Illusive vision/lighting (obscurement / unseen).
  const sight = applySightPairModifiers({
    attackerToken,
    defenderToken,
    attacker,
    defender,
    reasons
  });
  if (sight.advantage) advantage = true;
  if (sight.disadvantage) disadvantage = true;

  // Feature toggles (Reckless / GWM / SS)
  const toggles = collectToggleAttackModifiers(attacker, item);
  if (toggles.advantage) {
    advantage = true;
    reasons.push(...toggles.reasons.filter((r) => r === "reckless"));
  }
  if (toggles.attackBonus) {
    attackBonus += toggles.attackBonus;
    reasons.push(...toggles.reasons.filter((r) => r === "gwm" || r === "sharpshooter"));
  }
  if (toggles.damageBonus) damageBonus += toggles.damageBonus;

  // Reckless grants advantage on attacks against the reckless actor until next turn —
  // stored as flag when reckless is used.
  try {
    if (defender?.getFlag?.(MODULE_ID, "recklessOpen") && attacker) {
      advantage = true;
      reasons.push("vs-reckless");
    }
  } catch {
    /* ignore */
  }

  return { advantage, disadvantage, attackBonus, damageBonus, reasons };
}

function defenderGrantsAttackAdvantage(defender) {
  if (!defender) return false;
  for (const status of defender.statuses ?? []) {
    if (GRANT_ADV_STATUSES.has(status)) return true;
  }
  for (const effect of defender.effects ?? []) {
    if (effect.disabled) continue;
    const name = String(effect.name ?? "").toLowerCase();
    if (name.includes("faerie fire") || name.includes("guiding bolt") || name.includes("fairy fire")) {
      return true;
    }
    if (effect.flags?.[MODULE_ID]?.grantAttackAdvantage) return true;
  }
  return false;
}

/**
 * Hex / cursed ability-check disadvantage for a chosen ability.
 */
export function hexAbilityDisadvantage(actor, ability) {
  if (!actor || !ability) return false;
  const label = ABILITY_LABELS[ability] ?? ability;
  for (const effect of actor.effects ?? []) {
    if (effect.disabled) continue;
    const name = String(effect.name ?? "").toLowerCase();
    const isHex = name.includes("hexed") || name === "hex" || name.includes("hex:");
    const cursed = effect.statuses?.has?.("cursed") || name.includes("hex");
    if (!isHex && !cursed) continue;
    if (name.includes(label) || name.includes(ability)) return true;
    const flagged = effect.flags?.dnd5e?.ability
      ?? effect.flags?.dnd5e?.spell?.ability
      ?? effect.flags?.[MODULE_ID]?.ability;
    if (flagged === ability) return true;
    const changes = effect.changes ?? effect.system?.changes ?? [];
    for (const ch of changes) {
      if (String(ch.key ?? "").includes(`abilities.${ability}.check.roll.mode`)
        && Number(ch.value) < 0) return true;
    }
  }
  return false;
}

export function collectAbilityCheckModifiers({
  actor,
  ability = null,
  actorToken = null,
  subjectToken = null
} = {}) {
  const reasons = [];
  let advantage = false;
  let disadvantage = false;

  if (typeof actor?.hasConditionEffect === "function") {
    if (actor.hasConditionEffect("abilityCheckDisadvantage")) {
      disadvantage = true;
      reasons.push("condition-check-dis");
    }
  } else if (actor?.statuses?.has?.("poisoned")) {
    disadvantage = true;
    reasons.push("poisoned");
  }

  if (ability && hexAbilityDisadvantage(actor, ability)) {
    disadvantage = true;
    reasons.push(`hex-${ability}`);
  }
  if (applyGrantedAdvantage(actor, reasons)) advantage = true;

  // Lightly obscured (dim, no darkvision): disadvantage on Wisdom (Perception).
  if (ability === "wis" && actorToken) {
    const observerUuid = actorToken.document?.uuid ?? actorToken.uuid;
    const targetUuid = subjectToken?.document?.uuid
      ?? subjectToken?.uuid
      ?? observerUuid;
    try {
      const vis = evaluateVisibilityBetween({ observerUuid, targetUuid });
      const dim = vis?.light?.level === "dim";
      if (dim && !actorVisionFlags(actor).observerHasDarkvision) {
        disadvantage = true;
        reasons.push("lightly-obscured");
      }
    } catch {
      /* ignore */
    }
  }

  return { advantage, disadvantage, reasons };
}

/**
 * Bidirectional visibility → attack advantage / disadvantage.
 * Mutates `reasons`; returns which mods to set.
 */
function applySightPairModifiers({
  attackerToken,
  defenderToken,
  attacker,
  defender,
  reasons
}) {
  const out = { advantage: false, disadvantage: false };
  const atkUuid = attackerToken?.document?.uuid ?? attackerToken?.uuid ?? null;
  const defUuid = defenderToken?.document?.uuid ?? defenderToken?.uuid ?? null;
  if (!atkUuid || !defUuid) return out;

  let atkSeesDef = null;
  let defSeesAtk = null;
  try {
    atkSeesDef = evaluateVisibilityBetween({ observerUuid: atkUuid, targetUuid: defUuid });
  } catch {
    atkSeesDef = null;
  }
  try {
    defSeesAtk = evaluateVisibilityBetween({ observerUuid: defUuid, targetUuid: atkUuid });
  } catch {
    defSeesAtk = null;
  }

  const attackerBlindSight = actorVisionFlags(attacker).observerHasBlindSight;
  const defenderBlindSight = actorVisionFlags(defender).observerHasBlindSight;

  // Attacker cannot see defender → disadvantage (unseen target / heavy obscurement).
  if (atkSeesDef?.result === "not-visible" && !attackerBlindSight) {
    out.disadvantage = true;
    if (!reasons.includes("invisible-target") && !reasons.includes("blinded")) {
      reasons.push(atkSeesDef.reason === "darkness" || atkSeesDef.reason === "obscured"
        ? "obscured-target"
        : "unseen-target");
    }
  }

  // Defender cannot see attacker → advantage (unseen attacker).
  if (defSeesAtk?.result === "not-visible" && !defenderBlindSight) {
    out.advantage = true;
    if (!reasons.includes("unseen-attacker")) reasons.push("unseen-attacker");
  }

  return out;
}

export function collectSaveModifiers({ actor, ability = null } = {}) {
  const reasons = [];
  let advantage = false;
  let disadvantage = false;

  if (typeof actor?.hasConditionEffect === "function") {
    if (actor.hasConditionEffect("abilitySaveDisadvantage")) {
      disadvantage = true;
      reasons.push("condition-save-dis");
    }
    if (ability === "dex" && actor.hasConditionEffect("dexteritySaveDisadvantage")) {
      disadvantage = true;
      reasons.push("restrained-dex");
    }
  } else if (actor?.statuses?.has?.("restrained") && ability === "dex") {
    disadvantage = true;
    reasons.push("restrained-dex");
  }
  if (applyGrantedAdvantage(actor, reasons)) advantage = true;

  return { advantage, disadvantage, reasons };
}

export function targetHasCastersMark(attacker, defender, { statuses = ["marked", "cursed"] } = {}) {
  if (!attacker || !defender) return false;
  for (const effect of defender.effects ?? []) {
    const statusHit = statuses.some((s) => effect.statuses?.has?.(s)
      || effect.name?.toLowerCase?.().includes("hex")
      || effect.name?.toLowerCase?.().includes("hunter"));
    if (!statusHit) continue;
    const origin = effect.origin ?? effect.flags?.dnd5e?.origin;
    if (!origin) return true;
    if (String(origin).includes(attacker.uuid) || String(origin).includes(attacker.id)) return true;
    if (String(origin).startsWith(attacker.uuid)) return true;
  }
  return Boolean(
    defender.statuses?.has?.("marked")
    || defender.statuses?.has?.("cursed")
  );
}

export function rageDamageBonus(attacker, item) {
  if (!attacker?.statuses?.has?.("rage") && !attacker?.effects?.some?.((e) => /rage/i.test(e.name ?? ""))) {
    return 0;
  }
  const abl = item?.system?.ability;
  const isStr = !abl || abl === "str";
  if (!isStr || !isMeleeAttack(null, item)) return 0;
  const level = Number(attacker.system?.details?.level) || 1;
  if (level >= 16) return 4;
  if (level >= 9) return 3;
  return 2;
}

export function evasionDamageFactor(actor, { ability, success } = {}) {
  if (ability !== "dex") return null;
  const has = actor?.items?.some?.((i) => {
    const id = i.system?.identifier ?? "";
    return id === "evasion" || /^evasion$/i.test(i.name ?? "");
  });
  if (!has) return null;
  return success ? 0 : 0.5;
}

/** Consume Help advantage after it is used. */
export async function consumeHelpAdvantage(defender) {
  if (!defender?.unsetFlag) return false;
  try {
    const help = defender.getFlag?.(MODULE_ID, "helpedBy");
    if (!help) return false;
    const result = await unsetDocFlag(defender, MODULE_ID, "helpedBy");
    return Boolean(result.ok);
  } catch {
    return false;
  }
}
