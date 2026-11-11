/**
 * Facts a declaration condition can read, for one listening creature at one moment.
 *
 *   self.* / trigger.*   isTrigger isTarget isDamaged hp.value hp.max hp.temp hp.pct
 *                        creatureType effects statuses armor.heavy armor.type
 *                        wieldsFinesse wieldsShield senses.<sense> prof level
 *                        isOwnTurn usesLeft.<item name pattern> system.<path> flags.<path>
 *   relation.*           hostile ally targetAlly distance sees nearTarget (attacked creature within 5 ft)
 *   activity.*           isAttack isMelee isRanged isWeapon isSpell spellLevel elemental charmOrFear magical
 *                        (isAttack / isWeapon are undefined when the moment doesn't say)
 *   damage.*             types typeCount total
 *   damaged.*            self dropped droppedHostile droppedAlly droppedFeet
 *   condition.*          name
 *   combat.*             round turn
 *   edition              "2014" | "2024"
 *
 * Every fact is computed on first read and cached; unknown paths are undefined
 * (conditions then fail closed).
 */

import { isFriendly, isHostile } from "../../domain/combat/disposition.mjs";
import { actorFromUuid, tokenUuidOf } from "../../foundry/token-lookup.mjs";
import { resolveRulesContext } from "../../foundry/dnd5e-adapter.mjs";
import { feetBetween } from "../reactions/candidates.mjs";
import { usesLeft } from "./derived.mjs";

function dig(obj, path) {
  let cur = obj;
  for (const part of path) {
    if (cur == null) return undefined;
    cur = cur instanceof Map ? cur.get(part) : cur[part];
  }
  return cur;
}

function creatureType(actor) {
  const details = actor?.system?.details ?? {};
  const raw = details.type?.value ?? details.race?.system?.type?.value
    ?? (actor?.type === "character" ? "humanoid" : undefined);
  return raw ? String(raw).toLowerCase() : undefined;
}

function effectNames(actor) {
  const out = new Set();
  for (const e of actor?.appliedEffects ?? actor?.effects ?? []) {
    if (!e || e.disabled) continue;
    if (e.name) out.add(String(e.name).toLowerCase());
    for (const s of e.statuses ?? []) out.add(String(s).toLowerCase());
  }
  return out;
}

function statuses(actor) {
  return new Set([...(actor?.statuses ?? [])].map((s) => String(s).toLowerCase()));
}

function equipped(actor, test) {
  return [...(actor?.items ?? [])].find((i) => i?.system?.equipped !== false && test(i)) ?? null;
}

function armorType(actor) {
  const worn = actor?.system?.attributes?.ac?.equippedArmor
    ?? equipped(actor, (i) => i.type === "equipment"
      && ["light", "medium", "heavy"].includes(i.system?.type?.value) && i.system?.equipped);
  return worn?.system?.type?.value ?? null;
}

function hasProperty(item, prop) {
  const props = item?.system?.properties;
  if (props instanceof Set) return props.has(prop);
  if (Array.isArray(props)) return props.includes(prop);
  return Boolean(props?.[prop]);
}

function sense(actor, key) {
  const senses = actor?.system?.attributes?.senses ?? {};
  const value = senses.ranges?.[key] ?? senses[key];
  return Number(value) || 0;
}

function hp(actor) {
  return actor?.system?.attributes?.hp ?? {};
}

