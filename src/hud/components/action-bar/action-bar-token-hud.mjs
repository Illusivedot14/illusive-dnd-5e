import {
  buildIdleMovementData,
  buildMovementData,
  listTokenMovementActions
} from "../../../application/action-economy.mjs";
import { getViewedCombat } from "../../../foundry/combat.mjs";
import { illusiveDnd } from "../../../i18n/index.mjs";

function resolveCanvasToken(token) {
  if (!token) return null;
  return canvas.tokens?.get(token.id) ?? token;
}

function statusEffectVisibleOnHud(effect, actor) {
  if (!effect || effect.hud === false) return false;
  if (!actor) return true;

  const hud = effect.hud;
  if (hud && typeof hud === "object" && hud.actorTypes?.length) {
    const type = actor.type ?? actor.document?.type;
    return hud.actorTypes.includes(type);
  }

  return true;
}

function mapFoundryStatusChoices(choices) {
  return Object.values(choices).map((entry, index) => ({
    id: entry.id,
    title: entry.title ?? entry.name ?? entry.id,
    src: entry.src ?? entry.img ?? "icons/svg/aura.svg",
    isActive: Boolean(entry.isActive),
    isOverlay: Boolean(entry.isOverlay),
    sortIndex: index
  }));
}

export function sortStatusChoices(effects) {
  return [...(effects ?? [])]
    .map((effect, index) => ({
      ...effect,
      sortIndex: Number.isFinite(Number(effect.sortIndex)) ? Number(effect.sortIndex) : index
    }))
    .sort((a, b) => Number(Boolean(b.isActive)) - Number(Boolean(a.isActive)) || a.sortIndex - b.sortIndex);
}

/** Foundry movement actions, with leftover feet when we know them. */
export function collectMovementChoices(token) {
  if (!token) return [];

  const actions = listTokenMovementActions(token);
  if (!actions.length) return [];

  const inCombat = Boolean(getViewedCombat()?.started);
  const movement = inCombat ? buildMovementData(token) : buildIdleMovementData(token);
  const byId = Object.create(null);
  for (const mode of movement?.modes ?? []) byId[mode.id] = mode;

  const current = token.document?.movementAction || movement?.mode || "walk";
  const poolLeft = Number.isFinite(movement?.remainingFeet) ? movement.remainingFeet : null;

  return actions.map((action) => {
    const mode = byId[action.id];
    let leftover = null;
    if (mode && Number.isFinite(mode.remaining)) {
      leftover = inCombat && Number.isFinite(mode.max)
        ? `${mode.remaining}/${mode.max}`
        : String(mode.remaining);
    } else if (inCombat && poolLeft !== null) {
      leftover = String(poolLeft);
    }

    return {
      id: action.id,
      label: action.label,
      icon: action.icon,
      leftover,
      speed: leftover,
      isActive: action.id === current
    };
  });
}

async function restoreTokenHud(hud, previous, placeable, wasAlreadyBound) {
  if (wasAlreadyBound) return;
  if (previous && previous.id !== placeable?.id) {
    await hud.bind?.(previous);
    return;
  }
  if (typeof hud.clear === "function") {
    hud.clear();
    return;
  }
  await hud.close?.();
}

async function readHudStatusChoices(placeable) {
  const hud = canvas?.hud?.token;
  if (!hud?.bind || !placeable) return null;

  const previous = hud.object ?? null;
  const wasAlreadyBound = previous?.id === placeable.id;

  try {
    if (!wasAlreadyBound) await hud.bind(placeable);
    const choices = hud._getStatusEffectChoices?.();
    if (choices && Object.keys(choices).length) {
      return mapFoundryStatusChoices(choices);
    }
    return null;
  } finally {
    await restoreTokenHud(hud, previous, placeable, wasAlreadyBound);
  }
}

export async function collectStatusChoices(token) {
  const placeable = resolveCanvasToken(token);
  const fromHud = await readHudStatusChoices(placeable);
  if (fromHud?.length) return sortStatusChoices(fromHud);

  if (!token?.actor) return [];

  return sortStatusChoices(
    (CONFIG.statusEffects ?? [])
      .filter((effect) => statusEffectVisibleOnHud(effect, token.actor))
      .map((effect, index) => ({
        id: effect.id,
        title: effect.name ?? effect.label ?? effect.id,
        src: effect.img ?? effect.icon ?? "icons/svg/aura.svg",
        isActive: Boolean(token.document.hasStatusEffect?.(effect.id)),
        isOverlay: Boolean(effect.overlay),
        sortIndex: index
      }))
  );
}

export async function toggleTokenStatusEffect(token, statusId) {
  if (typeof token.toggleEffect === "function") {
    return token.toggleEffect(statusId);
  }
  return token.actor?.toggleStatusEffect?.(statusId);
}
