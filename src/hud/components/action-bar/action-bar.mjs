import { MODULE_ID, MODULE_PATH, illusiveDndRenderTemplate } from "../../../constants.mjs";
import { buildMemberData, isTokenTurn } from "../../../foundry/actor-data.mjs";
import { applyActorPortrait } from "../../lib/portrait-thumb.mjs";
import { buildPassiveScores, buildVisionSummary, buildDefenseTraits, buildLanguageSummary } from "../../../foundry/actor-stats.mjs";
import { buildCombatToolbarSections } from "../../../application/action-data.mjs";
import {
  buildEconomyPips,
  buildLegendaryPips,
  buildLairPips,
  buildMovementData,
  buildIdleMovementData,
  getCombatantForToken,
  findCombatantForToken,
  setMovementMode
} from "../../../application/action-economy.mjs";
import {
  getEconomyAvailability,
  isItemsEconomySpent
} from "../../../application/economy.mjs";
import {
  getGameLogView,
  setGameLogCombatActive
} from "../../../application/combat-game-log.mjs";
import { buildTargetListLabel } from "../../../application/activity.mjs";
import { illusiveDnd } from "../../../i18n/index.mjs";
import { clearTurnFlags } from "../../../application/standard-actions.mjs";
import { dropConcentrationFromHud } from "../../../application/combat-actions.mjs";
import {
  clearReactionPrompt,
  getActionBarToken,
  getReactionContext,
  isReactionActorForUser,
  passReaction,
  startReactionPrompt
} from "../../../application/reaction-context.mjs";
import {
  buildVitalityIcon,
  getDeathSaves,
  isPartyDeathSaving,
  isPartyDefeated,
  isPartyStabilized,
  markActorStable,
  syncActorStableFlag,
  toggleDeathSavePip,
  ensureActorStableFlag
} from "../../../application/party-combat.mjs";
import { planAndUseAbility, fireAfterTargetPick } from "../../../application/use-ability-command.mjs";
import {
  computeActionBarScale,
  getHudBand,
  isPortraitDisplay
} from "../../lib/hud-bounds.mjs";
import { getUiLocalRect, getUiViewportSize } from "../../lib/viewport.mjs";
import { settingOn } from "../../lib/hud-settings.mjs";
import { desktopHudEnabled } from "../../lib/mobile-client.mjs";
import { getViewedCombat } from "../../../foundry/combat.mjs";
import { refreshHud } from "../../lib/render/core.mjs";
import { ILLUSIVE_DND_RENDER } from "../../lib/render/scopes.mjs";
import { definePanel } from "../../lib/render/define-panel.mjs";
import { renderTokenStatuses, positionTokenStatuses } from "../token-statuses/token-statuses.mjs";
import { repositionCameraPad } from "../camera-pad/camera-pad.mjs";
import { syncFoundryUiVisibility, isFoundryHotbarHidden } from "./action-bar-foundry-ui.mjs";
import {
  handleCombatFlowButton,
  handleUtilityButton,
  canOpenTokenConfig,
  toggleMovementDropdown,
  toggleStatusDropdown,
  toggleLightDropdown,
  toggleAuraDropdown,
  toggleRollsDropdown,
  toggleGameLogDropdown,
  isTokenLightOn,
  isTokenAuraOn
} from "./action-bar-token-actions.mjs";
import { bindAuraDropdownSync, closeUtilDropdownUnlessStatus, relinkStatusDropdownAnchor, toggleEconomySpentDropdown } from "./action-bar-util-dropdown.mjs";
import { buildAbilityGroups } from "./action-bar-groups.mjs";
import { bindAbilityTooltips } from "./ability-tooltip.mjs";
import { bindActionBarUiTooltips, hideActionBarUiTooltip } from "./action-bar-ui-tooltip.mjs";
import { pickCastSlotLevel } from "./action-bar-cast-picker.mjs";
import {
  buildTargetPickView,
  cancelTargetPick,
  confirmTargetPick,
  getTargetPickState,
  handleControlTokenDuringTargetPick,
  isTargetPickActive,
  startTargetPick
} from "./action-bar-target-picker.mjs";
import { rememberActionBarToken } from "../../lib/action-bar-token.mjs";
import { applyActionBarMinimized, expandActionBarForSelection, toggleActionBarMinimized } from "./action-bar-minimize.mjs";
import { handlePortraitHpContextMenu } from "./action-bar-hp-adjust.mjs";
import { adjustLegendaryResistance, buildActionBarResources, buildLegendaryResistance } from "../../../foundry/actor-resources.mjs";
import {
  panCanvasToToken,
  getTokenElevation,
  isTokenFlipped,
  nudgeTokenElevation
} from "../../../foundry/token-actions.mjs";

const ABILITIES_TEMPLATE = `${MODULE_PATH}/src/hud/components/action-bar/action-bar-abilities.hbs`;
const ECONOMY_KEYS = { standard: "S", action: "A", bonus: "B", reaction: "R", legendary: "L", lair: "La" };
const PORTRAIT_RING_RADIUS = 75;
const PORTRAIT_RING_SIZE = 171;
const FULL_TAB_LABELS = {
  standard: () => illusiveDnd.ui("tabItemInteraction"),
  action: () => illusiveDnd.section("action"),
  bonus: () => illusiveDnd.ui("tabBonusShort"),
  reaction: () => illusiveDnd.section("reaction"),
  legendary: () => illusiveDnd.section("legendary"),
  lair: () => illusiveDnd.section("lair")
};

let clickBound = false;
let activityHooksBound = false;
let selectedSection = null;
let selectedTokenId = null;
let renderedSectionIds = new Set();
let renderedSectionTokenId = null;

export function positionActionBar() {
  const dock = document.getElementById("illusive-dnd-action-bar-dock");
  const hotbar = document.getElementById("hotbar");
  if (!dock || dock.hidden) {
    syncFoundryUiVisibility();
    return;
  }

  const band = getHudBand();
  const scale = computeActionBarScale(band);
  const offsetX = game.settings.get(MODULE_ID, "tokenOffsetX") ?? 0;
  const offsetY = game.settings.get(MODULE_ID, "tokenOffsetY") ?? 0;
  const portrait = isPortraitDisplay();

  syncFoundryUiVisibility();

  // Sit above Foundry's hotbar only when that bar is actually on screen.
  // A missing hotbar (tabletop hides it) keeps the chevron at the bottom edge.
  const measured = (!hotbar || isFoundryHotbarHidden()) ? null : getUiLocalRect(hotbar);
  const hotbarRect = measured && measured.width >= 1 && measured.height >= 1 ? measured : null;
  const uiH = getUiViewportSize().h;
  dock.style.bottom = hotbarRect != null
    ? `${Math.max(12, uiH - hotbarRect.top + 8 + offsetY)}px`
    : `${(portrait ? 6 : 12) + offsetY}px`;

  dock.style.left = `${Math.round(band.center + offsetX)}px`;
  dock.style.right = "auto";
  dock.style.transform = `translateX(-50%) scale(${scale})`;
  dock.style.transformOrigin = "bottom center";

  positionTokenStatuses();
  // Action-bar show/hide is the usual reason the zoom pad must move; don't wait
  // on a MutationObserver tick or the pad can sit under the bar and look gone.
  repositionCameraPad();
}

function requestPanelRefresh() {
  refreshHud(ILLUSIVE_DND_RENDER.ACTION_BAR);
}

