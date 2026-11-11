/**
 * Opportunity attack use case — detect leave-reach on move, hold the move, prompt reactors.
 */

import { actorReachFeet, collectOpportunityCandidates, evaluateOpportunityAttack } from "../domain/combat/opportunity-attack.mjs";
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
import { settleReactionPrompt, reactionBatchDialog } from "./reaction-context.mjs";
import { MODULE_ID } from "../constants.mjs";
import { canAskGm, queryName } from "../foundry/gm-query.mjs";
import { remoteOwnerFor } from "../foundry/reaction-socket.mjs";
import { illusiveDndLocalize } from "../i18n/index.mjs";
import { tokenForActor, tokenFromUuid } from "../foundry/token-lookup.mjs";
import { isHostile } from "../domain/combat/disposition.mjs";
import { isIncapacitated } from "../domain/combat/conditions.mjs";
import { isMeleeAttack, linkActivityItem, listActivities } from "../domain/combat/activity-kind.mjs";

/** @type {Map<string, { changes: object, options: object, tokenUuid: string|null }>} */
const pendingMoves = new Map();

/** Always-on. Filter the browser console by `illusive-dnd-5e | oa`. */
export function oaLog(tag, data) {
  const prefix = `illusive-dnd-5e | oa | ${tag}`;
  if (data === undefined) console.info(prefix);
  else console.info(prefix, data);
}

