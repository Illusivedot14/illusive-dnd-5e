import { MODULE_ID } from "../constants.mjs";
import { getHpBarData, getTokenCombatStats, statPercent, getDamageWashCssPct } from "./actor-stats.mjs";
import { getViewedCombat, getActiveCombatant } from "./combat.mjs";
import { buildVitalityIcon, isCombatantDeathSaving, isCombatantDefeated, isCombatantStabilized } from "../application/party-combat.mjs";
import { readMemberCache, writeMemberCache } from "../hud/lib/render/member-cache.mjs";

export function combatantToken(combatant) {
  return combatant?.token?.object ?? canvas.tokens?.get(combatant?.tokenId) ?? null;
}

export function isEventCombatant(combatant) {
  return combatant.getFlag?.(MODULE_ID, "event") ?? combatant.flags?.[MODULE_ID]?.event ?? false;
}

export function getEventRoundsLeft(combatant, combat) {
  const duration = combatant.getFlag?.(MODULE_ID, "duration");
  if (!duration) return null;
  const roundCreated = combatant.getFlag?.(MODULE_ID, "roundCreated") ?? 0;
  return Math.max(0, duration - ((combat.round ?? 1) - roundCreated));
}

/** Rounds left for tracker display — null when the event hides duration. */
export function getEventDisplayRoundsLeft(combatant, combat) {
  if (combatant.getFlag?.(MODULE_ID, "hideDuration") === true) return null;
  return getEventRoundsLeft(combatant, combat);
}

export function getHP(actor) {
  const hp = actor?.system?.attributes?.hp;
  return {
    value: hp?.value ?? 0,
    max: hp?.max ?? 0
  };
}

export function getResource(actor) {
  const resources = actor?.system?.resources;
  if (!resources) return null;

  const pick = (res, fallbackLabel) => {
    if (!res || typeof res.max !== "number" || res.max <= 0) return null;
    const label = res.label ?? fallbackLabel ?? "Resource";
    if (typeof label !== "string" || label.length > 28) return null;
    return {
      label,
      value: res.value ?? 0,
      max: res.max
    };
  };

  const primary = pick(resources.primary, "Resource");
  if (primary) return primary;

  for (const [key, res] of Object.entries(resources)) {
    if (key === "primary") continue;
    const found = pick(res, key);
    if (found) return found;
  }

  return null;
}

export function isTokenTurn(token) {
  const combat = getViewedCombat();
  if (!combat?.started || !token) return false;
  return getActiveCombatant(combat)?.tokenId === token.id;
}

const FALLBACK_PORTRAIT = "icons/svg/mystery-man.svg";

/**
 * Sync fallback for dnd5e Actor5e#getPreferredArtwork().
 * Default: actor avatar (`img`). Prototype token texture only when
 * `dnd5e.showTokenPortrait` is true — never canvas token or combatant.img.
 *
 * @param {Actor|null|undefined} actor
 * @returns {string}
 */
export function resolvePortraitSrc(actor) {
  if (!actor) return FALLBACK_PORTRAIT;

  const showTokenPortrait = actor.getFlag?.("dnd5e", "showTokenPortrait") === true;

  if (showTokenPortrait) {
    const texture = actor.prototypeToken?.texture?.src ?? "";
    if (texture) return texture;
  }

  const avatar = typeof actor.img === "string" ? actor.img.trim() : "";
  if (avatar) return avatar;

  try {
    const source = actor._source ?? actor.toObject?.() ?? {};
    const defaultArtwork = actor.constructor?.getDefaultArtwork?.(source)?.img;
    if (defaultArtwork) return defaultArtwork;
  } catch {
    /* ignore */
  }

  return FALLBACK_PORTRAIT;
}

/**
 * Sheet-accurate portrait source (async). Prefer Actor5e#getPreferredArtwork().
 *
 * @param {Actor|null|undefined} actor
 * @returns {Promise<{ src: string, isToken: boolean }>}
 */
export async function resolvePortraitArtwork(actor) {
  if (!actor) return { src: FALLBACK_PORTRAIT, isToken: false };

  if (typeof actor.getPreferredArtwork === "function") {
    try {
      const art = await actor.getPreferredArtwork();
      if (art?.src) {
        return { src: art.src, isToken: Boolean(art.isToken) };
      }
    } catch (err) {
      console.warn("illusive-dnd-5e | getPreferredArtwork failed", err);
    }
  }

  const isToken = actor.getFlag?.("dnd5e", "showTokenPortrait") === true;
  return { src: resolvePortraitSrc(actor), isToken };
}

/** Thumbnail crop mode matching the sheet presentation for this artwork. */
export function portraitCropForArtwork(isToken) {
  return isToken ? "contain" : "top";
}

/**
 * Member data for a token, memoized for the current render pass. Each caller gets
 * its own shallow copy so top-level mutations (e.g. clearing `resource`, setting
 * `selected`) don't leak between panels.
 */
export function buildMemberData(token) {
  const cached = readMemberCache(token.id);
  if (cached) return { ...cached };

  const data = computeMemberData(token);
  writeMemberCache(token.id, data);
  return { ...data };
}

