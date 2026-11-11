/**
 * Match a content block to an owned item or an active effect.
 */

import { listActivities } from "../domain/combat/activity-kind.mjs";

function idOf(item) {
  return String(item?.system?.identifier ?? item?.identifier ?? "").toLowerCase();
}

function usesReaction(item) {
  if (item?.system?.activation?.type === "reaction") return true;
  return listActivities(item).some((a) => a?.activation?.type === "reaction");
}

export function contentMatchesItem(content, item) {
  const m = content.match ?? {};
  if (m.types && !m.types.includes(item?.type)) return false;
  if (m.reactionOnly && !usesReaction(item)) return false;
  if (m.identifiers?.includes(idOf(item))) return true;
  return (m.names ?? []).some((re) => re.test(String(item?.name ?? "")));
}

export function contentMatchesEffect(content, effect) {
  return (content.match?.effects ?? []).some((re) => re.test(String(effect?.name ?? "")));
}