/**
 * Movement only changes the ring and the feet readout.
 * Returns false when the bar is not on screen and a full paint is required.
 */
export function syncActionBarMovement(token) {
  const container = document.getElementById("illusive-dnd-action-bar");
  if (!container || container.hidden || !token) return false;
  const tokenId = token.id ?? token.document?.id ?? null;
  if (!tokenId || tokenId !== selectedTokenId) return false;

  const feet = container.querySelector(".illusive-dnd-mock-speed-feet");
  const ring = container.querySelector(".illusive-dnd-mock-speed-ring-fill");
  if (!feet || !ring) return false;

  const combat = inCombat(token);
  const movement = combat ? buildMovementData(token) : buildIdleMovementData(token);
  if (!movement) return false;

  const unit = feet.querySelector(".illusive-dnd-mock-speed-unit");
  const readout = combat ? `${movement.remainingFeet}/${movement.maxFeet}` : `${movement.remainingFeet}`;
  feet.replaceChildren(document.createTextNode(readout));
  if (unit) feet.append(unit);

  ring.classList.toggle("is-dashing", Boolean(movement.isDashing));
  for (const mode of movement.modes ?? []) {
    const button = container.querySelector(`.illusive-dnd-mock-speed-mode[data-mode="${mode.id}"]`);
    if (button) button.dataset.modePercent = String(mode.percent ?? 0);
  }
  animateSpeedDrain(container, buildSpeedRingData(movement));
  return true;
}

async function renderActionBarDock(dock) {
  const bar = document.getElementById("illusive-dnd-action-bar");
  if (!bar) return;

  dock.classList.add("illusive-dnd-action-bar-full-layout");

  const token = getActionBarToken() ?? null;
  // Selecting a token always reveals the bar, even if it was minimized/hidden.
  if (token && canvas?.tokens?.controlled?.length) {
    await expandActionBarForSelection(dock);
  } else {
    applyActionBarMinimized(dock);
  }

  await paintActionBarContent(bar, token);
  await renderTokenStatuses();
  dock.hidden = bar.hidden;
  const minimize = dock.querySelector(".illusive-dnd-action-bar-minimize");
  if (minimize) minimize.hidden = bar.hidden;
  syncFoundryUiVisibility();
  positionActionBar();
  applyActionBarMinimized(dock);
}

export const actionBarPanel = definePanel({
  id: "illusive-dnd-action-bar-dock",
  mask: "actionBar",
  shell: `<div id="illusive-dnd-action-bar-dock"><button type="button" class="illusive-dnd-action-bar-minimize" data-action="toggle-action-bar-minimize" aria-label="Minimize action bar" data-tooltip="Minimize action bar" hidden><i class="fas fa-chevron-down" aria-hidden="true"></i></button><div class="illusive-dnd-action-bar-motion"><div id="illusive-dnd-action-bar" hidden></div></div></div>`,
  enabled: () => settingOn("enableActionBar") && desktopHudEnabled(),
  position: positionActionBar,
  render: renderActionBarDock
});

function buildPortraitRingData(hp, showTempHp) {
  const circumference = 2 * Math.PI * PORTRAIT_RING_RADIUS;
  const hpLength = (hp.basePercent / 100) * circumference;
  const tempLength = showTempHp && hp.temp > 0 ? (hp.tempPercent / 100) * circumference : 0;
  const center = PORTRAIT_RING_SIZE / 2;

  return {
    r: PORTRAIT_RING_RADIUS,
    size: PORTRAIT_RING_SIZE,
    center,
    circumference,
    hpLength,
    hpGap: Math.max(0, circumference - hpLength),
    tempLength,
    tempGap: Math.max(0, circumference - tempLength),
    tempOffset: circumference - hpLength,
    showTemp: showTempHp && hp.temp > 0 && tempLength > 0
  };
}

function buildSpeedRingData(movement) {
  if (!movement) return null;
  const circumference = 2 * Math.PI * PORTRAIT_RING_RADIUS;
  const fillLength = (movement.percent / 100) * circumference;
  const center = PORTRAIT_RING_SIZE / 2;
  return {
    r: PORTRAIT_RING_RADIUS,
    size: PORTRAIT_RING_SIZE,
    center,
    fillLength,
    fillGap: Math.max(0, circumference - fillLength),
    percent: movement.percent,
    isDashing: Boolean(movement.isDashing)
  };
}

/** Previous / mid-animation speed visuals (DOM swaps otherwise flash and jolt). */
let lastSpeedVisual = {
  fillLength: null,
  fillGap: null,
  modes: Object.create(null)
};

function parseStrokeDasharray(value) {
  const parts = String(value ?? "")
    .split(/[,\s]+/)
    .map((part) => parseFloat(part))
    .filter((n) => Number.isFinite(n));
  if (parts.length < 2) return null;
  return { fillLength: parts[0], fillGap: parts[1] };
}

function readScaleX(el) {
  const transform = getComputedStyle(el).transform;
  if (!transform || transform === "none") return null;
  const matrix = transform.match(/matrix\(([^)]+)\)/);
  if (matrix) {
    const scale = parseFloat(matrix[1].split(",")[0]);
    return Number.isFinite(scale) ? Math.clamp(scale, 0, 1) : null;
  }
  const matrix3d = transform.match(/matrix3d\(([^)]+)\)/);
  if (matrix3d) {
    const scale = parseFloat(matrix3d[1].split(",")[0]);
    return Number.isFinite(scale) ? Math.clamp(scale, 0, 1) : null;
  }
  return null;
}

/** Capture the on-screen (possibly mid-transition) speed visuals before a re-render. */
function captureLiveSpeedVisual(container) {
  const visual = {
    fillLength: lastSpeedVisual.fillLength,
    fillGap: lastSpeedVisual.fillGap,
    modes: { ...lastSpeedVisual.modes }
  };
  if (!container) return visual;

  const fill = container.querySelector(".illusive-dnd-mock-speed-ring-fill");
  if (fill) {
    const parsed = parseStrokeDasharray(
      getComputedStyle(fill).strokeDasharray || fill.getAttribute("stroke-dasharray")
    );
    if (parsed) {
      visual.fillLength = parsed.fillLength;
      visual.fillGap = parsed.fillGap;
    }
  }

  for (const btn of container.querySelectorAll(".illusive-dnd-mock-speed-mode[data-mode]")) {
    const modeId = btn.dataset.mode;
    const bar = btn.querySelector(".illusive-dnd-mock-speed-mode-fill");
    if (!bar || !modeId) continue;
    const scale = readScaleX(bar);
    if (scale != null) visual.modes[modeId] = scale;
  }

  return visual;
}

function applySpeedVisualSeed(context, fromVisual) {
  if (context.speedRing) {
    const useFrom = fromVisual?.fillLength != null && fromVisual?.fillGap != null;
    context.speedRing.displayFillLength = useFrom ? fromVisual.fillLength : context.speedRing.fillLength;
    context.speedRing.displayFillGap = useFrom ? fromVisual.fillGap : context.speedRing.fillGap;
  }

  const modes = context.movement?.modes;
  if (!modes?.length) return;

  for (const mode of modes) {
    const next = Math.clamp(Number(mode.percent ?? 100), 0, 100) / 100;
    const from = fromVisual?.modes?.[mode.id];
    mode.displayScale = from != null ? from : next;
  }
}

/**
 * Paint already shows the live "from" seed. Ease to the new remaining values
 * on the next frames so the browser never flashes the final state first.
 */
