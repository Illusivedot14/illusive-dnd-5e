import { characterIdOf, isSheetUpdate } from "./message.mjs";
import { actorIdFor, beyondLink, linkFlagChanges, readCharacterMapping } from "./character-mapper.mjs";
import { fetchCharacterData } from "./character-data.mjs";
import { connectionConfig } from "./settings.mjs";
import { beyondDebug } from "./debug.mjs";
import { beyondState, linkItems, readChanges, structureGaps } from "./state.mjs";
import { isWritePending, rememberView } from "./writeback.mjs";

export const READ_OPTION = Object.freeze({ illusiveBeyond: "read" });

/** Foundry writes `parent` and other fields into the options it is given, so every call gets its own copy. */
function readOption(extra = {}) {
  return { ...READ_OPTION, ...extra };
}

function sameList(a = [], b = []) {
  return a.length === b.length && a.every((entry, index) => entry === b[index]);
}

/** Add or remove one status the way Foundry's token HUD does, tagged as a read. */
async function setStatus(actor, status, active) {
  if (active) {
    const effect = await globalThis.ActiveEffect?.implementation?.fromStatusEffect?.(status);
    if (effect) return actor.createEmbeddedDocuments("ActiveEffect", [effect.toObject()], readOption({ keepId: true }));
    return actor.toggleStatusEffect?.(status, { active: true });
  }
  const primary = [...(actor.effects ?? [])].filter((effect) => [...(effect.statuses ?? [])][0] === status);
  if (!primary.length) return null;
  return actor.deleteEmbeddedDocuments("ActiveEffect", primary.map((effect) => effect.id), readOption());
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
    beyondDebug("max-differs", { name: actor.name, characterId, foundry: preparedMax, beyond: beyond.hp.max });
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