function creatureFact(actor, rest, { isTrigger, isTarget, isDamaged, tokenId }) {
  const [head, ...tail] = rest;
  const h = hp(actor);
  switch (head) {
    case "isTrigger": return isTrigger;
    case "isTarget": return isTarget;
    case "isDamaged": return isDamaged;
    case "uuid": return actor?.uuid;
    case "hp": {
      const key = tail[0];
      if (key === "pct") return Number(h.max) > 0 ? (Number(h.value) || 0) / Number(h.max) : undefined;
      const v = Number(h[key]);
      return Number.isFinite(v) ? v : (key === "temp" ? 0 : undefined);
    }
    case "creatureType": return creatureType(actor);
    case "effects": return effectNames(actor);
    case "statuses": return statuses(actor);
    case "armor": {
      const type = armorType(actor);
      if (tail[0] === "type") return type ?? "none";
      if (["light", "medium", "heavy"].includes(tail[0])) return type === tail[0];
      return undefined;
    }
    case "wieldsFinesse":
      return Boolean(equipped(actor, (i) => i.type === "weapon" && i.system?.equipped && hasProperty(i, "fin")));
    case "wieldsShield":
      return Boolean(equipped(actor, (i) => i.type === "equipment"
        && i.system?.type?.value === "shield" && i.system?.equipped));
    case "senses": return sense(actor, tail[0]);
    case "prof": return Number(actor?.system?.attributes?.prof) || 0;
    case "level": return Number(actor?.system?.details?.level ?? actor?.system?.details?.cr) || 0;
    case "isOwnTurn": {
      const combat = globalThis.game?.combat;
      return Boolean(tokenId && combat?.combatant?.tokenId === tokenId);
    }
    case "usesLeft": return tail[0] ? usesLeft(actor, tail[0]) : undefined;
    case "system": return dig(actor?.system, tail);
    case "flags": return dig(actor?.flags, tail);
    default: return undefined;
  }
}

function tokenForActorUuid(uuid) {
  for (const t of globalThis.canvas?.tokens?.placeables ?? []) {
    if (t?.actor?.uuid === uuid || tokenUuidOf(t) === uuid) return t;
  }
  return null;
}

/**
 * @param {object} ctx    candidate context (reactions/candidates.mjs)
 * @param {object} scope  moment scope (reactions/candidates.mjs)
 * @param {object} [entry] index entry (for the source item's edition)
 * @returns {(path: string) => unknown}
 */
export function createFactReader(ctx, scope, entry = null) {
  const memo = new Map();
  const self = ctx.actor;
  const trigger = scope.trigger?.actor ?? null;
  const triggerToken = scope.trigger ?? null;

  const dropped = () => {
    if (!memo.has("_dropped")) {
      const list = (ctx.droppedUuids ?? []).map((uuid) => {
        const token = tokenForActorUuid(uuid);
        const hostile = token && ctx.token ? isHostile(ctx.token, token) : false;
        return { uuid, hostile };
      });
      memo.set("_dropped", list);
    }
    return memo.get("_dropped");
  };

  const compute = (path) => {
    const [root, ...rest] = path.split(".");
    switch (root) {
      case "self":
        return creatureFact(self, rest, {
          isTrigger: ctx.isTrigger,
          isTarget: ctx.isTarget,
          isDamaged: ctx.isDamaged,
          tokenId: ctx.token?.id ?? null
        });
      case "trigger":
        if (!trigger) return undefined;
        return creatureFact(trigger, rest, {
          isTrigger: true,
          isTarget: scope.targets.has(scope.triggerUuid),
          isDamaged: scope.damaged.has(trigger.uuid),
          tokenId: triggerToken?.id ?? null
        });
      case "relation":
        switch (rest[0]) {
          case "hostile": return ctx.hostile;
          case "ally": return ctx.isTrigger ? true : (ctx.hostile == null ? undefined : !ctx.hostile);
          case "targetAlly": {
            const uuid = scope.targetList[0];
            if (!uuid || !ctx.token) return undefined;
            if (tokenUuidOf(ctx.token) === uuid) return false;
            const target = tokenForActorUuid(uuid);
            return target ? isFriendly(ctx.token, target) : undefined;
          }
          case "distance": return ctx.distanceToTrigger ?? undefined;
          case "sees": return ctx.canSeeTrigger;
          case "nearTarget": return ctx.nearTargetUuid ?? null;
          default: return undefined;
        }
      case "activity":
        switch (rest[0]) {
          case "isAttack": return ctx.attackRoll == null ? undefined : Boolean(ctx.attackRoll);
          case "isMelee": return Boolean(ctx.melee);
          case "isRanged": return Boolean(ctx.ranged);
          case "isWeapon": return ctx.weaponAttack == null ? undefined : Boolean(ctx.weaponAttack);
          case "isSpell": return Boolean(ctx.isSpell ?? (ctx.spellLevel != null));
          case "spellLevel": return ctx.spellLevel ?? undefined;
          case "elemental": return Boolean(ctx.elemental);
          case "charmOrFear": return Boolean(ctx.charmOrFear);
          case "magical": return ctx.magical === true;
          case "isSource": return Boolean(entry?.item?.id && ctx.itemId && ctx.itemId === entry.item.id);
          case "activation": return ctx.activation ?? undefined;
          default: return undefined;
        }
      case "damage":
        switch (rest[0]) {
          case "types": return new Set((ctx.damageTypes ?? []).map((t) => String(t).toLowerCase()));
          case "typeCount": return new Set(ctx.damageTypes ?? []).size;
          case "total": return ctx.damageTotal ?? undefined;
          default: return undefined;
        }
      case "damaged":
        switch (rest[0]) {
          case "self": return ctx.isDamaged;
          case "dropped": return dropped().length;
          case "droppedHostile": return dropped().filter((d) => d.hostile).length;
          case "droppedAlly": return dropped().filter((d) => !d.hostile).length;
          case "droppedFeet": {
            let best = null;
            for (const entry of dropped()) {
              if (!entry.hostile || !ctx.token) continue;
              const token = tokenForActorUuid(entry.uuid);
              const feet = token ? feetBetween(ctx.token, token) : null;
              if (feet == null) continue;
              if (best == null || feet < best) best = feet;
            }
            return best ?? undefined;
          }
          default: return undefined;
        }
      case "combat":
        if (rest[0] === "round") return globalThis.game?.combat?.round ?? undefined;
        if (rest[0] === "turn") return globalThis.game?.combat?.turn ?? undefined;
        return undefined;
      case "condition":
        if (rest[0] === "name") return ctx.status ? String(ctx.status).toLowerCase() : undefined;
        return undefined;
      case "edition":
        if (ctx.rulesContext?.edition) return ctx.rulesContext.edition;
        try {
          return resolveRulesContext(self, entry?.item ?? null).edition;
        } catch {
          return "2024";
        }
      default:
        return undefined;
    }
  };

  return (path) => {
    if (!memo.has(path)) memo.set(path, compute(String(path)));
    return memo.get(path);
  };
}

