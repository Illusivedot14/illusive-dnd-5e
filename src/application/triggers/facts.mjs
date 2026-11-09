/**
 * Facts a declaration condition can read, for one listening creature at one moment.
 *
 *   self.* / trigger.*   isTrigger isTarget isDamaged hp.value hp.max hp.temp hp.pct
 *                        creatureType effects statuses armor.heavy armor.type
 *                        wieldsFinesse wieldsShield senses.<sense> prof level
 *                        isOwnTurn system.<path> flags.<path>
 *   relation.*           hostile ally distance sees
 *   activity.*           isAttack isMelee isRanged isWeapon isSpell spellLevel elemental
 *   damage.*             types total
 *   damaged.*            self dropped droppedHostile droppedAlly
 *   combat.*             round turn
 *   edition              "2014" | "2024"
 *
 * Every fact is computed on first read and cached; unknown paths are undefined
 * (conditions then fail closed).
 */

import { isHostile } from "../../domain/combat/disposition.mjs";
import { actorFromUuid, tokenUuidOf } from "../../foundry/token-lookup.mjs";
import { resolveRulesContext } from "../../foundry/dnd5e-adapter.mjs";

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
          case "distance": return ctx.distanceToTrigger ?? undefined;
          case "sees": return ctx.canSeeTrigger;
          default: return undefined;
        }
      case "activity":
        switch (rest[0]) {
          case "isAttack": return Boolean(ctx.attackRoll);
          case "isMelee": return Boolean(ctx.melee);
          case "isRanged": return Boolean(ctx.ranged);
          case "isWeapon": return Boolean(ctx.weaponAttack);
          case "isSpell": return Boolean(ctx.isSpell ?? (ctx.spellLevel != null));
          case "spellLevel": return ctx.spellLevel ?? undefined;
          case "elemental": return Boolean(ctx.elemental);
          default: return undefined;
        }
      case "damage":
        switch (rest[0]) {
          case "types": return new Set((ctx.damageTypes ?? []).map((t) => String(t).toLowerCase()));
          case "total": return ctx.damageTotal ?? undefined;
          default: return undefined;
        }
      case "damaged":
        switch (rest[0]) {
          case "self": return ctx.isDamaged;
          case "dropped": return dropped().length;
          case "droppedHostile": return dropped().filter((d) => d.hostile).length;
          case "droppedAlly": return dropped().filter((d) => !d.hostile).length;
          default: return undefined;
        }
      case "combat":
        if (rest[0] === "round") return globalThis.game?.combat?.round ?? undefined;
        if (rest[0] === "turn") return globalThis.game?.combat?.turn ?? undefined;
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

/** Actor for a selector ("self", "trigger", "target", "targets", "damaged"). */
export function selectActors(selector, ctx, scope) {
  switch (selector) {
    case "trigger": return scope.trigger?.actor ? [scope.trigger.actor] : [];
    case "target": {
      const first = scope.targetList[0];
      const actor = first ? actorFromUuid(first) : null;
      return actor ? [actor] : [];
    }
    case "targets": return scope.targetList.map((u) => actorFromUuid(u)).filter(Boolean);
    case "damaged": return [...scope.damaged].map((u) => actorFromUuid(u)).filter(Boolean);
    case "self":
    default:
      return ctx.actor ? [ctx.actor] : [];
  }
}
