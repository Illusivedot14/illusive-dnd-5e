/**
 * Sync mechanical auras (Aura of Protection, etc.) onto tokens in range.
 */

import { spaceFeetBetween } from "../domain/spatial/geometry.mjs";
import {
  findAuraFeatures,
  isIncapacitated,
  resolveAuraFeet,
  auraSaveBonus,
  SAVE_BONUS_KEY,
  readDeclaredAura,
  declaredAuraReaches,
  resolveSourceFormula
} from "../domain/combat/aura-effects.mjs";
import { isFriendly } from "../domain/combat/disposition.mjs";
import { getGridFacts, getTokenFacts } from "../foundry/scene-adapter.mjs";
import { emitCombatFx } from "./combat-fx.mjs";
import { MODULE_ID } from "../constants.mjs";
import { createEmbedded, updateDoc, deleteDocs } from "../foundry/write-gateway.mjs";

const dispositionsFriendly = (a, b) => isFriendly(a, b, { unknown: true });

function feetBetween(a, b) {
  const grid = getGridFacts();
  return spaceFeetBetween(getTokenFacts(a), getTokenFacts(b), {
    gridSize: grid.size || 100,
    gridDistance: grid.distance || 5,
    includeElevation: true
  });
}

function findAuraEffect(targetActor, sourceUuid, auraId) {
  return [...(targetActor.effects ?? [])].find(
    (e) => e.flags?.[MODULE_ID]?.kind === "aura-buff"
      && e.flags?.[MODULE_ID]?.auraId === auraId
      && e.flags?.[MODULE_ID]?.sourceUuid === sourceUuid
  ) ?? null;
}

async function ensureSaveBonusEffect(targetActor, {
  sourceUuid,
  auraId,
  name,
  bonus
}) {
  const existing = findAuraEffect(targetActor, sourceUuid, auraId);
  const changes = [{ key: SAVE_BONUS_KEY, type: "add", value: String(bonus) }];
  if (existing) {
    const current = existing.system?.changes?.[0] ?? existing.changes?.[0];
    if (current?.key === SAVE_BONUS_KEY && Number(current?.value) === bonus) return existing;
    await updateDoc(existing, { changes });
    return existing;
  }

  const { docs: [created] = [] } = await createEmbedded(targetActor, "ActiveEffect", [{
    name,
    img: "icons/magic/holy/barrier-shield-winged-blue.webp",
    transfer: false,
    disabled: false,
    changes,
    flags: {
      [MODULE_ID]: { auraId, sourceUuid, kind: "aura-buff" }
    }
  }]);
  return created;
}

async function ensureDamagingAuraEffect(targetActor, {
  sourceUuid,
  auraId,
  name,
  damaging,
  saveDc
}) {
  const existing = findAuraEffect(targetActor, sourceUuid, `${auraId}-dmg`);
  const overTime = {
    turn: damaging.turn || "start",
    damageFormula: damaging.formula,
    damageType: damaging.type,
    saveAbility: damaging.saveAbility,
    saveDc,
    onSave: damaging.onSave || "half",
    label: name
  };
  if (existing) {
    await updateDoc(existing, {
      flags: {
        [MODULE_ID]: {
          auraId: `${auraId}-dmg`,
          sourceUuid,
          kind: "aura-buff",
          overTime
        }
      }
    });
    return existing;
  }
  const { docs: [created] = [] } = await createEmbedded(targetActor, "ActiveEffect", [{
    name,
    img: "icons/magic/light/explosion-star-glow-blue.webp",
    transfer: false,
    disabled: false,
    changes: [],
    flags: {
      [MODULE_ID]: {
        auraId: `${auraId}-dmg`,
        sourceUuid,
        kind: "aura-buff",
        overTime
      }
    }
  }]);
  return created;
}

async function ensureImmunityEffect(targetActor, {
  sourceUuid,
  auraId,
  name,
  immunities
}) {
  const existing = findAuraEffect(targetActor, sourceUuid, `${auraId}-imm`);
  if (existing) return existing;
  const changes = immunities.map((status) => ({
    key: "system.traits.ci.value",
    type: "add",
    value: status
  }));
  const { docs: [created] = [] } = await createEmbedded(targetActor, "ActiveEffect", [{
    name,
    img: "icons/magic/holy/prayer-hands-glowing-yellow.webp",
    transfer: false,
    statuses: [],
    changes,
    flags: {
      [MODULE_ID]: { auraId: `${auraId}-imm`, sourceUuid, kind: "aura-buff", immunities }
    }
  }]);
  return created;
}

