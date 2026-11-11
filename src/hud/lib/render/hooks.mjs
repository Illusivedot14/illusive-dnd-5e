/**
 * HUD repaint hooks (party, action bar, combat, selection).
 * Canvas/token hooks (scene deselect, touch table) → ../hooks/index.mjs
 */
import { getViewedCombat } from "../../../foundry/combat.mjs";
import { actorFields, isTokenMovementChange } from "../../../foundry/document-change.mjs";
import { syncActionBarFields, syncPartyFields, syncTurnFields } from "../../../foundry/field-sync.mjs";
import { desktopHudEnabled } from "../mobile-client.mjs";
import { getActionBarToken } from "../../../application/reaction-context.mjs";
import { refreshHud, repositionHud } from "./core.mjs";
import { ILLUSIVE_DND_RENDER } from "./scopes.mjs";
import {
  handleActionBarCombatTurn,
  syncActionBarMovement
} from "../../components/action-bar/action-bar.mjs";
import {
  isGameLogEnabled,
  noteTokenMovedDuringCombat,
  setGameLogCombatActive
} from "../../../application/combat-game-log.mjs";
import { expireEventCombatants } from "../../components/turn-tracker/add-event.mjs";
import { expireRoundBasedEffects } from "../../../foundry/effect-duration.mjs";
import { bindHudImageFallback, cleanupLegacyHudMounts } from "../hud-mount.mjs";
import { syncFoundryUiVisibility } from "../../components/action-bar/action-bar-foundry-ui.mjs";
import { registerHudPanels } from "./panels.mjs";

/**
 * Foundry hooks that map 1:1 to a single refresh: `hookName → [scope, options?]`.
 * Anything conditional or with a side effect is bound explicitly below instead.
 * @type {Record<string, [string, object?]>}
 */
const REFRESH_HOOKS = {
  controlToken: [ILLUSIVE_DND_RENDER.SELECTION],
  createToken: [ILLUSIVE_DND_RENDER.SELECTION],
  deleteToken: [ILLUSIVE_DND_RENDER.SELECTION],

  createItem: [ILLUSIVE_DND_RENDER.ACTION_BAR],
  updateItem: [ILLUSIVE_DND_RENDER.ACTION_BAR],
  deleteItem: [ILLUSIVE_DND_RENDER.ACTION_BAR],

  createActiveEffect: [ILLUSIVE_DND_RENDER.ACTION_BAR],
  updateActiveEffect: [ILLUSIVE_DND_RENDER.ACTION_BAR],
  deleteActiveEffect: [ILLUSIVE_DND_RENDER.ACTION_BAR],

  "dnd5e.postUseActivity": [ILLUSIVE_DND_RENDER.ACTION_BAR],

  createCombat: [ILLUSIVE_DND_RENDER.TURN, { recenter: true }],
  createCombatant: [{ turn: true, actionBar: true }, { recenter: true }],
  updateCombatant: [{ turn: true, actionBar: true }],
  deleteCombatant: [{ turn: true, actionBar: true }, { recenter: true }]
};

function refreshShownMovement(docOrActor, { actor = false } = {}) {
  if (!desktopHudEnabled()) return;
  const shown = getActionBarToken();
  if (!shown) return;
  const matches = actor
    ? shown.actor?.id === docOrActor?.id
    : (shown.document?.id ?? shown.id) === docOrActor?.id;
  if (!matches) return;
  if (!syncActionBarMovement(shown)) refreshHud(ILLUSIVE_DND_RENDER.ACTION_BAR);
}

function onUpdateToken(doc, changes, options, userId) {
  const positionMoved = Boolean(changes && (
    "x" in changes
    || "y" in changes
    || "elevation" in changes
    || "_movementHistory" in changes
  ));
  // The mover's client records the move; the journal syncs it to everyone else.
  const movedHere = !userId || userId === game.user?.id;
  if (
    positionMoved
    && movedHere
    && isGameLogEnabled()
    && !options?.isUndo
    && !options?.illusiveDndForced
    && !options?.illusiveDndBypassMovementBudget
  ) {
    const token = doc?.object
      ?? globalThis.canvas?.tokens?.placeables?.find((t) => t.document?.id === doc?.id)
      ?? null;
    if (token) noteTokenMovedDuringCombat(token, changes, options);
  }

  if (isTokenMovementChange(changes)) {
    refreshShownMovement(doc);
    return;
  }
  const keys = Object.keys(changes ?? {});
  const barOnly = keys.length > 0 && keys.every((key) =>
    key === "light" || key === "flags" || key === "movementAction"
  );
  if (barOnly) {
    const shown = getActionBarToken();
    const shownId = shown?.document?.id ?? shown?.id ?? null;
    if (shownId && doc?.id === shownId) refreshHud(ILLUSIVE_DND_RENDER.ACTION_BAR);
    return;
  }
  refreshHud(ILLUSIVE_DND_RENDER.SELECTION);
}

const PARTY_FIELDS = new Set(["hp", "death", "identity"]);
const TURN_FIELDS = new Set(["hp", "death", "identity"]);
const BAR_FIELDS = new Set([
  "hp", "death", "ac", "identity", "movement", "abilities", "skills",
  "resources", "spells", "flags", "unknown"
]);

function hasField(fields, group) {
  for (const field of fields) if (group.has(field)) return true;
  return false;
}