function animateSpeedDrain(container, speedRing) {
  if (!container) return;

  const fill = container.querySelector(".illusive-dnd-mock-speed-ring-fill");
  if (fill && speedRing) {
    const nextDash = `${speedRing.fillLength} ${speedRing.fillGap}`;
    const seeded = fill.getAttribute("stroke-dasharray");
    if (seeded !== nextDash) {
      fill.style.transition = "none";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fill.style.transition = "";
          fill.setAttribute("stroke-dasharray", nextDash);
        });
      });
    }
    lastSpeedVisual.fillLength = speedRing.fillLength;
    lastSpeedVisual.fillGap = speedRing.fillGap;
  } else if (!speedRing) {
    lastSpeedVisual.fillLength = null;
    lastSpeedVisual.fillGap = null;
  }

  const nextModes = Object.create(null);
  for (const btn of container.querySelectorAll(".illusive-dnd-mock-speed-mode[data-mode]")) {
    const modeId = btn.dataset.mode;
    const bar = btn.querySelector(".illusive-dnd-mock-speed-mode-fill");
    if (!bar || !modeId) continue;

    const nextPercent = Math.clamp(Number(btn.dataset.modePercent ?? 100), 0, 100) / 100;
    const seeded = readScaleX(bar) ?? nextPercent;
    if (Math.abs(seeded - nextPercent) > 0.001) {
      bar.style.transition = "none";
      bar.style.transform = `scaleX(${seeded})`;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          bar.style.transition = "";
          bar.style.transform = `scaleX(${nextPercent})`;
        });
      });
    } else {
      bar.style.transform = `scaleX(${nextPercent})`;
    }
    nextModes[modeId] = nextPercent;
  }
  lastSpeedVisual.modes = nextModes;
}

function inCombat(token) {
  return Boolean(getViewedCombat()?.started && getCombatantForToken(token));
}

function isMyTurn(token) {
  return isTokenTurn(token);
}

function resetSectionForToken(token) {
  const tokenId = token?.id ?? null;
  if (tokenId !== selectedTokenId) {
    selectedTokenId = tokenId;
    selectedSection = null;
    lastSpeedVisual = { fillLength: null, fillGap: null, modes: Object.create(null) };
  }
}

function setReactionPrompt(actor, activities, triggerType, options) {
  if (!actor?.id || !isReactionActorForUser(actor)) return;

  startReactionPrompt(actor, activities, triggerType, options);
  selectedSection = "reaction";
  ui.notifications.info(illusiveDnd.reaction("prompt", { name: actor.name }), { localize: false });
  requestPanelRefresh();
}

function buildTargetHint(token, abilities) {
  const needsTarget = abilities.filter((ability) => ability.needsTarget);
  if (!needsTarget.length) return "";

  const count = game.user.targets?.size ?? 0;
  if (count > 0) {
    const list = buildTargetListLabel();
    return list || (count === 1 ? illusiveDnd.target("one") : illusiveDnd.target("many", { count }));
  }
  return illusiveDnd.target("none");
}

function getReactionBanner() {
  const context = getReactionContext();
  if (!context) return "";
  return illusiveDnd.reaction("banner", { trigger: context.triggerType ?? "reaction" });
}

function buildSectionData(sections, {
  actor,
  combatActive,
  economyAvailability,
  legendaryPips,
  lairPips,
  reactionCtx
}) {
  return sections.map((section) => ({
    id: section.id,
    label: section.label,
    tabLabel: FULL_TAB_LABELS[section.id]?.() ?? section.label,
    key: ECONOMY_KEYS[section.id] ?? section.label.charAt(0),
    abilities: section.abilities,
    available: combatActive
      ? (section.id === "standard"
        ? (economyAvailability.action ?? true)
        : (economyAvailability[section.id] ?? true))
      : true,
    isSelected: false,
    legendaryRemaining: section.id === "legendary" ? legendaryPips?.remaining : null,
    lairRemaining: section.id === "lair" ? lairPips?.remaining : null,
    reactionPrompt: section.id === "reaction" && reactionCtx?.actorId === actor.id
  }));
}

/** Reconciles the module-level selectedSection against what's on screen (dropping a stale
 *  selection, defaulting to Action when available), flags the chosen entry, and returns it. */
function resolveSelectedSection(sectionData) {
  if (selectedSection && !sectionData.some((section) => section.id === selectedSection)) {
    selectedSection = null;
  }
  if (sectionData.length && !selectedSection) {
    selectedSection = sectionData.some((section) => section.id === "action")
      ? "action"
      : sectionData[0].id;
  }

  for (const section of sectionData) section.isSelected = section.id === selectedSection;
  return sectionData.find((section) => section.id === selectedSection) ?? null;
}

/** Portrait member data + HP ring geometry for the full layout. */
function buildFullMember(token, { showResourceBar, showTempHp }) {
  const member = buildMemberData(token);
  if (!showResourceBar) member.resource = null;
  return { member, rings: buildPortraitRingData(member.hp, showTempHp) };
}

function pipPoint(angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const center = PORTRAIT_RING_SIZE / 2;
  return {
    cx: Number((center + PORTRAIT_RING_RADIUS * Math.cos(rad)).toFixed(2)),
    cy: Number((center + PORTRAIT_RING_RADIUS * Math.sin(rad)).toFixed(2))
  };
}

function buildDeathSavePips(deathSaves) {
  if (!deathSaves) return null;

  // Top arc = successes, bottom arc = failures (SVG angles: 0° right, clockwise-down positive y).
  // Spread ±28° from the poles (tighter cluster on the ring).
  const successAngles = [-118, -90, -62];
  const failureAngles = [62, 90, 118];

  return {
    successes: successAngles.map((angle, index) => ({
      ...pipPoint(angle),
      index,
      filled: index < (deathSaves.success ?? 0)
    })),
    failures: failureAngles.map((angle, index) => ({
      ...pipPoint(angle),
      index,
      filled: index < (deathSaves.failure ?? 0)
    }))
  };
}

function applyDeathSaveFields(member, token) {
  member.isDeathSaving = isPartyDeathSaving(token);
  member.isDefeated = isPartyDefeated(token);
  member.isStabilized = isPartyStabilized(token);
  member.vitalityIcon = buildVitalityIcon(member);
  member.deathSaves = member.isDeathSaving ? getDeathSaves(token.actor) : null;
  member.deathSavePips = buildDeathSavePips(member.deathSaves);
  member.canRollDeathSave = Boolean(member.isDeathSaving && token?.actor?.isOwner);
  return member;
}

function canUserManageCombatants(combat = getViewedCombat() ?? game.combat) {
  if (game.user?.isGM) return true;
  if (!combat) {
    if (typeof Combat?.canUserCreate === "function") return Combat.canUserCreate(game.user);
    return Boolean(game.user?.can?.("COMBAT_CREATE"));
  }
  if (typeof combat.canUserModify === "function") return combat.canUserModify(game.user, "update");
  return Boolean(combat.testUserPermission?.(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3));
}

function buildEnterCombatButtonState(canJoin) {
  if (!canJoin) {
    return {
      label: illusiveDnd.actionBar("enterCombat"),
      shortLabel: illusiveDnd.actionBar("enterCombatShort"),
      icon: "fa-swords",
      disabled: true,
      waiting: false,
      tone: "enter",
      tipDetail: illusiveDnd.actionBar("tipEnterCombatNoPermission")
    };
  }
  return {
    label: illusiveDnd.actionBar("enterCombat"),
    shortLabel: illusiveDnd.actionBar("enterCombatShort"),
    icon: "fa-swords",
    disabled: false,
    waiting: false,
    tone: "enter",
    tipDetail: illusiveDnd.actionBar("tipCombatReady")
  };
}