function computeMemberData(token) {
  const actor = token.actor;
  const hpBar = getHpBarData(actor);
  const resource = getResource(actor);
  const stats = getTokenCombatStats(actor);

  return {
    id: token.id,
    actorId: actor?.id,
    name: token.name || actor.name,
    displayName: (token.name || actor?.name || "").trim(),
    img: resolvePortraitSrc(actor),
    isDowned: hpBar.tier === "down",
    isMyTurn: isTokenTurn(token),
    stats,
    hp: {
      value: hpBar.value,
      max: hpBar.max,
      temp: hpBar.temp,
      percent: hpBar.percent,
      basePercent: hpBar.basePercent,
      tempPercent: hpBar.tempPercent,
      totalPercent: hpBar.totalPercent,
      tier: hpBar.tier
    },
    resource: resource
      ? {
          label: resource.label,
          value: resource.value,
          max: resource.max,
          percent: statPercent(resource)
        }
      : null
  };
}

export function buildCombatantData(combatant, combat) {
  const actor = combatant.actor;
  const isEvent = isEventCombatant(combatant);
  const hpBar = getHpBarData(actor);
  const token = combatantToken(combatant);
  const markedDefeated = combatant.isDefeated ?? combatant.defeated ?? false;
  const isDead = !isEvent && isCombatantDefeated(actor, combatant);
  const isStabilized = !isEvent && isCombatantStabilized(actor, combatant);
  const isDeathSaving = !isEvent && isCombatantDeathSaving(actor, combatant);
  const vitalityIcon = buildVitalityIcon({ isDefeated: isDead, isStabilized, isDeathSaving });
  const hideDefeated = game.settings.get(MODULE_ID, "hideDefeatedCombatants") === true;
  const secret = combatant.hidden === true;
  const isGM = game.user.isGM;
  const hasRolled = combatant.initiative !== null && combatant.initiative !== undefined;
  // Health status wash is visible to everyone; numeric HP text is gated separately.
  const canSeeHp = true;
  const showHp = !isEvent && canSeeHp && !vitalityIcon;
  const washPct = showHp
    ? getDamageWashCssPct(hpBar.totalPercent)
    : null;

  return {
    id: combatant.id,
    actorId: actor?.id ?? "",
    tokenId: token?.id ?? combatant.tokenId ?? "",
    name: combatant.name,
    img: isEvent
      ? (combatant.img || FALLBACK_PORTRAIT)
      : resolvePortraitSrc(actor),
    initiative: combatant.initiative ?? "—",
    hasRolled,
    canRollInitiative: !isEvent && !hasRolled && Boolean(actor?.isOwner),
    isActive: getActiveCombatant(combat)?.id === combatant.id,
    markedDefeated,
    isDead,
    isStabilized,
    isDeathSaving,
    vitalityIcon,
    secret,
    hidden: hideDefeated && markedDefeated && !isGM,
    isEvent,
    showHp,
    showDamageWash: washPct != null,
    washPctCss: washPct != null ? `${washPct}%` : null,
    roundsLeft: isEvent ? getEventDisplayRoundsLeft(combatant, combat) : null,
    hp: {
      value: hpBar.value,
      max: hpBar.max,
      percent: hpBar.percent,
      totalPercent: hpBar.totalPercent,
      tier: hpBar.tier
    }
  };
}

/**
 * Card data for a collapsed combatant group: one entry showing a representative
 * portrait/name, the shared initiative, and a visible-member count. Groups never
 * expose per-actor HP (they can mix many actors).
 */
function buildGroupData(unit, combat) {
  const { group, members } = unit;
  const isGM = game.user.isGM;
  const hideDefeated = game.settings.get(MODULE_ID, "hideDefeatedCombatants") === true;

  const visibleMembers = members.filter((member) => {
    const markedDefeated = member.isDefeated ?? member.defeated ?? false;
    return !(hideDefeated && markedDefeated && !isGM);
  });

  const rep = visibleMembers[0] ?? members[0] ?? null;
  const count = visibleMembers.length;
  const allMarkedDefeated = members.length > 0
    && members.every((m) => (m.isDefeated ?? m.defeated ?? false));
  const activeId = getActiveCombatant(combat)?.id;
  const anyActive = members.some((m) => activeId === m.id);
  const secret = members.length > 0 && members.every((m) => m.hidden === true);

  // Members may store initiative individually or defer to the group's field; try both.
  const initiativeValue = rep?.initiative ?? group?.initiative ?? null;
  const hasRolled = initiativeValue !== null && initiativeValue !== undefined;
  const canRollInitiative = !hasRolled && members.some((m) => Boolean(m.actor?.isOwner));

  return {
    id: unit.id,
    kind: "group",
    isGroup: true,
    groupId: group?.id ?? "",
    tokenId: rep?.tokenId ?? rep?.token?.id ?? "",
    name: group?.name || rep?.name || "Group",
    actorId: rep?.actor?.id ?? "",
    img: group?.img || resolvePortraitSrc(rep?.actor),
    count,
    initiative: hasRolled ? initiativeValue : "—",
    hasRolled,
    canRollInitiative,
    isActive: anyActive,
    markedDefeated: allMarkedDefeated,
    secret,
    hidden: count === 0,
    isEvent: false,
    showHp: false,
    roundsLeft: null,
    hp: { value: 0, max: 0, percent: 0, totalPercent: 0, tier: "healthy" }
  };
}

/** Dispatch turn-tracker card data-building for a unit (single combatant or a group). */
export function buildUnitData(unit, combat) {
  if (unit.kind === "group") return buildGroupData(unit, combat);
  const data = buildCombatantData(unit.combatant, combat);
  data.kind = "combatant";
  data.isGroup = false;
  return data;
}
