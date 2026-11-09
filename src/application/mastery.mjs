/**
 * Apply weapon mastery effects after hit/miss adjudication.
 */

import { planMastery, weaponAbilityKey } from "../domain/combat/mastery.mjs";
import { emitCombatFx } from "./combat-fx.mjs";
import { combatantForActor, readBudget, writeBudget } from "./economy.mjs";
import { MODULE_ID } from "../constants.mjs";
import { tokenFromUuid } from "../foundry/token-lookup.mjs";
import { flatDamageRoll } from "./damage-apply.mjs";
import { primaryDamageType } from "../domain/combat/activity-kind.mjs";
import { createEmbedded, updateDoc, setDocFlag, unsetDocFlag, toggleActorStatus } from "../foundry/write-gateway.mjs";

async function applyRoundEffect(actor, name, statuses = [], changes = []) {
  if (!actor?.createEmbeddedDocuments) return null;
  const combat = game.combat;
  const made = await createEmbedded(actor, "ActiveEffect", [{
    name,
    img: "icons/svg/aura.svg",
    statuses,
    changes,
    duration: combat?.started
      ? { rounds: 1, startRound: combat.round, startTurn: combat.turn }
      : { turns: 1 }
  }]);
  return made;
}

function pushOffset(attacker, target, feet = 10) {
  const grid = canvas?.grid;
  const size = Number(grid?.size) || 100;
  const distance = Number(grid?.distance) || 5;
  const pixels = (feet / distance) * size;
  const ax = attacker.center?.x ?? attacker.x;
  const ay = attacker.center?.y ?? attacker.y;
  const tx = target.center?.x ?? target.x;
  const ty = target.center?.y ?? target.y;
  const dx = tx - ax;
  const dy = ty - ay;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: (target.document?.x ?? target.x) + (dx / len) * pixels,
    y: (target.document?.y ?? target.y) + (dy / len) * pixels
  };
}

/**
 * @returns {Promise<object[]>} applied effect summaries
 */