function buildCombatButtonState(token, combatStarted, combatActive) {
  const inEncounter = Boolean(findCombatantForToken(token));
  const canJoin = canUserManageCombatants();

  if (!combatStarted) {
    if (inEncounter) {
      return {
        label: illusiveDnd.actionBar("waitingForCombat"),
        shortLabel: illusiveDnd.actionBar("waitingForCombatShort"),
        icon: "fa-hourglass-half",
        disabled: true,
        waiting: true,
        tone: "wait",
        tipDetail: illusiveDnd.actionBar("tipCombatDisabled")
      };
    }
    return buildEnterCombatButtonState(canJoin);
  }

  if (!combatActive) {
    if (inEncounter) {
      return {
        label: illusiveDnd.actionBar("waitingForCombat"),
        shortLabel: illusiveDnd.actionBar("waitingForCombatShort"),
        icon: "fa-hourglass-half",
        disabled: true,
        waiting: true,
        tone: "wait",
        tipDetail: illusiveDnd.actionBar("tipCombatDisabled")
      };
    }
    return buildEnterCombatButtonState(canJoin);
  }

  const myTurn = isMyTurn(token);
  return {
    label: myTurn ? illusiveDnd.turn("end") : illusiveDnd.actionBar("waitingForTurn"),
    shortLabel: myTurn ? illusiveDnd.turn("endShort") : illusiveDnd.actionBar("waitingForTurnShort"),
    icon: myTurn ? "fa-forward-step" : "fa-hourglass-half",
    disabled: !myTurn,
    waiting: !myTurn,
    tone: myTurn ? "end" : "wait",
    tipDetail: myTurn ? illusiveDnd.actionBar("tipCombatReady") : illusiveDnd.actionBar("tipCombatDisabled")
  };
}

function buildEconomyMap(token, inCombat = false) {
  const actor = token?.actor;
  const available = { action: true, bonus: true, reaction: true };
  if (inCombat) {
    for (const entry of buildEconomyPips(token)) {
      available[entry.id] = entry.available !== false;
    }
  } else if (actor) {
    // Still reflect manual / module spent state out of combat when flags are set.
    const live = getEconomyAvailability(actor);
    available.action = live.action;
    available.bonus = live.bonus;
    available.reaction = live.reaction;
  }
  return {
    ...available,
    itemsSpent: isItemsEconomySpent(actor),
    actionSpent: !available.action,
    bonusSpent: !available.bonus,
    reactionSpent: !available.reaction
  };
}

function buildActionBarLabels() {
  return {
    movementRemaining: illusiveDnd.movement("remaining"),
    movementDashing: illusiveDnd.movement("dashing"),
    movementMode: illusiveDnd.movement("mode"),
    movementGestalt: illusiveDnd.movement("gestalt"),
    reactionPass: illusiveDnd.reaction("pass"),
    gameLog: illusiveDnd.actionBar("gameLog"),
    notInCombat: illusiveDnd.empty("notInCombat"),
    actionEconomy: illusiveDnd.ui("actionEconomy"),
    openSheet: illusiveDnd.ui("openSheet"),
    showLocation: illusiveDnd.ui("showLocation"),
    configure: illusiveDnd.actionBar("configureToken"),
    tabIconSheet: illusiveDnd.ui("tabIconSheet"),
    armorClass: illusiveDnd.ui("armorClass"),
    walkSpeed: illusiveDnd.ui("walkSpeed"),
    currentHp: illusiveDnd.ui("currentHp"),
    items: illusiveDnd.ui("tabItemInteraction"),
    action: illusiveDnd.section("action"),
    bonus: illusiveDnd.section("bonus"),
    reaction: illusiveDnd.section("reaction"),
    legendary: illusiveDnd.section("legendary"),
    lair: illusiveDnd.section("lair"),
    legendaryResistance: illusiveDnd.actionBar("legendaryResistance"),
    utilities: illusiveDnd.actionBar("utilities"),
    vitals: illusiveDnd.actionBar("vitals"),
    passiveScores: illusiveDnd.actionBar("passiveScores"),
    toggleLight: illusiveDnd.actionBar("toggleLight"),
    toggleAura: illusiveDnd.actionBar("toggleAura"),
    rolls: illusiveDnd.actionBar("rolls"),
    toggleMovement: illusiveDnd.actionBar("toggleMovement"),
    assignStatus: illusiveDnd.actionBar("assignStatus"),
    toggleVisibility: illusiveDnd.actionBar("toggleVisibility"),
    flipToken: illusiveDnd.actionBar("flipToken"),
    elevation: illusiveDnd.actionBar("elevation"),
    elevationUp: illusiveDnd.actionBar("elevationUp"),
    elevationDown: illusiveDnd.actionBar("elevationDown"),
    tempHp: illusiveDnd.ui("tempHp"),
    targetPickCanvasHint: illusiveDnd.actionBar("targetPickCanvasHint"),
    resources: illusiveDnd.actionBar("resources")
  };
}

function buildMovementTitle(movement) {
  if (!movement) return "";
  return movement.modeLabel || illusiveDnd.movement("remaining");
}

function formatMovementFeet(left, max) {
  if (!Number.isFinite(left)) return "";
  if (!Number.isFinite(max)) return `${left} ft`;
  return `${left} / ${max}`;
}

function buildMovementTipDetail(movement, inCombat) {
  if (!movement) return "";
  const lines = [];
  const modes = movement.modes?.length ? movement.modes : null;
  if (modes) {
    for (const mode of modes) {
      const left = inCombat ? mode.remaining : mode.max;
      const feet = formatMovementFeet(left, mode.max);
      lines.push(feet ? `${mode.label}  ${feet}` : mode.label);
    }
  } else {
    const left = inCombat ? movement.remainingFeet : (movement.poolMax ?? movement.maxFeet);
    const max = inCombat ? movement.maxFeet : (movement.poolMax ?? movement.maxFeet);
    const feet = formatMovementFeet(left, max);
    const label = movement.modeLabel;
    if (label && feet) lines.push(`${label}  ${feet}`);
    else if (feet) lines.push(feet);
    else if (label) lines.push(label);
  }
  if (movement.isDashing) lines.push(illusiveDnd.movement("dashing"));
  return lines.join("\n");
}

async function buildAbilitiesHtml(token, actor, combatActive, activeSection) {
  if (!activeSection) {
    return `<p class="illusive-dnd-action-empty illusive-dnd-mock-ability-empty">${illusiveDnd.empty("noAbilities", { section: illusiveDnd.ui("actionEconomy") })}</p>`;
  }

  const abilityGroups = buildAbilityGroups(
    activeSection.abilities,
    actor,
    activeSection.id
  );

  return illusiveDndRenderTemplate(ABILITIES_TEMPLATE, {
    abilityGroups,
    selectedSection: activeSection.id,
    emptyLabel: combatActive
      ? illusiveDnd.empty("noAbilities", { section: activeSection.label })
      : illusiveDnd.empty("noAbilitiesOoc", { section: activeSection.tabLabel ?? activeSection.label })
  });
}

