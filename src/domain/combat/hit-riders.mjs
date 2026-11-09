/**
 * Catalog of post-hit damage riders (Divine Smite, Sneak Attack, …).
 */

import { listActivities } from "./activity-kind.mjs";

const RIDER_MATCHERS = [
  {
    id: "divine-smite",
    auto: false,
    test: (item) => /divine\s*smite/i.test(item?.name ?? "")
      || item?.system?.identifier === "divine-smite"
  },
  {
    id: "sneak-attack",
    auto: false,
    test: (item) => /sneak\s*attack/i.test(item?.name ?? "")
      || item?.system?.identifier === "sneak-attack"
  },
  {
    id: "eldritch-smite",
    auto: false,
    test: (item) => /eldritch\s*smite/i.test(item?.name ?? "")
      || item?.system?.identifier === "eldritch-smite"
  },
  {
    id: "hex",
    auto: true,
    mark: true,
    test: (item) => item?.system?.identifier === "hex" || /^hex$/i.test(item?.name ?? "")
  },
  {
    id: "hunters-mark",
    auto: true,
    mark: true,
    test: (item) => item?.system?.identifier === "hunters-mark"
      || /hunter'?s\s*mark/i.test(item?.name ?? "")
  }
];

/**
 * @param {object} actor
 * @param {{ includeMarks?: boolean }} [opts]
 * @returns {Array<{ id: string, item: object, activity: object|null, auto: boolean, mark: boolean }>}
 */
export function listAvailableHitRiders(actor, { includeMarks = true } = {}) {
  const out = [];
  if (!actor?.items) return out;
  for (const item of actor.items) {
    const match = RIDER_MATCHERS.find((m) => m.test(item));
    if (!match) continue;
    if (match.mark && !includeMarks) continue;
    const list = listActivities(item);
    const damageAct = list.find((a) => a?.type === "damage") ?? (!match.mark ? list[0] : null) ?? null;
    if (!damageAct) continue;
    out.push({
      id: match.id,
      item,
      activity: damageAct,
      auto: Boolean(match.auto),
      mark: Boolean(match.mark)
    });
  }
  return out;
}