function feetBetween(aFacts, bFacts, grid) {
  return spaceFeetBetween(aFacts, bFacts, {
    gridSize: grid.size || 100,
    gridDistance: grid.distance || 5,
    includeElevation: true
  });
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

/** dnd5e Activity#item is a getter. Assigning it throws and kills the prompt. */
function activityItem(activity) {
  try {
    return activity?.item ?? activity?.parent?.parent ?? null;
  } catch {
    return activity?.parent?.parent ?? null;
  }
}

function listMeleeAttackActivities(actor) {
  const out = [];
  let items = [];
  try {
    items = [...(actor?.items ?? [])];
  } catch (err) {
    oaLog("melee failed", { actor: actor?.name ?? null, message: err?.message ?? String(err) });
    return out;
  }
  for (const item of items) {
    try {
      const attacks = listActivities(item).filter((act) => act?.type === "attack" && isMeleeAttack(act, item));
      if (attacks.length) {
        for (const act of attacks) linkActivityItem(act, item);
        out.push(...attacks);
        continue;
      }
      if (!isMeleeAttack(null, item)) continue;
      out.push({
        id: `${item.id}-melee`,
        type: "attack",
        item,
        attack: { type: { value: "melee" } }
      });
    } catch (err) {
      oaLog("melee item failed", { item: item?.name ?? item?.id ?? null, message: err?.message ?? String(err) });
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
    oaLog("preview stop", { reason: "opportunity attacks disabled" });
    return { provoked: false, candidates: [], observers: [], token: null };
  }
  if (!globalThis.game?.combat?.started) {
    oaLog("preview stop", { reason: "not in combat" });
    return { provoked: false, candidates: [], observers: [], token: null };
  }
  if (changes?.x == null && changes?.y == null) {
    oaLog("preview stop", { reason: "update has no x/y", keys: Object.keys(changes ?? {}) });
    return { provoked: false, candidates: [], observers: [], token: null };
  }
  if (options.teleport || options.forced || options.isUndo || options.illusiveSkipOA || options.illusiveApplyPending) {
    oaLog("preview stop", {
      reason: "move flagged to skip",
      teleport: Boolean(options.teleport),
      forced: Boolean(options.forced),
      illusiveSkipOA: Boolean(options.illusiveSkipOA),
      illusiveApplyPending: Boolean(options.illusiveApplyPending),
      isUndo: Boolean(options.isUndo)
    });
    return { provoked: false, candidates: [], observers: [], token: null };
  }

  const token = tokenDoc?.object ?? canvas.tokens?.get(tokenDoc?.id);
  if (!token?.actor) {
    oaLog("preview stop", {
      reason: "mover token or actor missing",
      docId: tokenDoc?.id ?? null,
      hasObject: Boolean(tokenDoc?.object),
      canvasHit: Boolean(canvas.tokens?.get?.(tokenDoc?.id))
    });
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

  const scan = {
    moverUuid: token.document?.uuid,
    moverDisengaging,
    forcedMovement: Boolean(options.forced),
    teleport: Boolean(options.teleport),
    edition: resolveRulesContext(token.actor).edition,
    observers
  };
  const candidates = collectOpportunityCandidates(scan);
  oaLog("preview", {
    mover: token.name ?? token.actor?.name ?? token.id,
    from: { x: prior?.x, y: prior?.y },
    to: { x: nextFacts.x, y: nextFacts.y },
    disengaging: moverDisengaging,
    placeables: (canvas.tokens?.placeables ?? []).length,
    hostile: observers.length,
    provoked: candidates.length,
    watchers: observers.map((observer) => {
      const verdict = evaluateOpportunityAttack({
        edition: scan.edition ?? observer.edition,
        moverHostile: observer.moverHostile,
        observerCanSee: observer.canSee,
        observerHasReaction: observer.hasReaction,
        observerIncapacitated: observer.incapacitated,
        moverDisengaging,
        fromFeet: observer.fromFeet,
        toFeet: observer.toFeet,
        reachFeet: observer.reachFeet
      });
      return {
        name: observer.token?.name ?? observer.token?.actor?.name ?? observer.uuid,
        fromFeet: observer.fromFeet,
        toFeet: observer.toFeet,
        reachFeet: observer.reachFeet,
        hasReaction: observer.hasReaction,
        incapacitated: observer.incapacitated,
        canSee: observer.canSee,
        provokes: verdict.provokes,
        reason: verdict.reason
      };
    })
  });

  return {
    provoked: candidates.length > 0,
    candidates,
    observers,
    token
  };
}

function attackLabel(activity) {
  const itemName = activityItem(activity)?.name ?? null;
  const activityName = activity?.name ?? activity?.label ?? null;
  const generic = !activityName || /^(attack|use|action)$/i.test(String(activityName).trim());
  if (itemName && (generic || itemName === activityName)) return itemName;
  if (itemName && activityName) return `${itemName} — ${activityName}`;
  return activityName || itemName || "Attack";
}

function activityRefs(activities) {
  return activities.map((activity) => ({
    itemId: activityItem(activity)?.id ?? null,
    activityId: activity.id ?? activity._id ?? null,
    label: attackLabel(activity)
  }));
}

function batchGroups(entries) {
  return entries.map((entry) => ({
    actorId: entry.actorId ?? null,
    actorName: entry.actorName ?? "A creature",
    options: (entry.refs ?? []).map((ref) => ({
      id: ref.activityId,
      label: ref.label || "Attack"
    }))
  }));
}

async function opportunityDialog({ moverName = "a creature", groups = [] } = {}) {
  oaLog("dialog open", {
    moverName,
    actors: groups.map((group) => group.actorName),
    attacks: groups.map((group) => (group.options ?? []).map((option) => option.label))
  });
  const result = await reactionBatchDialog({
    title: illusiveDndLocalize("opportunity.title"),
    sentence: illusiveDndLocalize("opportunity.batch").replace("{mover}", moverName),
    groups
  });
  const picks = result?.picks ?? [];
  oaLog("dialog choice", { picks: picks.map((pick) => groups[pick.group]?.options?.[pick.option]?.label ?? pick.id) });
  return picks;
}

async function swingOpportunity({ actorUuid, tokenUuid = null, moverUuid, refs = [], parentLogId = null } = {}) {
  const actor = await globalThis.fromUuid?.(actorUuid);
  const token = tokenFromUuid(tokenUuid) ?? (actor ? tokenForActor(actor) : null);
  const ref = refs.find((entry) => entry?.itemId && entry?.activityId);
  const item = actor?.items?.get?.(ref?.itemId);
  const activity = item?.system?.activities?.get?.(ref?.activityId);
  if (!token || !item || !activity) return false;
  try {
    if (activity.item !== item) activity.item = item;
  } catch {
    /* Activity#item is a getter and already points at the weapon */
  }
  const { useActivityFromHud } = await import("./activity.mjs");
  return useActivityFromHud(token, item, activity, "reaction", {}, {
    triggerTokenUuid: moverUuid,
    options: { triggerTokenUuid: moverUuid, opportunityAttack: true, parentLogId }
  }, { validateTargets: false });
}

function queryGroups(data = {}) {
  if (data.groups?.length) return data.groups;
  return [{
    actorName: data.reactorName ?? "A creature",
    actorUuid: data.actorUuid ?? null,
    actorId: data.actorId ?? null,
    refs: data.refs ?? []
  }];
}

/** GM-side query: one window for every reactor, then make each checked attack. */
export async function adjudicateOpportunityQuery(data = {}) {
  const groups = queryGroups(data);
  const picks = await opportunityDialog({
    moverName: data.moverName ?? "a creature",
    groups: batchGroups(groups)
  });
  let used = false;
  for (const pick of picks) {
    const group = groups[pick.group];
    const ref = group?.refs?.[pick.option] ?? null;
    try {
      const swung = await swingOpportunity({
        actorUuid: group?.actorUuid ?? data.actorUuid ?? null,
        tokenUuid: group?.tokenUuid ?? null,
        moverUuid: data.moverUuid ?? null,
        refs: ref ? [ref] : [],
        parentLogId: data.parentLogId ?? null
      });
      if (swung) used = true;
    } catch {
      /* the move still releases */
    }
  }
  return { used };
}

/** Linked tokens share one actor. Unlinked copies share that actor id, so they key off the token. */
function reactorKey(token, actor) {
  const linked = token?.document?.actorLink !== false;
  if (!linked) return token?.document?.uuid ?? token?.uuid ?? token?.id ?? actor?.uuid ?? actor?.id ?? null;
  return actor?.uuid ?? actor?.id ?? token?.document?.uuid ?? token?.uuid ?? token?.id ?? null;
}

function wireGroup(group) {
  return {
    actorName: group.actorName,
    actorUuid: group.actorUuid ?? null,
    actorId: group.actorId ?? null,
    tokenUuid: group.tokenUuid ?? null,
    refs: group.refs ?? []
  };
}

/** The creature's owner decides, on their client, whoever dragged the token. */
async function askOwner(user, payload) {
  if (typeof user?.query !== "function") {
    oaLog("ask failed", { user: user?.id ?? null, reason: "owner has no query" });
    return { used: false };
  }
  try {
    const result = await user.query(
      queryName("opportunityAttack"),
      payload,
      { timeout: getReactionTimeoutMs() + 3000 }
    );
    oaLog("ask result", { user: user.id, used: Boolean(result?.used) });
    return result ?? { used: false };
  } catch (err) {
    oaLog("ask failed", { user: user.id, message: err?.message ?? String(err) });
    console.error("illusive-dnd-5e | oa | owner query failed", err);
    return { used: false };
  }
}

/** Facts the leave-reach window reads. The token has not moved yet. */
export function leaveReachContext(tokenDoc, changes = {}, options = {}) {
  const token = tokenDoc?.object ?? globalThis.canvas?.tokens?.get?.(tokenDoc?.id);
  const doc = token?.document ?? tokenDoc;
  if (!doc) return null;
  return {
    triggerTokenUuid: doc.uuid ?? null,
    destination: {
      x: changes?.x ?? doc.x,
      y: changes?.y ?? doc.y,
      elevation: changes?.elevation ?? doc.elevation ?? 0
    },
    teleport: Boolean(options.teleport),
    forced: Boolean(options.forced),
    moverDisengaging: hasDisengageEffect(token?.actor ?? doc.actor)
  };
}

/**
 * Hold is already stashed. One reaction window, then the move is released.
 */
export async function openLeaveReachWindow(tokenDoc, baseCtx = {}) {
  const token = tokenDoc?.object ?? globalThis.canvas?.tokens?.get?.(tokenDoc?.id);
  const parentLogId = getPendingMove(tokenDoc?.id)?.logId ?? null;
  const ctx = {
    ...baseCtx,
    parentId: parentLogId,
    triggerTokenUuid: baseCtx.triggerTokenUuid ?? token?.document?.uuid ?? tokenDoc?.uuid ?? null
  };
  try {
    const { openReactionWindow } = await import("./reactions/window.mjs");
    await openReactionWindow({
      windowId: "on-leave-reach",
      detached: true,
      parentId: parentLogId,
      baseCtx: ctx
    });
  } finally {
    await settleReactionPrompt({
      pendingMoveTokenId: tokenDoc?.id ?? null,
      moverUuid: ctx.triggerTokenUuid
    }, { used: false });
  }
}

/**
 * Prompt reactors for a leave-reach move (after the move was held).
 * Each owning player gets their creatures. The GM gets the rest. Then the move is released.
 */
export async function promptOpportunityReactions({ candidates, observers, token }) {
  if (!candidates?.length || !token) {
    oaLog("prompt stop", { reason: "nothing to ask", candidates: candidates?.length ?? 0, token: token?.id ?? null });
    return { prompted: false };
  }
  oaLog("prompt start", {
    mover: token.name ?? token.id,
    candidates: candidates.map((candidate) => candidate.observerUuid)
  });

  const groups = [];
  const seen = new Set();
  for (const candidate of candidates) {
    try {
      const observer = observers.find((o) => o.uuid === candidate.observerUuid);
      const actorName = observer?.token?.name ?? observer?.token?.actor?.name ?? candidate.observerUuid;
      if (!observer?.token?.actor) {
        oaLog("skip", { name: actorName, reason: "observer has no actor" });
        continue;
      }
      if (!isEconomyAvailable(observer.token.actor, "reaction", observer.token)) {
        oaLog("skip", { name: actorName, reason: "reaction already spent" });
        continue;
      }
      const melee = listMeleeAttackActivities(observer.token.actor);
      if (!melee.length) {
        oaLog("skip", {
          name: actorName,
          reason: "no melee weapon",
          items: [...(observer.token.actor.items ?? [])].map((item) => ({
            name: item?.name,
            type: item?.type,
            actionType: item?.system?.actionType ?? null,
            weaponType: item?.system?.type?.value ?? null
          }))
        });
        continue;
      }
      const actor = observer.token.actor;
      const key = reactorKey(observer.token, actor);
      if (key && seen.has(key)) {
        oaLog("skip", { name: actorName, reason: "same creature", key });
        continue;
      }
      if (key) seen.add(key);
      const owner = remoteOwnerFor(actor);
      oaLog("reactor", {
        name: actor.name,
        key,
        owner: owner?.id ?? null,
        isGM: Boolean(globalThis.game?.user?.isGM),
        melee: melee.map((activity) => activityItem(activity)?.name ?? activity.id)
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
      groups.push({
        actor,
        actorName: observer.token?.name ?? actor.name ?? actorName,
        actorUuid: actor.uuid ?? null,
        actorId: key,
        tokenUuid: observer.uuid ?? observer.token?.document?.uuid ?? null,
        owner,
        refs: activityRefs(melee)
      });
    } catch (err) {
      oaLog("reactor failed", {
        uuid: candidate?.observerUuid ?? null,
        message: err?.message ?? String(err)
      });
      console.error("illusive-dnd-5e | oa | reactor failed", err);
    }
  }

  const moverName = token.name ?? token.actor?.name ?? "a creature";
  const moverUuid = token.document?.uuid ?? null;
  const parentLogId = getPendingMove(token.id)?.logId ?? null;
  let used = false;
  if (groups.length) {
    const buckets = new Map();
    for (const group of groups) {
      const ownerId = group.owner?.id ?? "local";
      if (!buckets.has(ownerId)) buckets.set(ownerId, { owner: group.owner ?? null, groups: [] });
      buckets.get(ownerId).groups.push(group);
    }
    oaLog("ask", {
      isGM: Boolean(globalThis.game?.user?.isGM),
      canAskGm: canAskGm(),
      owners: [...buckets.entries()].map(([id, bucket]) => ({
        id,
        actors: bucket.groups.map((group) => group.actorName)
      }))
    });
    const results = await Promise.all([...buckets.values()].map((bucket) => {
      const payload = {
        moverName,
        moverUuid,
        parentLogId,
        groups: bucket.groups.map(wireGroup)
      };
      if (!bucket.owner) return adjudicateOpportunityQuery(payload);
      return askOwner(bucket.owner, payload);
    }));
    used = results.some((result) => result?.used);
  }

  oaLog("prompt end", { used, actors: groups.map((group) => group.actorName) });
  await settleReactionPrompt({
    pendingMoveTokenId: token.id,
    moverUuid,
    actorUuid: groups[0]?.actorUuid ?? null
  }, { used });

  return { prompted: true };
}

export function stashPendingMove(tokenDoc, changes, options = {}) {
  if (!tokenDoc?.id) return;
  pendingMoves.set(tokenDoc.id, {
    changes: {
      ...(changes.x != null ? { x: changes.x } : {}),
      ...(changes.y != null ? { y: changes.y } : {})
    },
    options: { ...options },
    tokenUuid: tokenDoc.uuid ?? null,
    logId: null
  });
}

export function getPendingMove(tokenId) {
  return pendingMoves.get(tokenId) ?? null;
}

export async function applyPendingMove(tokenId) {
  const pending = pendingMoves.get(tokenId);
  if (!pending?.changes) return false;
  const token = canvas.tokens?.get(tokenId);
  const doc = token?.document;
  if (!doc?.update) {
    pendingMoves.delete(tokenId);
    return false;
  }
  // The held update's options still carry Foundry's movement id. Sending them
  // again makes #preUpdateMovement redefine that property and the move never lands.
  try {
    await doc.update(pending.changes, {
      illusiveSkipOA: true,
      illusiveApplyPending: true,
      ...(pending.logId ? { illusiveMovementLogId: pending.logId } : {})
    });
  } catch (err) {
    oaLog("release failed", { token: token?.name ?? tokenId, message: err?.message ?? String(err) });
    throw err;
  }
  pendingMoves.delete(tokenId);
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
