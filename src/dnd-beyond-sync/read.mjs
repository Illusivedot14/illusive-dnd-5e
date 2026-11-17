import { characterIdOf, isSheetUpdate } from "./message.mjs";
import { actorIdFor, beyondLink, linkFlagChanges, readCharacterMapping } from "./character-mapper.mjs";
import { fetchCharacterData } from "./character-data.mjs";
import { connectionConfig } from "./settings.mjs";
import { beyondDebug } from "./debug.mjs";
import {
  beyondState,
  conditionEffect,
  effectById,
  hpMaxGap,
  hpMaxGapEffect,
  HP_MAX_GAP_ID,
  linkItems,
  readChanges,
  structureGaps
} from "./state.mjs";
import { isWritePending, rememberView } from "./writeback.mjs";

export const READ_OPTION = Object.freeze({ illusiveBeyond: "read" });

/** Foundry writes `parent` and other fields into the options it is given, so every call gets its own copy. */
function readOption(extra = {}) {
  return { ...READ_OPTION, ...extra };
}

function sameList(a = [], b = []) {
  return a.length === b.length && a.every((entry, index) => entry === b[index]);
}

function statusList(effect) {
  const statuses = effect?.statuses;
  if (statuses instanceof Set) return [...statuses];
  return [...(statuses ?? [])];
}

/**
 * Add or remove one condition, tagged as a read.
 * dnd5e condition effects use a fixed id (`dnd5epoisoned000`). Creating that id again throws
 * "already exists within the parent collection", so an effect that is already on the actor is kept.
 */
async function setStatus(actor, status, active) {
  const existing = conditionEffect(actor, status);
  if (active) {
    if (existing && !existing.disabled) return null;
    if (existing?.disabled) {
      return actor.updateEmbeddedDocuments("ActiveEffect", [{ _id: existing.id, disabled: false }], readOption());
    }
    const effect = await globalThis.ActiveEffect?.implementation?.fromStatusEffect?.(status);
    if (effect) return actor.createEmbeddedDocuments("ActiveEffect", [effect.toObject()], readOption({ keepId: true }));
    return actor.toggleStatusEffect?.(status, { active: true });
  }
  const ids = new Set();
  if (existing) ids.add(existing.id);
  for (const effect of actor.effects ?? []) {
    if (statusList(effect)[0] === status) ids.add(effect.id);
  }
  if (!ids.size) return null;
  return actor.deleteEmbeddedDocuments("ActiveEffect", [...ids], readOption());
}

/**
 * Add Beyond's missing maximum through the class hit point bonus, so a current value above
 * Foundry's 75 is not clamped back to full. The effect is removed when the two maxima match.
 */
async function syncHpMaxGap(actor, beyond) {
  const gap = hpMaxGap(actor, beyond);
  const existing = effectById(actor, HP_MAX_GAP_ID);
  if (!gap) {
    if (!existing) return null;
    return actor.deleteEmbeddedDocuments("ActiveEffect", [existing.id], readOption());
  }
  const effect = hpMaxGapEffect(gap);
  if (!existing) return actor.createEmbeddedDocuments("ActiveEffect", [effect], readOption({ keepId: true }));
  const current = existing.system?.changes ?? existing.changes ?? [];
  const value = current.find((entry) => entry?.key === "system.attributes.hp.bonuses.overall")?.value;
  if (String(value) === String(gap)) return null;
  return actor.updateEmbeddedDocuments("ActiveEffect", [{ _id: existing.id, changes: effect.changes }], readOption());
}

/**
 * Sheet update → Foundry play state.
 * Hit points, slots, uses, conditions, death saves, inspiration, currency, XP, hit dice,
 * equipped, and attuned come from Beyond. Structure gaps are recorded for a re-import.
 */
export async function applyBeyondSheet({
  message,
  config = connectionConfig(),
  mapping = readCharacterMapping(),
  actors = game.actors,
  fetchCharacter = fetchCharacterData,
  now = Date.now()
} = {}) {
  if (!config.updateDamage) return finish({ ok: false, reason: "disabled" });
  const characterId = characterIdOf(message);
  if (!characterId) return finish({ ok: false, reason: "noCharacter" });

  const actorId = actorIdFor(mapping, characterId);
  if (!actorId) return finish({ ok: false, reason: "unmapped", characterId });
  const actor = actors?.get?.(actorId);
  if (!actor) return finish({ ok: false, reason: "noActor", actorId });
  if (isWritePending(characterId)) return finish({ ok: false, reason: "writing", characterId });

  const sheet = await fetchCharacter(characterId, config);
  const character = sheet?.ddb?.character;
  if (!sheet?.success || !character) return finish({ ok: false, reason: "fetch", characterId });

  const links = linkItems(actor, character);
  const beyond = beyondState(character);
  rememberView(characterId, beyond, links);
  const changes = readChanges(actor, beyond, links);

  const preparedMax = Number(actor.system?.attributes?.hp?.max);
  if (beyond.hp && changes.actor["system.attributes.hp.max"] === undefined
    && Number.isFinite(preparedMax) && preparedMax !== beyond.hp.max) {
    beyondDebug("max-differs", {
      name: actor.name,
      characterId,
      foundry: preparedMax,
      beyond: beyond.hp.max,
      gap: hpMaxGap(actor, beyond)
    });
  }

  const gaps = structureGaps(actor, character);
  const modified = character.dateModified ?? null;
  const link = beyondLink(actor);
  if (link?.characterId !== String(characterId) || link?.modified !== modified || !sameList(link?.reimport, gaps)) {
    Object.assign(changes.actor, linkFlagChanges(characterId, { campaignId: config.campaignId, modified, now, reimport: gaps }));
  }
  if (gaps.length && !sameList(link?.reimport, gaps)) beyondDebug("reimport-needed", { name: actor.name, characterId, gaps });

  if (Object.keys(changes.actor).length) await actor.update({ ...changes.actor }, readOption());
  if (changes.items.length) await actor.updateEmbeddedDocuments("Item", changes.items.map((item) => ({ ...item })), readOption());
  for (const { status, active } of changes.statuses) await setStatus(actor, status, active);
  await syncHpMaxGap(actor, beyond);

  const hp = beyond.hp ?? {};
  const changed = Object.keys(changes.actor).filter((key) => key !== "_id" && !key.startsWith("flags."));
  const result = {
    max: hp.max,
    tempmax: hp.tempmax,
    value: hp.max == null ? undefined : Math.max(0, hp.max + hp.tempmax - hp.removed),
    temp: hp.temp,
    fields: changed.length,
    changed: changed.map((key) => key.replace(/^system\./, "")),
    items: changes.items.length,
    statuses: changes.statuses.length,
    toggled: changes.statuses.map(({ status, active }) => `${active ? "+" : "-"}${status}`),
    reimport: gaps.length
  };
  const touched = Object.keys(changes.actor).length + changes.items.length + changes.statuses.length;
  if (!touched) return finish({ ok: true, unchanged: true, characterId, ...result });
  return finish({ ok: true, characterId, name: actor.name, ...result });
}

function finish(result) {
  beyondDebug("read", result);
  return result;
}

export function readHandler(deps = {}) {
  return {
    canHandle: isSheetUpdate,
    handle: (message) => applyBeyondSheet({ message, ...deps })
  };
}