function activeDeclaredAuras(actor) {
  const effects = typeof actor?.allApplicableEffects === "function"
    ? [...actor.allApplicableEffects()]
    : [...(actor?.effects ?? [])];
  const out = [];
  for (const effect of effects) {
    if (effect.disabled || effect.isSuppressed) continue;
    if (effect.flags?.[MODULE_ID]?.kind === "aura-buff") continue;
    const aura = readDeclaredAura(effect, MODULE_ID);
    if (aura) out.push({ effect, aura });
  }
  return out;
}

async function ensureDeclaredAuraEffect(targetActor, { sourceUuid, auraId, name, img, changes, statuses, overTime }) {
  const signature = JSON.stringify({ changes, statuses, overTime });
  const flags = {
    [MODULE_ID]: { auraId, sourceUuid, kind: "aura-buff", auraSignature: signature, overTime: overTime ?? null }
  };
  const existing = findAuraEffect(targetActor, sourceUuid, auraId);
  if (existing) {
    if (existing.flags?.[MODULE_ID]?.auraSignature === signature) return existing;
    await updateDoc(existing, { changes, statuses, flags });
    return existing;
  }
  const { docs: [created] = [] } = await createEmbedded(targetActor, "ActiveEffect", [{
    name,
    img: img || "icons/magic/light/explosion-star-glow-blue.webp",
    transfer: false,
    disabled: false,
    changes,
    statuses,
    flags
  }]);
  return created;
}

/**
 * Copy one declared aura onto every token it reaches.
 * @returns {Promise<number>} effects ensured
 */
async function spreadDeclaredAura(sourceToken, tokens, { effect, aura }, validByActor) {
  if (aura.combatOnly && !game.combat?.started) return 0;
  if (aura.disableOnHidden && sourceToken.document?.hidden) return 0;
  const source = sourceToken.actor;
  const rollData = source.getRollData?.() ?? {};
  const feet = Number(resolveSourceFormula(aura.radius, rollData));
  if (!Number.isFinite(feet) || feet <= 0) return 0;

  const auraId = `declared-${effect.id}`;
  const changes = aura.changes.map(({ _id, ...change }) => ({
    ...change,
    value: resolveSourceFormula(change.value, rollData)
  }));
  const overTime = aura.overTime
    ? Object.fromEntries(Object.entries(aura.overTime).map(([k, v]) => [k, resolveSourceFormula(v, rollData)]))
    : null;

  let ensured = 0;
  for (const other of tokens) {
    if (!other.actor) continue;
    const isSelf = other.id === sourceToken.id;
    const friendly = isSelf || dispositionsFriendly(sourceToken, other);
    if (!declaredAuraReaches(aura, { isSelf, friendly })) continue;
    if (!isSelf && !(feetBetween(sourceToken, other) <= feet + 1e-6)) continue;
    if (!validByActor.has(other.actor.uuid)) validByActor.set(other.actor.uuid, new Set());
    validByActor.get(other.actor.uuid).add(`${source.uuid}:${auraId}`);
    await ensureDeclaredAuraEffect(other.actor, {
      sourceUuid: source.uuid,
      auraId,
      name: `${effect.name} (${source.name})`,
      img: effect.img,
      changes,
      statuses: aura.statuses,
      overTime
    });
    ensured += 1;
  }
  emitCombatFx({
    kind: "aura",
    subtype: auraId,
    actorUuid: source.uuid,
    tokenUuid: sourceToken.document?.uuid,
    outcome: { feet, effectUuid: effect.uuid }
  });
  return ensured;
}

async function clearStaleAuraEffects(targetActor, stillValidKeys) {
  const toDelete = [];
  for (const effect of targetActor.effects ?? []) {
    const meta = effect.flags?.[MODULE_ID];
    if (meta?.kind !== "aura-buff") continue;
    const key = `${meta.sourceUuid}:${meta.auraId}`;
    if (!stillValidKeys.has(key)) toDelete.push(effect);
  }
  if (toDelete.length) await deleteDocs(toDelete);
}

/**
 * Recompute all mechanical auras on the canvas.
 */
