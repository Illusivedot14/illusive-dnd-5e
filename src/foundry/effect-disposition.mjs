const DEBUFF_STATUS_IDS = new Set([
  "dead",
  "unconscious",
  "poisoned",
  "diseased",
  "frightened",
  "grappled",
  "restrained",
  "prone",
  "blinded",
  "deafened",
  "paralyzed",
  "petrified",
  "stunned",
  "incapacitated",
  "exhaustion",
  "bleeding",
  "burning",
  "cursed",
  "marked",
  "slow"
]);

const BUFF_STATUS_IDS = new Set([
  "blessed",
  "sanctuary",
  "haste",
  "heroism",
  "aid",
  "shield",
  "protected",
  "inspired",
  "barkskin",
  "resilient",
  "regeneration"
]);

const DEBUFF_NAME_RE =
  /\b(debuff|poison|fright|paraly|stun|blind|deaf|restrain|grapple|prone|curse|hex|slow|weak|disease|exhaust|bleed|burn|necrot|chill|fear|sicken)/i;
const BUFF_NAME_RE =
  /\b(bless|sanctu|haste|hero|shield|protect|inspir|barkskin|regener|resist|aid|buff|enhance|fly|invisib)/i;

function statusIds(effect) {
  const ids = [];
  for (const status of effect.statuses ?? []) {
    ids.push(String(status).toLowerCase());
  }
  return ids;
}

/** @returns {"buff"|"debuff"|"neutral"} */
export function getEffectDisposition(effect) {
  const ids = statusIds(effect);
  if (ids.some((id) => DEBUFF_STATUS_IDS.has(id))) return "debuff";
  if (ids.some((id) => BUFF_STATUS_IDS.has(id))) return "buff";

  const defeated = globalThis.CONFIG?.specialStatusEffects?.DEFEATED ?? "dead";
  if (ids.includes(String(defeated).toLowerCase())) return "debuff";

  const name = effect.name ?? "";
  if (DEBUFF_NAME_RE.test(name)) return "debuff";
  if (BUFF_NAME_RE.test(name)) return "buff";

  return "neutral";
}