/**
 * One actor diff updates only the panels that display those fields.
 * A number that is already on screen is written in place. A full panel paint
 * is reserved for a change that adds or removes a control.
 */
function onUpdateActor(actor, changes) {
  if (!desktopHudEnabled()) return;
  const fields = actorFields(changes);

  if (fields.has("movement")) refreshShownMovement(actor, { actor: true });

  const structural = fields.has("unknown") || fields.has("death") || fields.has("flags");
  const shown = getActionBarToken()?.actor?.id === actor?.id;

  if (hasField(fields, PARTY_FIELDS)) {
    if (structural || !syncPartyFields(actor, fields)) refreshHud(ILLUSIVE_DND_RENDER.PARTY);
  }
  if (shown && hasField(fields, BAR_FIELDS)) {
    const numbersOnly = !structural
      && ![...fields].some((field) => !["hp", "ac", "identity", "movement"].includes(field));
    if (!numbersOnly || !syncActionBarFields(actor, fields)) {
      if ([...fields].some((field) => field !== "movement")) refreshHud(ILLUSIVE_DND_RENDER.ACTION_BAR);
    }
  }
  if (getViewedCombat() && hasField(fields, TURN_FIELDS)) {
    if (structural || !syncTurnFields(actor, fields)) refreshHud(ILLUSIVE_DND_RENDER.TURN);
  }
}

/**
 * Turn/round driver. Both `updateCombat` and `combatTurnChange` fire *after* the
 * DB commit (per v14 Combat#_onUpdate), so `combat.turn` — and therefore
 * `combat.combatant` (=== `combat.turns[combat.turn]`) — is already fresh.
 * We fire the refresh FIRST so the side-effecting action-bar reset can never
 * block the carousel re-render, and we skip the pre-commit `combatTurn` /
 * `combatRound` hooks whose `combat.turn` is stale.
 */
function onUpdateCombat(combat, changes) {
  const turnChanged = "turn" in changes;
  const roundChanged = "round" in changes;

  if (!turnChanged && !roundChanged) {
    refreshHud(ILLUSIVE_DND_RENDER.TURN);
    return;
  }

  if (roundChanged) {
    void expireEventCombatants(combat)
      .then(() => expireRoundBasedEffects(combat))
      .then(() => refreshHud(ILLUSIVE_DND_RENDER.COMBAT_TURN, { reposition: true }));
  } else {
    refreshHud(ILLUSIVE_DND_RENDER.COMBAT_TURN, { reposition: true });
  }

  handleActionBarCombatTurn();
}

// Post-commit, fires on all clients: authoritative "who is up" is fresh here.
function onCombatTurnChange() {
  refreshHud(ILLUSIVE_DND_RENDER.COMBAT_TURN, { reposition: true });
}

function onCombatStart() {
  setGameLogCombatActive(true);
  refreshHud(ILLUSIVE_DND_RENDER.COMBAT_TURN, { recenter: true });
  handleActionBarCombatTurn();
}

function onDeleteCombat() {
  setGameLogCombatActive(false);
  refreshHud(ILLUSIVE_DND_RENDER.COMBAT_TURN, { recenter: true });
  handleActionBarCombatTurn();
}

let hooksBound = false;

export function bindRenderHooks() {
  if (hooksBound) return;
  hooksBound = true;

  registerHudPanels();
  cleanupLegacyHudMounts();
  bindHudImageFallback();

  window.addEventListener("resize", () => {
    repositionHud();
    syncFoundryUiVisibility();
  });

  // Keep the HUD inside the available band as the side UI resizes. Observing the
  // sidebar covers its collapse/expand animation frame-by-frame; the hook is a
  // belt-and-braces trigger for clients where the element isn't observable yet.
  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(() => {
      repositionHud();
      syncFoundryUiVisibility();
    });
    for (const id of ["hotbar", "sidebar", "ui-right", "ui-left", "interface"]) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
  }
  Hooks.on("collapseSidebar", () => {
    repositionHud();
    syncFoundryUiVisibility();
  });
  // Side menu destroyed / recreated (no-UI streams, tab popout, soft reloads).
  Hooks.on("renderSidebar", () => {
    repositionHud();
    syncFoundryUiVisibility();
  });

  for (const [hook, [scope, options]] of Object.entries(REFRESH_HOOKS)) {
    Hooks.on(hook, () => refreshHud(scope, options));
  }

  Hooks.on("updateToken", onUpdateToken);
  Hooks.on("updateActor", onUpdateActor);
  Hooks.on("updateCombat", onUpdateCombat);
  Hooks.on("combatTurnChange", onCombatTurnChange);
  Hooks.on("combatStart", onCombatStart);
  Hooks.on("deleteCombat", onDeleteCombat);

  Hooks.on("renderHotbar", () => {
    syncFoundryUiVisibility();
    repositionHud();
    refreshHud(ILLUSIVE_DND_RENDER.HOTBAR);
  });

  Hooks.on("canvasReady", () => {
    refreshHud(ILLUSIVE_DND_RENDER.ALL);
    Hooks.on("renderCombatTracker", () => refreshHud(ILLUSIVE_DND_RENDER.TURN));
    // Lock View may hide UI after canvasReady; remasure band once more.
    requestAnimationFrame(() => {
      repositionHud();
      syncFoundryUiVisibility();
    });
  });
}