function buildGemTip(label, available, inCombat) {
  const detail = [
    illusiveDnd.actionBar("tipGemFilter", { section: label }),
    !inCombat
      ? null
      : (available ? illusiveDnd.actionBar("tipGemAvailable") : illusiveDnd.actionBar("tipGemSpent"))
  ].filter(Boolean).join(" ");

  return { title: label, detail };
}

function formatTraitBlock(title, values) {
  if (!values?.length) return "";
  return [`**${title}`, ...values].join("\n");
}

function buildUiTips({ labels, inCombat, economy, economySelected, visionSummary, member, movement, movementTitle, utilityRestLabel, restDisabled, showLeaveCombat, combatButton, legendary, lair, resistance, defenseTraits, languageSummary }) {
  const hpLine = member?.hp
    ? illusiveDnd.actionBar("tipHpDetail", {
      current: member.hp.value,
      temp: member.hp.temp ?? 0,
      max: member.hp.max
    })
    : "";

  return {
    gemItems: buildGemTip(labels.items, true, inCombat),
    gemAction: buildGemTip(labels.action, economy.action, inCombat),
    gemBonus: buildGemTip(labels.bonus, economy.bonus, inCombat),
    gemReaction: buildGemTip(labels.reaction, economy.reaction, inCombat),
    gemLegendary: legendary
      ? {
        title: labels.legendary,
        detail: [
          illusiveDnd.actionBar("tipGemFilter", { section: labels.legendary }),
          illusiveDnd.actionBar("tipLegendaryDetail", {
            remaining: legendary.remaining,
            max: legendary.max
          })
        ].filter(Boolean).join(" ")
      }
      : null,
    gemLair: lair
      ? {
        title: labels.lair,
        detail: [
          illusiveDnd.actionBar("tipGemFilter", { section: labels.lair }),
          illusiveDnd.actionBar("tipLairDetail", {
            remaining: lair.remaining,
            max: lair.max
          })
        ].filter(Boolean).join(" ")
      }
      : null,
    gemResistance: resistance
      ? {
        title: labels.legendaryResistance,
        detail: illusiveDnd.actionBar("tipResistanceDetail", { remaining: resistance.remaining })
      }
      : null,
    sheet: {
      title: labels.openSheet,
      detail: illusiveDnd.actionBar("tipSheetDetail")
    },
    configure: {
      title: labels.configure,
      detail: illusiveDnd.actionBar("tipConfigureDetail")
    },
    light: {
      title: labels.toggleLight,
      detail: illusiveDnd.actionBar("tipLightDetail")
    },
    aura: {
      title: labels.toggleAura,
      detail: illusiveDnd.actionBar("tipAuraDetail")
    },
    rolls: {
      title: labels.rolls,
      detail: illusiveDnd.actionBar("tipRollsDetail")
    },
    movementUtil: {
      title: movement?.modeLabel || labels.toggleMovement,
      detail: illusiveDnd.actionBar("tipMovementUtilDetail")
    },
    status: {
      title: labels.assignStatus,
      detail: ""
    },
    visibility: {
      title: labels.toggleVisibility,
      detail: illusiveDnd.actionBar("tipVisibilityDetail")
    },
    flip: {
      title: labels.flipToken,
      detail: illusiveDnd.actionBar("tipFlipDetail")
    },
    elevation: {
      title: labels.elevation,
      detail: illusiveDnd.actionBar("tipElevationDetail")
    },
    rest: {
      title: utilityRestLabel,
      detail: showLeaveCombat
        ? illusiveDnd.actionBar("tipLeaveCombatDetail")
        : restDisabled
          ? illusiveDnd.actionBar("restDuringCombat")
          : illusiveDnd.actionBar("restPrompt")
    },
    combat: {
      title: combatButton.label,
      detail: combatButton.tipDetail
        ?? (combatButton.disabled ? illusiveDnd.actionBar("tipCombatDisabled") : illusiveDnd.actionBar("tipCombatReady"))
    },
    hp: {
      title: labels.currentHp,
      detail: hpLine
    },
    deathSave: {
      title: illusiveDnd.ui("deathSaves"),
      detail: member?.deathSaves
        ? illusiveDnd.actionBar("tipDeathSaveDetail", {
          success: member.deathSaves.success ?? 0,
          failure: member.deathSaves.failure ?? 0
        })
        : illusiveDnd.actionBar("rollDeathSave")
    },
    ac: {
      title: labels.armorClass,
      detail: [
        member?.stats?.ac != null ? illusiveDnd.actionBar("tipAcDetail", { ac: member.stats.ac }) : "",
        formatTraitBlock(illusiveDnd.actionBar("immunities"), defenseTraits?.immunities),
        formatTraitBlock(illusiveDnd.actionBar("resistances"), defenseTraits?.resistances)
      ].filter(Boolean).join("\n")
    },
    languages: {
      title: illusiveDnd.actionBar("languages"),
      detail: languageSummary || illusiveDnd.actionBar("languagesNone")
    },
    tempHp: {
      title: labels.tempHp,
      detail: member?.hp?.temp
        ? illusiveDnd.actionBar("tipTempHpDetail", { temp: member.hp.temp })
        : ""
    },
    movement: {
      title: movementTitle || labels.movementRemaining,
      detail: buildMovementTipDetail(movement, inCombat)
    },
    gameLog: {
      title: illusiveDnd.actionBar("gameLog"),
      detail: inCombat
        ? illusiveDnd.actionBar("gameLogHint")
        : illusiveDnd.actionBar("gameLogCombatOnly")
    },
    passivesGroup: {
      title: labels.passiveScores,
      detail: visionSummary || illusiveDnd.actionBar("tipPassivesDetail")
    }
  };
}

function enrichPassives(passives, visionSummary) {
  const skillNames = {
    prc: illusiveDnd.actionBar("tipPassivePrc"),
    ins: illusiveDnd.actionBar("tipPassiveIns"),
    inv: illusiveDnd.actionBar("tipPassiveInv")
  };
  const icons = {
    prc: "fa-eye",
    ins: "fa-brain",
    inv: "fa-magnifying-glass"
  };

  return passives.map((entry) => ({
    ...entry,
    icon: icons[entry.id] ?? "fa-circle-question",
    tipTitle: `${skillNames[entry.id] ?? entry.label ?? entry.short} ${entry.value}`,
    tipDetail: entry.id === "prc" ? (visionSummary || "") : ""
  }));
}

