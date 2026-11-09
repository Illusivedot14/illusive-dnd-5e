/**
 * Opportunity attack use case — detect leave-reach on move, hold the move, prompt reactors.
 */

import { collectOpportunityCandidates, resolveReachFeet } from "../domain/combat/opportunity-attack.mjs";
import { resolveRulesContext } from "../foundry/dnd5e-adapter.mjs";
import { getGridFacts, getTokenFacts } from "../foundry/scene-adapter.mjs";
import { spaceFeetBetween } from "../domain/spatial/geometry.mjs";
import {
  isEconomyAvailable,
  isDisengaged,
  readBudget,
  writeBudget,
  combatantForActor,
  getReactionTimeoutMs
} from "./economy.mjs";
import { featureEnabled } from "./levels.mjs";
import { settleReactionPrompt } from "./reaction-context.mjs";
import { promptReactor } from "./reactions/window.mjs";
import { beginPendingReaction } from "./combat.mjs";
import { MODULE_ID } from "../constants.mjs";
import { isHostile } from "../domain/combat/disposition.mjs";
import { isIncapacitated } from "../domain/combat/conditions.mjs";
import { listActivities } from "../domain/combat/activity-kind.mjs";

/** @type {Map<string, { changes: object, options: object, tokenUuid: string|null }>} */
const pendingMoves = new Map();

function feetBetween(aFacts, bFacts, grid) {
  return spaceFeetBetween(aFacts, bFacts, {
    gridSize: grid.size || 100,
    gridDistance: grid.distance || 5,
    includeElevation: true
  });
}

function actorReachFeet(actor) {
  const items = actor?.items ?? [];
  for (const item of items) {
    if (item.type !== "weapon" && item.type !== "feat") continue;
    for (const act of listActivities(item)) {
      if (act?.type !== "attack") continue;
      const reach = Number(act.range?.reach ?? act.range?.value ?? item.system?.range?.reach ?? 0);
      if (reach > 0) return resolveReachFeet({ reachFeet: reach });
    }
  }
  return 5;
}

function hasDisengageEffect(actor) {
  if (actor?.statuses?.has?.("disengage")) return true;
  if (isDisengaged(actor)) return true;
  try {
    return Boolean(actor?.getFlag?.(MODULE_ID, "disengaging"));
  } catch {
    return false;
  }
}

function listMeleeAttackActivities(actor) {
  const out = [];
  for (const item of actor.items ?? []) {
    for (const act of listActivities(item)) {
      if (act?.type !== "attack") continue;
      const range = act.range ?? item.system?.range ?? {};
      const units = range.units;
      const value = Number(range.value ?? range.reach ?? 0);
      const isMelee = units === "ft" && (range.reach != null || value <= 10)
        || act.attack?.type?.value === "melee"
        || item.system?.actionType === "mwak";
      if (!isMelee && units === "mi") continue;
      if (units === "ft" && value > 10 && !range.reach) continue;
      act.item = item;
      out.push(act);
    }
  }
  return out;
}

/**
 * Sync leave-reach scan. Does not prompt.
 * @returns {{ provoked: boolean, candidates: object[], observers: object[], token: object|null }}
 */
export function previewTokenMoveOpportunity({ tokenDoc, changes, options = {} }) {
  if (!featureEnabled("opportunityAttacks")) {
    return { provoked: false, candidates: [], observers: [], token: null };
  }
  if (changes?.x == null && changes?.y == null) {
    return { provoked: false, candidates: [], observers: [], token: null };
  }
  if (options.teleport || options.forced || options.illusiveSkipOA || options.illusiveApplyPending) {
    return { provoked: false, candidates: [], observers: [], token: null };
  }

  const token = tokenDoc?.object ?? canvas.tokens?.get(tokenDoc?.id);
  if (!token?.actor) {
    return { provoked: false, candidates: [], observers: [], token: null };
  }

  const grid = getGridFacts();
  const prior = getTokenFacts(token);
  const nextFacts = {
    ...prior,
    x: changes.x ?? prior.x,
    y: changes.y ?? prior.y
  };

  const moverDisengaging = hasDisengageEffect(token.actor);
  const observers = [];

  for (const other of canvas.tokens?.placeables ?? []) {
    if (!other?.actor || other.id === token.id) continue;
    if (!isHostile(token.document, other.document)) continue;

    const oFacts = getTokenFacts(other);
    observers.push({
      uuid: other.document?.uuid ?? other.uuid,
      token: other,
      edition: resolveRulesContext(other.actor).edition,
      moverHostile: true,
      canSee: !other.document?.hidden && !token.document?.hidden,
      hasReaction: isEconomyAvailable(other.actor, "reaction"),
      incapacitated: isIncapacitated(other.actor),
      fromFeet: feetBetween(oFacts, prior, grid),
      toFeet: feetBetween(oFacts, nextFacts, grid),
      reachFeet: actorReachFeet(other.actor)
    });
  }

  const candidates = collectOpportunityCandidates({
    moverUuid: token.document?.uuid,
    moverDisengaging,
    forcedMovement: Boolean(options.forced),
    teleport: Boolean(options.teleport),
    edition: resolveRulesContext(token.actor).edition,
    observers
  });

  return {
    provoked: candidates.length > 0,
    candidates,
    observers,
    token
  };
}