export async function syncAllAuras() {
  const tokens = canvas?.tokens?.placeables ?? [];
  if (!tokens.length) return { sources: 0, buffs: 0 };

  /** @type {Map<string, Set<string>>} actorUuid -> valid keys */
  const validByActor = new Map();
  let sources = 0;
  let buffs = 0;

  for (const sourceToken of tokens) {
    const source = sourceToken.actor;
    if (!source) continue;
    const auras = findAuraFeatures(source);
    const declared = activeDeclaredAuras(source);
    if (!auras.length && !declared.length) continue;
    sources += 1;

    for (const entry of declared) {
      buffs += await spreadDeclaredAura(sourceToken, tokens, entry, validByActor);
    }

    for (const { spec, item } of auras) {
      if (spec.incapacitatedBlocks && isIncapacitated(source)) continue;
      const feet = resolveAuraFeet(source, spec);

      if (spec.requiresConcentration) {
        const concentrating = source.statuses?.has?.("concentrating")
          || source.effects?.some?.((e) => e.statuses?.has?.("concentrating"));
        // Allow if the aura item itself is active even without concentration flag
        if (!concentrating && !source.effects?.some?.((e) =>
          String(e.origin ?? "").includes(item.uuid) || /spirit\s*guardian/i.test(e.name ?? "")
        )) {
          // Still sync buff auras only when concentrating; damaging auras need concentration
          if (spec.damaging) continue;
        }
      }

      for (const other of tokens) {
        if (!other.actor) continue;
        if (spec.affects === "ally") {
          if (other.id !== sourceToken.id && !dispositionsFriendly(sourceToken, other)) continue;
        } else if (spec.affects === "enemy") {
          if (other.id === sourceToken.id || dispositionsFriendly(sourceToken, other)) continue;
        }
        const dist = feetBetween(sourceToken, other);
        if (!(dist <= feet + 1e-6)) continue;

        // Damaging auras (Spirit Guardians) — tag a marker effect; damage ticks on turn start
        if (spec.damaging) {
          const sourceUuid = source.uuid;
          if (!validByActor.has(other.actor.uuid)) validByActor.set(other.actor.uuid, new Set());
          validByActor.get(other.actor.uuid).add(`${sourceUuid}:${spec.id}-dmg`);
          await ensureDamagingAuraEffect(other.actor, {
            sourceUuid,
            auraId: spec.id,
            name: `${spec.effectName} (${source.name})`,
            damaging: spec.damaging,
            saveDc: Number(source.system?.attributes?.spell?.dc)
              || (8 + (Number(source.system?.attributes?.prof) || 0)
                + Math.max(
                  Number(source.system?.abilities?.wis?.mod) || 0,
                  Number(source.system?.abilities?.cha?.mod) || 0,
                  Number(source.system?.abilities?.int?.mod) || 0
                ))
          });
          buffs += 1;
          continue;
        }

        const sourceUuid = source.uuid;
        if (!validByActor.has(other.actor.uuid)) validByActor.set(other.actor.uuid, new Set());
        if (spec.bonus) validByActor.get(other.actor.uuid).add(`${sourceUuid}:${spec.id}`);
        if (spec.immunities?.length) {
          validByActor.get(other.actor.uuid).add(`${sourceUuid}:${spec.id}-imm`);
        }

        if (spec.bonus) {
          const bonus = auraSaveBonus(source, spec);
          await ensureSaveBonusEffect(other.actor, {
            sourceUuid,
            auraId: spec.id,
            name: `${spec.effectName} (${source.name})`,
            bonus
          });
          buffs += 1;
        }
        if (spec.immunities?.length) {
          await ensureImmunityEffect(other.actor, {
            sourceUuid,
            auraId: spec.id,
            name: `${spec.effectName} (${source.name})`,
            immunities: spec.immunities
          });
          buffs += 1;
        }
      }

      emitCombatFx({
        kind: "aura",
        subtype: spec.id,
        actorUuid: source.uuid,
        tokenUuid: sourceToken.document?.uuid,
        outcome: { feet, itemUuid: item.uuid }
      });
    }
  }

  for (const token of tokens) {
    const actor = token.actor;
    if (!actor) continue;
    await clearStaleAuraEffects(actor, validByActor.get(actor.uuid) ?? new Set());
  }

  try {
    Hooks.callAll(`${MODULE_ID}.aurasSynced`, { sources, buffs });
  } catch {
    /* ignore */
  }
  return { sources, buffs };
}