async function buildActionBarContext(token) {
  if (!token?.actor) return { showPanel: false };

  const actor = token.actor;
  const combatStarted = Boolean(getViewedCombat()?.started);
  const combatActive = combatStarted && Boolean(getCombatantForToken(token));
  const reactionCtx = getReactionContext();
  const legendaryPips = buildLegendaryPips(actor);
  const lairPips = buildLairPips(actor);
  const resistance = buildLegendaryResistance(actor);
  const showTempHp = settingOn("showTokenTempHp");
  const { member, rings } = buildFullMember(token, {
    showResourceBar: settingOn("showResourceBar"),
    showTempHp
  });

  applyDeathSaveFields(member, token);

  // Always keep A/B/R sections selectable (even when empty) so gems show an empty state.
  const sections = buildCombatToolbarSections(actor, { inCombat: combatActive, token });

  const economyAvailability = getEconomyAvailability(actor);
  const sectionData = buildSectionData(sections, {
    actor,
    combatActive,
    economyAvailability,
    legendaryPips,
    lairPips,
    reactionCtx
  });
  const activeSection = resolveSelectedSection(sectionData);
  renderedSectionIds = new Set(sectionData.map((section) => section.id));
  renderedSectionTokenId = token.id;

  const economy = buildEconomyMap(token, combatActive);
  const selected = selectedSection ?? "";
  const movement = combatActive ? buildMovementData(token) : buildIdleMovementData(token);
  const speedRing = buildSpeedRingData(movement);
  const abilitiesHtml = await buildAbilitiesHtml(token, actor, combatActive, activeSection);
  const labels = buildActionBarLabels();
  const combatButton = buildCombatButtonState(token, combatStarted, combatActive);
  // Leave Combat as soon as this token is on the initiative list (even before Start Combat).
  const showLeaveCombat = Boolean(findCombatantForToken(token));
  const utilityRestLabel = showLeaveCombat ? illusiveDnd.actionBar("leaveCombat") : illusiveDnd.actionBar("rest");
  const restDisabled = combatStarted && !showLeaveCombat;
  const movementTitle = buildMovementTitle(movement);
  const configureDisabled = !canOpenTokenConfig(token);
  const visibilityDisabled = !game.user?.isGM;
  const lightOn = isTokenLightOn(token);
  const auraOn = isTokenAuraOn(token);
  const resources = settingOn("showActionResourceStrip")
    ? buildActionBarResources(actor)
    : [];

  const economySelected = {
    standard: selected === "standard",
    action: selected === "action",
    bonus: selected === "bonus",
    reaction: selected === "reaction",
    legendary: selected === "legendary",
    lair: selected === "lair"
  };
  const visionSummary = buildVisionSummary(token);
  const languageSummary = buildLanguageSummary(actor);
  const languageCount = languageSummary
    ? languageSummary.split(/\s*,\s*/).filter(Boolean).length
    : 0;
  const tips = buildUiTips({
    labels,
    inCombat: combatActive,
    economy,
    economySelected,
    visionSummary,
    member,
    movement,
    movementTitle,
    utilityRestLabel,
    restDisabled,
    showLeaveCombat,
    combatButton,
    legendary: legendaryPips,
    lair: lairPips,
    resistance,
    defenseTraits: buildDefenseTraits(actor),
    languageSummary
  });
  const targetPick = buildTargetPickView();

  // Keep the combat game-log stack armed whenever a combat is started.
  setGameLogCombatActive(combatStarted);
  const gameLog = getGameLogView();

  return {
    showPanel: true,
    inCombat: combatActive,
    combatStarted,
    gameLog,
    restDisabled,
    showLeaveCombat,
    configureDisabled,
    visibilityDisabled,
    lightOn,
    auraOn,
    tokenFlipped: isTokenFlipped(token),
    elevation: getTokenElevation(token),
    resources,
    member,
    rings,
    showTempHp,
    showStatChips: settingOn("showTokenAcSpeed"),
    showYourTurn: settingOn("showYourTurnBanner") && isMyTurn(token),
    showResourceLabel: settingOn("showResourceLabel"),
    colorHpBar: settingOn("colorHpBarByHealth"),
    economy,
    economySelected,
    targetPick,
    selectedSection: selected,
    sectionTitle: activeSection?.tabLabel ?? activeSection?.label ?? "",
    showItemsGem: true,
    showLegendaryGem: Boolean(legendaryPips),
    showLairGem: Boolean(lairPips),
    showResistanceGem: Boolean(resistance),
    resistance: resistance ?? { remaining: 0, max: 0 },
    abilitiesHtml,
    passives: enrichPassives(buildPassiveScores(actor), visionSummary),
    languageCount,
    visionSummary,
    feetUnit: illusiveDnd.actionBar("auraFeetUnit"),
    tips,
    legendary: legendaryPips ?? { remaining: 0, max: 0 },
    lair: lairPips ?? { remaining: 0, max: 0 },
    combatButton,
    utilityRestLabel,
    reactionBanner: getReactionBanner(),
    showReactionPass: Boolean(reactionCtx?.actorId === actor.id),
    reactionGemPrompt: Boolean(reactionCtx?.actorId === actor.id),
    movement,
    speedRing,
    movementTitle,
    labels,
    deathSavesLabel: illusiveDnd.ui("deathSaves"),
    stabilizedLabel: illusiveDnd.ui("stabilized")
  };
}

async function paintActionBarContent(container, token) {
  if (!container) return;

  if (!settingOn("enableActionBar") || !token?.actor) {
    container.replaceChildren();
    container.hidden = true;
    syncFoundryUiVisibility();
    return;
  }

  const sameToken = (token?.id ?? null) === selectedTokenId;
  const fromSpeedVisual = sameToken
    ? captureLiveSpeedVisual(container)
    : { fillLength: null, fillGap: null, modes: Object.create(null) };
  resetSectionForToken(token);
  const context = await buildActionBarContext(token);
  if (!context.showPanel) {
    container.replaceChildren();
    container.hidden = true;
    syncFoundryUiVisibility();
    lastSpeedVisual = { fillLength: null, fillGap: null, modes: Object.create(null) };
    return;
  }

  applySpeedVisualSeed(context, fromSpeedVisual);

  closeUtilDropdownUnlessStatus();
  hideActionBarUiTooltip();

  const abilityScroll = document.querySelector("#illusive-dnd-action-bar .illusive-dnd-mock-ability-well .illusive-dnd-ability-groups")?.scrollTop ?? 0;
  const previousSection = document.querySelector("#illusive-dnd-action-bar .illusive-dnd-ability-groups")?.dataset.section ?? "";

  container.innerHTML = await illusiveDndRenderTemplate(
    `${MODULE_PATH}/src/hud/components/action-bar/action-bar-full.hbs`,
    context
  );
  container.hidden = false;
  container.removeAttribute("hidden");
  relinkStatusDropdownAnchor(container);
  const barPortrait = container.querySelector(".illusive-dnd-mock-portrait, .illusive-dnd-full-portrait, .illusive-dnd-ornate-portrait");
  if (barPortrait instanceof HTMLImageElement && token?.actor) {
    applyActorPortrait(barPortrait, token.actor, {
      alt: context.member?.name || "",
      fallbackSrc: context.member?.img || ""
    });
  }
  bindAbilityTooltips(container, token);
  bindActionBarUiTooltips();
  syncFoundryUiVisibility();
  animateSpeedDrain(container, context.speedRing);

  const nextGroups = container.querySelector(".illusive-dnd-mock-ability-well .illusive-dnd-ability-groups");
  if (nextGroups && previousSection && previousSection === nextGroups.dataset.section) {
    nextGroups.scrollTop = abilityScroll;
  }
}

function onEconomySelect(sectionId) {
  selectedSection = sectionId;
  requestPanelRefresh();
}

async function spendOrRestoreResistance(token, delta) {
  if (!token?.actor) return false;
  const changed = await adjustLegendaryResistance(token.actor, delta);
  if (changed) requestPanelRefresh();
  return changed;
}

async function onEconomyContextMenu(event) {
  const dock = document.getElementById("illusive-dnd-action-bar-dock");
  if (!dock?.contains(event.target)) return;

  if (handlePortraitHpContextMenu(event)) return;

  const resistanceGem = event.target.closest("#illusive-dnd-action-bar [data-action='legendary-resistance']");
  if (resistanceGem) {
    event.preventDefault();
    event.stopPropagation();
    await spendOrRestoreResistance(getActionBarToken(), 1);
    return;
  }

  const gem = event.target.closest("#illusive-dnd-action-bar .illusive-dnd-mock-gem[data-economy]");
  if (!gem) return;

  event.preventDefault();
  event.stopPropagation();

  const token = getActionBarToken();
  if (!token?.actor) return;

  await toggleEconomySpentDropdown(gem, token, gem.dataset.economy, {
    x: event.clientX,
    y: event.clientY
  });
}

