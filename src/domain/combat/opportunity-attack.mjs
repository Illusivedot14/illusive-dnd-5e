/**
 * Opportunity attack eligibility — pure rules.
 * 2024: leave reach → reaction melee attack (Unarmed Strike / weapon).
 * 2014 / Legacy: leave reach → reaction melee attack.
 * Both: Disengage prevents; incapacitated / stunned / etc. cannot react;
 * teleportation / forced movement typically does not provoke (caller flags).
 */

import { isMeleeAttack, listActivities } from "./activity-kind.mjs";

/**
 * @typedef {"2024"|"2014"} Edition
 */

/**
 * Reach in feet for OA purposes.
 * @param {{ reachFeet?: number, weaponReachFeet?: number }} opts
 */
export function resolveReachFeet(opts = {}) {
  const reach = Number(opts.weaponReachFeet ?? opts.reachFeet ?? 5);
  return Number.isFinite(reach) && reach > 0 ? reach : 5;
}

/** First attack reach on the creature, else 5 ft. */
export function actorReachFeet(actor) {
  const items = actor?.items ?? [];
  for (const item of items) {
    if (item.type !== "weapon" && item.type !== "feat") continue;
    for (const act of listActivities(item)) {
      if (act?.type !== "attack") continue;
      const reach = Number(act.range?.reach ?? act.range?.value ?? item.system?.range?.reach ?? 0);
      if (reach > 0) return resolveReachFeet({ reachFeet: reach });
    }
    if (!isMeleeAttack(null, item)) continue;
    const itemReach = Number(item.system?.range?.reach ?? item.system?.range?.value ?? 0);
    if (itemReach > 0) return resolveReachFeet({ reachFeet: itemReach });
  }
  return 5;
}

/**
 * Did the mover leave the observer's reach?
 * Distances in feet (grid-normalized by caller).
 */
export function leftReach({ fromFeet, toFeet, reachFeet }) {
  const reach = resolveReachFeet({ reachFeet });
  const wasIn = fromFeet <= reach + 0.05;
  const nowOut = toFeet > reach + 0.05;
  return wasIn && nowOut;
}

/**
 * @param {object} input
 * @param {Edition} [input.edition]
 * @param {boolean} input.moverHostile
 * @param {boolean} input.observerCanSee
 * @param {boolean} input.observerHasReaction
 * @param {boolean} input.observerIncapacitated
 * @param {boolean} input.moverDisengaging
 * @param {boolean} [input.forcedMovement]
 * @param {boolean} [input.teleport]
 * @param {boolean} [input.moverIncapacitated]
 * @param {number} input.fromFeet
 * @param {number} input.toFeet
 * @param {number} [input.reachFeet]
 * @returns {{
 *   provokes: boolean,
 *   reason: string|null,
 *   rule: string,
 *   edition: Edition
 * }}
 */
export function evaluateOpportunityAttack(input) {
  const edition = input.edition === "2014" ? "2014" : "2024";
  const rule = edition === "2014" ? "combat.opportunity-attack.2014" : "combat.opportunity-attack.2024";

  if (input.teleport) {
    return { provokes: false, reason: "teleport", rule, edition };
  }
  if (input.forcedMovement) {
    return { provokes: false, reason: "forced-movement", rule, edition };
  }
  if (input.moverDisengaging) {
    return { provokes: false, reason: "disengage", rule, edition };
  }
  if (input.observerIncapacitated) {
    return { provokes: false, reason: "observer-incapacitated", rule, edition };
  }
  if (!input.observerHasReaction) {
    return { provokes: false, reason: "no-reaction", rule, edition };
  }
  if (!input.moverHostile) {
    return { provokes: false, reason: "not-hostile", rule, edition };
  }
  // 2014 requires you can see the creature; 2024 similarly needs awareness —
  // treat unseen as no OA unless blindsight already folded into canSee.
  if (!input.observerCanSee) {
    return { provokes: false, reason: "cannot-see", rule, edition };
  }
  if (input.moverIncapacitated) {
    // Still provokes if they leave reach under their own move; incapacitated
    // movers usually aren't taking Move. Keep eligible if caller says they moved.
  }

  if (!leftReach({
    fromFeet: input.fromFeet,
    toFeet: input.toFeet,
    reachFeet: input.reachFeet
  })) {
    return { provokes: false, reason: "did-not-leave-reach", rule, edition };
  }

  return { provokes: true, reason: null, rule, edition };
}

/**
 * Collect OA candidates among observers for one mover step.
 * @param {object} input
 * @param {object} input.mover  { uuid, hostileTo(observer) handled outside }
 * @param {Array<object>} input.observers  each with uuid + evaluate fields
 */
export function collectOpportunityCandidates(input) {
  const out = [];
  for (const observer of input.observers ?? []) {
    const result = evaluateOpportunityAttack({
      edition: input.edition ?? observer.edition,
      moverHostile: observer.moverHostile,
      observerCanSee: observer.canSee,
      observerHasReaction: observer.hasReaction,
      observerIncapacitated: observer.incapacitated,
      moverDisengaging: input.moverDisengaging,
      forcedMovement: input.forcedMovement,
      teleport: input.teleport,
      fromFeet: observer.fromFeet,
      toFeet: observer.toFeet,
      reachFeet: observer.reachFeet
    });
    if (result.provokes) {
      out.push({
        observerUuid: observer.uuid,
        moverUuid: input.moverUuid,
        ...result
      });
    }
  }
  return out;
}
