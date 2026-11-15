import { MODULE_ID } from "../constants.mjs";
import { SETTING } from "./settings.mjs";

export function actorIdFor(mapping, characterId) {
  if (!mapping || characterId == null) return null;
  const id = mapping[String(characterId)];
  return id == null || id === "" ? null : String(id);
}

export function readCharacterMapping() {
  return game.settings.get(MODULE_ID, SETTING.characterMapping) ?? {};
}

export function characterIdForActor(mapping, actorId) {
  if (!mapping || actorId == null) return null;
  const found = Object.entries(mapping).find(([, id]) => String(id) === String(actorId));
  return found ? String(found[0]) : null;
}

/** Character actors, labeled with the token name when one is on the scene. */
export function playerTokenChoices({ tokens = [], actors = [] } = {}) {
  const actorById = new Map(actors.filter(Boolean).map((actor) => [String(actor.id), actor]));
  const tokenName = new Map();
  for (const token of tokens) {
    const actorId = token?.actorId ?? token?.actor?.id ?? null;
    if (!actorId || tokenName.has(String(actorId))) continue;
    const actor = token.actor ?? actorById.get(String(actorId));
    if (!actor || actor.type !== "character") continue;
    tokenName.set(String(actorId), token.name || actor.name);
  }
  const choices = [];
  const seen = new Set();
  const pool = actors.filter((actor) => actor?.type === "character" && actor.id);
  const source = pool.length ? pool : [...tokenName.keys()].map((id) => ({ id, name: tokenName.get(id), type: "character" }));
  for (const actor of source) {
    const id = String(actor.id);
    if (seen.has(id)) continue;
    seen.add(id);
    choices.push({ id, name: tokenName.get(id) || actor.name });
  }
  return choices;
}

export async function removeCharacterMapping(characterId) {
  const mapping = { ...readCharacterMapping() };
  delete mapping[String(characterId)];
  await game.settings.set(MODULE_ID, SETTING.characterMapping, mapping);
  return mapping;
}

export const LINK_FLAG = "beyond";

export function linkedCharacterIds(mapping) {
  return Object.entries(mapping ?? {})
    .filter(([characterId, actorId]) => characterId && actorId)
    .map(([characterId]) => String(characterId));
}

export function beyondLink(actor) {
  return actor?.flags?.[MODULE_ID]?.[LINK_FLAG] ?? null;
}

/** The link flag, as flat update paths. */
export function linkFlagChanges(characterId, { campaignId = "", modified = null, now = Date.now(), reimport = [] } = {}) {
  return {
    [`flags.${MODULE_ID}.${LINK_FLAG}`]: {
      characterId: String(characterId),
      campaignId: String(campaignId ?? ""),
      modified,
      pulledAt: modified ? now : null,
      reimport: [...reimport]
    }
  };
}

/** Why a new link would clash with the ones already made. */
export function linkConflicts(mapping, characterId, actorId) {
  const conflicts = [];
  const current = actorIdFor(mapping, characterId);
  if (current && current !== String(actorId)) conflicts.push({ kind: "character", actorId: current });
  const other = characterIdForActor(mapping, actorId);
  if (other && other !== String(characterId)) conflicts.push({ kind: "actor", characterId: other });
  return conflicts;
}

/** Point one Beyond character at one actor. The menu index and the actor flag change together. */
export async function linkCharacter(characterId, actorId, { campaignId = "", actors = game.actors } = {}) {
  const mapping = { ...readCharacterMapping() };
  const conflicts = linkConflicts(mapping, characterId, actorId);
  for (const conflict of conflicts) {
    if (conflict.kind === "character") await actors?.get?.(conflict.actorId)?.unsetFlag?.(MODULE_ID, LINK_FLAG);
    if (conflict.kind === "actor") delete mapping[conflict.characterId];
  }
  mapping[String(characterId)] = String(actorId);
  await game.settings.set(MODULE_ID, SETTING.characterMapping, mapping);
  await actors?.get?.(actorId)?.update?.(linkFlagChanges(characterId, { campaignId }), { illusiveBeyond: "link" });
  return { mapping, conflicts };
}

export async function unlinkCharacter(characterId, { actors = game.actors } = {}) {
  const actorId = actorIdFor(readCharacterMapping(), characterId);
  const mapping = await removeCharacterMapping(characterId);
  if (actorId) await actors?.get?.(actorId)?.unsetFlag?.(MODULE_ID, LINK_FLAG);
  return mapping;
}