/** Click pip N: fill through N, or clear back to N-1 if that pip is already the highest filled. */
async function onDeathSavePip(token, pipType, pipIndex) {
  const actor = token?.actor;
  if (!actor || !isPartyDeathSaving(token)) return false;
  if (!actor.isOwner) {
    ui.notifications.warn(illusiveDnd.warning("noOwner"));
    return false;
  }
  return toggleDeathSavePip(actor, pipType, pipIndex);
}

async function rollDeathSaveFromHud(token, event) {
  const actor = token?.actor;
  if (!actor || !isPartyDeathSaving(token)) return false;
  if (!actor.isOwner) {
    ui.notifications.warn(illusiveDnd.warning("noOwner"));
    return false;
  }
  if (typeof actor.rollDeathSave !== "function") {
    ui.notifications.warn(illusiveDnd.actionBar("rollDeathSave"));
    return false;
  }

  // Match the character sheet: pass the click event. Force a public roll so
  // players see chat + Dice So Nice (GM clients often default to gmroll/blind).
  const publicMode = CONST.DICE_ROLL_MODES?.PUBLIC ?? "publicroll";
  const rolls = await actor.rollDeathSave(
    { event, legacy: false },
    {},
    { rollMode: publicMode }
  );
  return Boolean(rolls?.length);
}

/** Suppress the click that follows a handled pointerup (avoids double warns). */
let swallowNextTargetPickClick = false;

async function handleTargetPickAction(event) {
  if (event.type === "click" && swallowNextTargetPickClick) {
    swallowNextTargetPickClick = false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  const cancelPick = event.target.closest("#illusive-dnd-action-bar [data-action='target-pick-cancel']");
  if (cancelPick) {
    event.preventDefault();
    event.stopPropagation();
    cancelTargetPick();
    if (event.type === "pointerup") swallowNextTargetPickClick = true;
    return true;
  }

  const confirmPick = event.target.closest("#illusive-dnd-action-bar [data-action='target-pick-confirm']");
  if (confirmPick && !confirmPick.disabled) {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "pointerup") swallowNextTargetPickClick = true;
    await finishTargetPickAndUse();
    return true;
  }

  return false;
}

async function onActionBarClick(event) {
  const dock = document.getElementById("illusive-dnd-action-bar-dock");
  if (!dock?.contains(event.target)) return;

  const minimizeBtn = event.target.closest("[data-action='toggle-action-bar-minimize']");
  if (minimizeBtn) {
    event.preventDefault();
    event.stopPropagation();
    await toggleActionBarMinimized(dock);
    return;
  }

  const panel = document.getElementById("illusive-dnd-action-bar");
  if (!panel?.contains(event.target)) return;

  const token = getActionBarToken();

  if (await handleTargetPickAction(event)) return;

  const deathSavePip = event.target.closest("#illusive-dnd-action-bar [data-action='death-save-pip']");
  if (deathSavePip) {
    event.preventDefault();
    event.stopPropagation();
    if (
      token
      && await onDeathSavePip(token, deathSavePip.dataset.pipType, deathSavePip.dataset.pipIndex)
    ) {
      requestPanelRefresh();
    }
    return;
  }

  const deathSaveBtn = event.target.closest("#illusive-dnd-action-bar [data-action='death-save']");
  if (deathSaveBtn) {
    event.preventDefault();
    event.stopPropagation();
    if (token && await rollDeathSaveFromHud(token, event)) requestPanelRefresh();
    return;
  }

  const resistanceGem = event.target.closest("#illusive-dnd-action-bar [data-action='legendary-resistance']");
  if (resistanceGem) {
    event.preventDefault();
    event.stopPropagation();
    if (token) await spendOrRestoreResistance(token, -1);
    return;
  }

  if (event.target.closest("#illusive-dnd-action-bar .illusive-dnd-reaction-pass-btn")) {
    event.preventDefault();
    event.stopPropagation();
    passReaction();
    requestPanelRefresh();
    return;
  }

  const elevationBtn = event.target.closest("#illusive-dnd-action-bar [data-action='elevation-up'], #illusive-dnd-action-bar [data-action='elevation-down']");
  if (elevationBtn) {
    event.preventDefault();
    event.stopPropagation();
    if (!token) return;
    const down = elevationBtn.dataset.action === "elevation-down";
    if (await nudgeTokenElevation(token, down ? -1 : 1)) requestPanelRefresh();
    return;
  }

  const combatBtn = event.target.closest("#illusive-dnd-action-bar [data-action='combat-flow']");
  if (combatBtn) {
    event.preventDefault();
    event.stopPropagation();
    if (combatBtn.classList.contains("is-disabled") || combatBtn.getAttribute("aria-disabled") === "true") return;
    if (token && await handleCombatFlowButton(token)) requestPanelRefresh();
    return;
  }

  const modeBtn = event.target.closest("#illusive-dnd-action-bar .illusive-dnd-movement-mode-btn");
  if (modeBtn) {
    event.preventDefault();
    event.stopPropagation();
    if (token) await setMovementMode(token, modeBtn.dataset.mode);
    requestPanelRefresh();
    return;
  }

  const utilBtn = event.target.closest("#illusive-dnd-action-bar [data-util]");
  if (utilBtn) {
    event.preventDefault();
    event.stopPropagation();
    if (!token || utilBtn.disabled || utilBtn.classList.contains("is-disabled") || utilBtn.getAttribute("aria-disabled") === "true") return;

    const util = utilBtn.dataset.util;
    if (util === "movement") {
      await toggleMovementDropdown(utilBtn, token);
      return;
    }
    if (util === "status") {
      await toggleStatusDropdown(utilBtn, token);
      return;
    }
    if (util === "game-log") {
      await toggleGameLogDropdown(utilBtn, token);
      return;
    }
    if (util === "light") {
      await toggleLightDropdown(utilBtn, token);
      return;
    }
    if (util === "aura") {
      await toggleAuraDropdown(utilBtn, token);
      return;
    }
    if (util === "rolls") {
      await toggleRollsDropdown(utilBtn, token);
      return;
    }

    if (await handleUtilityButton(util, token)) requestPanelRefresh();
    return;
  }

  const dropConcentrationBtn = event.target.closest("#illusive-dnd-action-bar .illusive-dnd-drop-concentration-btn");
  if (dropConcentrationBtn) {
    event.preventDefault();
    event.stopPropagation();
    if (token && await dropConcentrationFromHud(token)) requestPanelRefresh();
    return;
  }

  const economyChip = event.target.closest("#illusive-dnd-action-bar .illusive-dnd-mock-gem[data-economy]");
  if (economyChip) {
    event.preventDefault();
    event.stopPropagation();
    onEconomySelect(economyChip.dataset.economy);
    return;
  }

  const button = event.target.closest("#illusive-dnd-action-bar .illusive-dnd-ability-btn");
  if (!button || button.dataset.disabled === "true") return;

  event.preventDefault();
  event.stopPropagation();

  if (!token?.actor) return;

  try {
    const plan = await planAndUseAbility({
      token,
      itemId: button.dataset.itemId,
      activityId: button.dataset.activityId || "",
      section: button.dataset.section,
      activationType: button.dataset.activationType || "",
      isStandard: button.dataset.standard === "true",
      event,
      abilityName: button.dataset.name || button.getAttribute("aria-label") || "Ability",
      pickCastSlotLevel
    });

    if (!plan.ok) {
      if (plan.notify) ui.notifications.warn(plan.notify);
      return;
    }
    if (plan.action === "pick-targets") {
      await startTargetPick(plan.pick);
      return;
    }
    if (!plan.result) return;
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to use ability`, error);
    return;
  }

  requestPanelRefresh();
}

let targetPickConfirmInFlight = false;

async function finishTargetPickAndUse() {
  if (targetPickConfirmInFlight) return;
  targetPickConfirmInFlight = true;
  try {
  // Validate only — stay in pick mode until the use succeeds so Cancel still
  // works after range / cover / economy warnings.
  const pending = confirmTargetPick();
  if (!pending) return;

  const token = getActionBarToken();
  if (!token?.actor || token.id !== pending.tokenId) {
    ui.notifications.warn(illusiveDnd.empty("notInCombat"));
    cancelTargetPick({ clearTargets: false });
    return;
  }

  let used = false;
  try {
    used = await fireAfterTargetPick({ token, pending });
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to use ability after target pick`, error);
    used = false;
  }

  if (!used) return;

  cancelTargetPick({ clearTargets: false });
  requestTokenRefresh();
  } finally {
    targetPickConfirmInFlight = false;
  }
}