/** Token uuids within `feet` of the listener (default 60), capped at `limit` (default 5). */
export function nearbyTokenUuids(ctx, step = {}) {
  const feet = Number(step?.feet) > 0 ? Number(step.feet) : 60;
  const limit = Number(step?.limit) > 0 ? Number(step.limit) : 5;
  const self = ctx?.token ?? null;
  const out = [];
  for (const token of globalThis.canvas?.tokens?.placeables ?? []) {
    const uuid = token?.document?.uuid;
    if (!uuid) continue;
    if (self) {
      const dist = feetBetween(self, token);
      if (dist == null || dist > feet) continue;
    }
    out.push(uuid);
    if (out.length >= limit) break;
  }
  return out;
}

/** Actors for a selector (domain/triggers/steps.mjs SELECTORS). */
export function selectActors(selector, ctx, scope, step = null) {
  switch (selector) {
    case "trigger": return scope.trigger?.actor ? [scope.trigger.actor] : [];
    case "ally": {
      const ally = ctx.allyUuid ? actorFromUuid(ctx.allyUuid) : null;
      return ally ? [ally] : (ctx.actor ? [ctx.actor] : []);
    }
    case "nearTarget": {
      const near = ctx.nearTargetUuid ? actorFromUuid(ctx.nearTargetUuid) : null;
      return near ? [near] : [];
    }
    case "target": {
      const first = scope.targetList[0];
      const actor = first ? actorFromUuid(first) : null;
      return actor ? [actor] : [];
    }
    case "targets": return scope.targetList.map((u) => actorFromUuid(u)).filter(Boolean);
    case "damaged": return [...scope.damaged].map((u) => actorFromUuid(u)).filter(Boolean);
    case "nearby": return nearbyTokenUuids(ctx, step).map((uuid) => actorFromUuid(uuid)).filter(Boolean);
    case "self":
    default:
      return ctx.actor ? [ctx.actor] : [];
  }
}