/**
 * Prompt reactors for a leave-reach move (after the move was held).
 */
export async function promptOpportunityReactions({ candidates, observers, token }) {
  if (!candidates?.length || !token) return { prompted: false };

  for (const candidate of candidates) {
    const observer = observers.find((o) => o.uuid === candidate.observerUuid);
    if (!observer?.token?.actor) continue;
    if (!isEconomyAvailable(observer.token.actor, "reaction")) continue;

    const melee = listMeleeAttackActivities(observer.token.actor);
    if (!melee.length) continue;

    const options = {
      triggerTokenUuid: token.document?.uuid,
      opportunityAttack: true,
      moverUuid: token.document?.uuid,
      rule: candidate.rule,
      pendingMoveTokenId: token.id
    };
    const where = promptReactor(observer.token.actor, melee, "opportunityAttack", options);
    if (where === "remote") {
      // Owner disconnected or never answered: pass, so the held move is not stuck.
      setTimeout(() => {
        if (!pendingMoves.has(token.id)) return;
        void settleReactionPrompt({ ...options, actorUuid: observer.token.actor.uuid }, { used: false });
      }, getReactionTimeoutMs() + 3000);
    }

    await beginPendingReaction({
      actorUuid: observer.token.actor.uuid,
      moverUuid: token.document?.uuid,
      trigger: "opportunity",
      rule: candidate.rule
    });

    try {
      Hooks.callAll(`${MODULE_ID}.opportunityAttack`, {
        mover: token,
        observer: observer.token,
        candidate,
        activities: melee
      });
    } catch {
      /* ignore */
    }
  }

  return { prompted: true };
}

/**
 * Inspect a token document update that changes x/y.
 * When provoked, callers should cancel the update and call stashPendingMove.
 */
export async function handleTokenMoveOpportunity({ tokenDoc, changes, options = {} }) {
  const preview = previewTokenMoveOpportunity({ tokenDoc, changes, options });
  if (!preview.provoked) return { provoked: false, candidates: [] };
  await promptOpportunityReactions(preview);
  return { provoked: true, candidates: preview.candidates };
}

export function stashPendingMove(tokenDoc, changes, options = {}) {
  if (!tokenDoc?.id) return;
  pendingMoves.set(tokenDoc.id, {
    changes: {
      ...(changes.x != null ? { x: changes.x } : {}),
      ...(changes.y != null ? { y: changes.y } : {})
    },
    options: { ...options },
    tokenUuid: tokenDoc.uuid ?? null
  });
}

export function getPendingMove(tokenId) {
  return pendingMoves.get(tokenId) ?? null;
}

export async function applyPendingMove(tokenId) {
  const pending = pendingMoves.get(tokenId);
  pendingMoves.delete(tokenId);
  if (!pending?.changes) return false;
  const token = canvas.tokens?.get(tokenId);
  const doc = token?.document;
  if (!doc?.update) return false;
  await doc.update(pending.changes, {
    ...pending.options,
    illusiveSkipOA: true,
    illusiveApplyPending: true
  });
  return true;
}

export function discardPendingMove(tokenId) {
  return pendingMoves.delete(tokenId);
}

/** Apply all pending moves for a mover uuid (or every pending if null). */
export async function releasePendingMovesForMover(moverUuid = null) {
  const ids = [...pendingMoves.entries()]
    .filter(([, p]) => !moverUuid || p.tokenUuid === moverUuid)
    .map(([id]) => id);
  for (const id of ids) await applyPendingMove(id);
}

export async function markDisengaging(actor, value = true) {
  if (!actor) return;
  const combatant = combatantForActor(actor);
  if (combatant) {
    const budget = readBudget(combatant) ?? {};
    await writeBudget(combatant, { ...budget, disengaged: Boolean(value) });
  }
  try {
    await actor.setFlag(MODULE_ID, "disengaging", Boolean(value));
  } catch {
    /* ignore */
  }
}