function onActionBarDoubleClick(event) {
  const panel = document.getElementById("illusive-dnd-action-bar");
  if (!panel?.contains(event.target)) return;

  const portrait = event.target.closest("#illusive-dnd-action-bar .illusive-dnd-mock-portrait-block");
  if (!portrait) return;

  event.preventDefault();
  event.stopPropagation();

  const token = getActionBarToken();
  if (!token?.isVisible) return;

  panCanvasToToken(token);
}

function bindActionBarClicks() {
  if (clickBound) return;
  document.body.addEventListener("click", onActionBarClick, true);
  document.body.addEventListener("pointerup", onActionBarPointerUp, true);
  document.body.addEventListener("dblclick", onActionBarDoubleClick, true);
  document.body.addEventListener("contextmenu", onEconomyContextMenu, true);
  clickBound = true;
}

async function onActionBarPointerUp(event) {
  if (!isTargetPickActive() || event.button !== 0) return;

  const dock = document.getElementById("illusive-dnd-action-bar-dock");
  if (!dock?.contains(event.target)) return;

  const panel = document.getElementById("illusive-dnd-action-bar");
  if (!panel?.contains(event.target)) return;

  await handleTargetPickAction(event);
}

let deathSaveHooksBound = false;

function bindDeathSaveHooks() {
  if (deathSaveHooksBound) return;

  const stampStable = (details) => {
    if (!details) return;
    // dnd5e 6 reports `outcome`; 5.x reported `chatString`.
    const stable = details.outcome === "stable" || details.chatString === "DND5E.DeathSaveSuccess";
    const revived = details.outcome === "revive" || details.chatString === "DND5E.DeathSaveCriticalSuccess";
    if (!stable && !revived) return;
    details.updates = details.updates ?? {};
    details.updates[`flags.${MODULE_ID}.stable`] = stable;
  };

  // dnd5e fires rollDeathSave and rollDeathSaveV2 with the same (rolls, details); one listener is enough.
  Hooks.on("dnd5e.rollDeathSaveV2", (_rolls, details) => stampStable(details));

  Hooks.on("dnd5e.postRollDeathSave", async (_rolls, data) => {
    const actor = data?.subject;
    if (!actor) return;
    const hp = actor.system?.attributes?.hp?.value ?? 0;
    if (hp > 0) {
      await syncActorStableFlag(actor);
      requestPanelRefresh();
      return;
    }

    // Fallback: after a stabilize roll, counters are cleared to 0/0 — set the flag if missing.
    const content = String(data?.message?.content ?? "");
    const chatKey = data?.chatString ?? data?.details?.chatString ?? "";
    const stableText = game.i18n?.format?.("DND5E.DeathSaveSuccess", { name: actor.name }) ?? "";
    const looksStable = Boolean(
      chatKey === "DND5E.DeathSaveSuccess"
      || (
        content
        && (
          (stableText && content.includes(stableText))
          || /stable/i.test(content)
          || content.includes(game.i18n?.localize?.("DND5E.DeathSaveSuccess") ?? "\0")
        )
      )
    );
    if (looksStable) await ensureActorStableFlag(actor);

    await syncActorStableFlag(actor);
    requestPanelRefresh();
  });

  Hooks.on("updateActor", async (actor, changes) => {
    if (!actor) return;
    const hpChanged = foundry.utils.hasProperty(changes, "system.attributes.hp");
    const deathChanged = foundry.utils.hasProperty(changes, "system.attributes.death");
    const flagChanged = foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`);
    if (!hpChanged && !deathChanged && !flagChanged) return;

    // Manual / sheet path: reaching 3 successes before dnd5e clears them.
    const nextSuccess = foundry.utils.getProperty(changes, "system.attributes.death.success");
    if (Number(nextSuccess) >= 3) {
      await markActorStable(actor);
      requestPanelRefresh();
      return;
    }

    await syncActorStableFlag(actor);
    if (flagChanged || deathChanged || hpChanged) requestPanelRefresh();
  });

  deathSaveHooksBound = true;
}

function bindActivityRefreshHooks() {
  if (activityHooksBound) return;

  Hooks.on("dnd5e.postUseActivity", () => {
    if (!settingOn("enableActionBar")) return;
    requestPanelRefresh();
  });

  Hooks.on(`${MODULE_ID}.reactionPromptClosed`, () => {
    if (!settingOn("enableActionBar")) return;
    requestPanelRefresh();
  });
  Hooks.on(`${MODULE_ID}.economyChanged`, () => {
    if (!settingOn("enableActionBar")) return;
    requestPanelRefresh();
  });

  activityHooksBound = true;
}

export function handleActionBarCombatTurn() {
  clearReactionPrompt();
  selectedSection = null;
  const combat = getViewedCombat();
  setGameLogCombatActive(Boolean(combat?.started));
  const combatant = combat?.combatant;
  if (combatant?.actor) clearTurnFlags(combatant.actor);
}

export function shouldRefreshActionBarForActor(actor, changes) {
  const token = getActionBarToken();
  if (!token?.actor || token.actor.id !== actor.id) return false;
  if (!changes || typeof changes !== "object") return false;

  // Sheet edits (HP, AC, skills, resources, spells, etc.) and module economy flags.
  return (
    foundry.utils.hasProperty(changes, "system")
    || foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`)
    || foundry.utils.hasProperty(changes, "name")
    || foundry.utils.hasProperty(changes, "img")
    || foundry.utils.hasProperty(changes, "prototypeToken")
  );
}

export function bindActionBarInteractions() {
  bindActionBarClicks();
  bindActivityRefreshHooks();
  bindDeathSaveHooks();
  bindAuraDropdownSync();

  Hooks.on("controlToken", (token, controlled) => {
    if (handleControlTokenDuringTargetPick(token, controlled)) return;
    if (controlled && token) rememberActionBarToken(token);
  });
}
