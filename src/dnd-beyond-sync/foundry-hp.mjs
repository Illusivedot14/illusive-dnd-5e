import { characterIdForActor } from "./character-mapper.mjs";

/** A Foundry hit point change on a player character. Linked actors name their Beyond id. */
const HP_KEYS = ["value", "temp", "max", "tempmax"];

export function noteFoundryHitPoints(actor, changes, { enabled = false, mapping = {}, log = () => {} } = {}) {
  const hp = changes?.system?.attributes?.hp ?? {};
  const next = {};
  for (const key of HP_KEYS) {
    if (hp[key] != null) next[key] = hp[key];
  }
  if (!Object.keys(next).length || actor?.type !== "character" || !enabled) return null;
  const characterId = characterIdForActor(mapping, actor.id);
  const entry = characterId
    ? { name: actor.name, characterId, ...next }
    : { name: actor.name, reason: "not-linked" };
  log("foundry-hp", entry);
  return entry;
}
