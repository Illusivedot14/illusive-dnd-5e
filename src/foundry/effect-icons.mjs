import { isEffectDurationExpired } from "./effect-duration.mjs";

const FALLBACK_EFFECT_IMG = "icons/svg/aura.svg";

function statusConfig(statusId) {
  if (!statusId) return null;
  return CONFIG.statusEffects?.find((entry) => entry.id === statusId) ?? null;
}

function statusImage(statusId) {
  const config = statusConfig(statusId);
  return config?.img || config?.icon || null;
}

function effectHasStatus(effect, statusId) {
  if (!effect || !statusId) return false;
  const statuses = effect.statuses;
  if (!statuses) return false;
  if (typeof statuses.has === "function") return statuses.has(statusId);
  return [...statuses].includes(statusId);
}

function isDefeatedEffect(effect) {
  const defeated = CONFIG.specialStatusEffects?.DEFEATED;
  return Boolean(defeated) && effectHasStatus(effect, defeated);
}

/** Prefer effect art, then status-config art, then a visible fallback. */
export function getEffectImage(effect) {
  const direct = effect?.img || effect?.icon;
  if (direct) return direct;

  for (const status of effect?.statuses ?? []) {
    const src = statusImage(status);
    if (src) return src;
  }

  return FALLBACK_EFFECT_IMG;
}

function* iterateActorEffects(actor) {
  if (!actor) return;

  const lists = [];
  if (typeof actor.allApplicableEffects === "function") {
    try {
      lists.push(actor.allApplicableEffects());
    } catch {
      /* older / custom actors */
    }
  }
  lists.push(actor.temporaryEffects);
  lists.push(actor.appliedEffects);
  lists.push(actor.effects?.contents);
  lists.push(actor.effects);

  const seen = new Set();
  for (const list of lists) {
    if (!list) continue;
    for (const effect of list) {
      if (!effect?.id || seen.has(effect.id)) continue;
      seen.add(effect.id);
      yield effect;
    }
  }
}

function effectHasAnyStatus(effect) {
  const statuses = effect?.statuses;
  if (!statuses) return false;
  if (typeof statuses.size === "number") return statuses.size > 0;
  return [...statuses].length > 0;
}

/**
 * Active, visible effects on an actor: not disabled, not the "defeated" special
 * status, de-duplicated by id. Temporary / status effects keep showing even when
 * Foundry marks some item-linked rows suppressed.
 */
export function collectActiveEffects(actor) {
  if (!actor) return [];

  const effects = [];
  const seen = new Set();

  const add = (effect) => {
    if (!effect || seen.has(effect.id)) return;
    if (effect.disabled) return;
    if (isEffectDurationExpired(effect)) return;
    if (isDefeatedEffect(effect)) return;

    // Keep condition / status rows even when an equipment transfer is suppressed.
    if (effect.isSuppressed && !effectHasAnyStatus(effect)) return;

    seen.add(effect.id);
    effects.push(effect);
  };

  for (const effect of iterateActorEffects(actor)) add(effect);

  // Safety net: actor.statuses ids with no collected ActiveEffect (image-only gaps).
  for (const statusId of actor.statuses ?? []) {
    if (!statusId) continue;
    if (statusId === CONFIG.specialStatusEffects?.DEFEATED) continue;
    if (effects.some((effect) => effectHasStatus(effect, statusId))) continue;

    const config = statusConfig(statusId);
    effects.push({
      id: `illusive-dnd-status:${statusId}`,
      uuid: null,
      name: config?.name ? game.i18n.localize(config.name) : String(statusId),
      img: statusImage(statusId) || FALLBACK_EFFECT_IMG,
      icon: statusImage(statusId) || FALLBACK_EFFECT_IMG,
      statuses: new Set([statusId]),
      disabled: false,
      isSuppressed: false,
      description: "",
      duration: { label: "" }
    });
  }

  return effects;
}