export async function applyWeaponMastery({
  mastery,
  hit,
  fumble = false,
  actor,
  token,
  item,
  activity,
  targetUuids = [],
  resolutionId = null,
  attackTotal = null
} = {}) {
  const plan = planMastery({ mastery, hit, fumble });
  if (!plan) return [];

  const applied = [];
  const primaryUuid = targetUuids[0] ?? null;
  const target = tokenFromUuid(primaryUuid);
  const origin = {
    itemUuid: item?.uuid ?? null,
    activityId: activity?.id ?? activity?._id ?? null
  };

  emitCombatFx({
    kind: "mastery",
    subtype: plan.key,
    resolutionId,
    actorUuid: actor?.uuid ?? null,
    tokenUuid: token?.document?.uuid ?? token?.uuid ?? null,
    targetUuids,
    outcome: { hit, plan, attackTotal },
    origin
  });

  try {
    if (plan.effect === "abilityModDamage" && target?.actor) {
      const key = weaponAbilityKey(item, actor);
      const mod = Number(actor?.system?.abilities?.[key]?.mod) || 0;
      const value = Math.max(0, mod);
      if (value > 0 && primaryUuid) {
        // Caller applies via the shared damage step (undo trail + concentration).
        applied.push({
          mastery: plan.key,
          type: "damage",
          value,
          targetUuid: primaryUuid,
          attackHit: false,
          rolls: [flatDamageRoll(value, primaryDamageType(item), `${plan.key} ${value}`)]
        });
      }
    }

    if (plan.effect === "push10" && target?.document && token) {
      const size = target.actor?.system?.traits?.size ?? "med";
      if (!["tiny", "sm", "med", "large"].includes(String(size)) && size !== "lg") {
        // Allow Large and smaller; dnd5e uses med/lg/sm/tiny
      }
      const largeOrSmaller = !["huge", "grg"].includes(String(size));
      if (largeOrSmaller) {
        const next = pushOffset(token, target, 10);
        const moved = await updateDoc(target.document, next, { illusiveSkipOA: true, illusiveDndForced: true });
        applied.push({ mastery: plan.key, type: "push", targetUuid: primaryUuid, ...next, undo: moved.undo ?? [] });
      }
    }

    if (plan.effect === "disadvantageNextAttack" && target?.actor) {
      const flagged = await setDocFlag(target.actor, MODULE_ID, "sapDisadvantage", true);
      applied.push({ mastery: plan.key, type: "flag", targetUuid: primaryUuid, undo: flagged.undo ?? [] });
    }

    if (plan.effect === "reduceSpeed10" && target?.actor) {
      const slowed = await applyRoundEffect(target.actor, "Slow (Mastery)", [], [{
        key: "system.attributes.movement.speeds.walk",
        type: "add",
        value: "-10"
      }]);
      applied.push({ mastery: plan.key, type: "speed", targetUuid: primaryUuid, undo: slowed?.undo ?? [] });
    }

    if (plan.effect === "advantageNextAttackVsTarget" && actor && primaryUuid) {
      const vexed = await setDocFlag(actor, MODULE_ID, "vexTargetUuid", primaryUuid);
      applied.push({ mastery: plan.key, type: "flag", targetUuid: primaryUuid, undo: vexed.undo ?? [] });
    }

    if (plan.effect === "conSaveOrProne" && target?.actor) {
      const abl = weaponAbilityKey(item, actor);
      const mod = Number(actor?.system?.abilities?.[abl]?.mod) || 0;
      const prof = Number(actor?.system?.attributes?.prof) || 0;
      const dc = 8 + prof + mod;
      let total = null;
      try {
        if (typeof target.actor.rollSavingThrow === "function") {
          const rolls = await target.actor.rollSavingThrow(
            { ability: "con", target: dc },
            { configure: false }
          );
          total = Number((Array.isArray(rolls) ? rolls[0] : rolls)?.total);
        }
      } catch {
        /* ignore */
      }
      if (Number.isFinite(total) && total < dc) {
        const prone = await toggleActorStatus(target.actor, "prone", { active: true });
        applied.push({ mastery: plan.key, type: "prone", targetUuid: primaryUuid, dc, total, undo: prone.undo ?? [] });
      } else {
        applied.push({ mastery: plan.key, type: "save", targetUuid: primaryUuid, dc, total, success: true });
      }
    }

    if (plan.effect === "lightAttackAsAttackAction" && actor) {
      const combatant = combatantForActor(actor);
      if (combatant) {
        const budget = readBudget(combatant);
        await writeBudget(combatant, { ...budget, nickAvailable: true });
      }
      applied.push({ mastery: plan.key, type: "nick" });
    }

    if (plan.effect === "extraAdjacentAttack" && token && target && activity) {
      const candidates = (canvas.tokens?.placeables ?? []).filter((other) => {
        if (!other?.actor || other.id === target.id || other.id === token.id) return false;
        const dx = Math.abs((other.center?.x ?? other.x) - (target.center?.x ?? target.x));
        const dy = Math.abs((other.center?.y ?? other.y) - (target.center?.y ?? target.y));
        const size = Number(canvas.grid?.size) || 100;
        return Math.max(dx, dy) <= size + 1;
      });
      const cleaveTarget = candidates[0] ?? null;
      const cleaveResult = { mastery: plan.key, type: "cleave", candidates: candidates.map((c) => c.document?.uuid).filter(Boolean) };
      if (cleaveTarget && typeof activity.rollAttack === "function") {
        try {
          const rolls = (await activity.rollAttack({})) ?? [];
          const roll = Array.isArray(rolls) ? rolls[0] : rolls;
          const total = Number(roll?.total);
          const ac = Number(cleaveTarget.actor?.system?.attributes?.ac?.value) || 10;
          const hit = Number.isFinite(total) && total >= ac;
          cleaveResult.attackTotal = total;
          cleaveResult.targetUuid = cleaveTarget.document?.uuid;
          cleaveResult.hit = hit;
          if (hit && typeof activity.rollDamage === "function") {
            const dmg = (await activity.rollDamage({}, { configure: false })) ?? [];
            const dmgRolls = Array.isArray(dmg) ? dmg : [];
            if (dmgRolls.length) {
              // Caller applies through the on-damage-known window + undo trail.
              cleaveResult.rolls = dmgRolls;
              cleaveResult.attackHit = true;
              cleaveResult.damage = dmgRolls.map((r) => r?.total);
            }
          }
        } catch (err) {
          console.warn("illusive-dnd-5e | cleave swing failed", err);
        }
      }
      applied.push(cleaveResult);
      emitCombatFx({
        kind: "mastery",
        subtype: "cleave",
        resolutionId,
        actorUuid: actor?.uuid ?? null,
        tokenUuid: token?.document?.uuid ?? null,
        targetUuids: cleaveResult.targetUuid ? [cleaveResult.targetUuid] : [],
        outcome: cleaveResult,
        origin
      });
    }
  } catch (err) {
    console.warn("illusive-dnd-5e | mastery apply failed", plan.key, err);
  }

  return applied;
}

/** Consume Vex advantage flag when attacking that target. */
export function consumeVexAdvantage(actor, targetUuid) {
  try {
    const flagged = actor?.getFlag?.(MODULE_ID, "vexTargetUuid");
    if (flagged && flagged === targetUuid) {
      void unsetDocFlag(actor, MODULE_ID, "vexTargetUuid");
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function consumeSapDisadvantage(actor) {
  try {
    if (actor?.getFlag?.(MODULE_ID, "sapDisadvantage")) {
      void unsetDocFlag(actor, MODULE_ID, "sapDisadvantage");
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
