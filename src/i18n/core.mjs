import { MODULE_ID } from "../constants.mjs";

/** Built-in English defaults when lang file entries are missing. */
export const HUD_FALLBACKS = {
  "currentToken.yourTurn": "Your Turn",
  "turnTracker.minimize": "Minimize turn tracker",
  "turnTracker.expand": "Expand turn tracker",
  "turnTracker.pan": "Pan to Token",
  "partyMenu.select": "Select Token",
  "partyMenu.sheet": "Open Character Sheet",
  "partyMenu.ping": "Ping Token",
  "partyMenu.target": "Target Token",
  "partyMenu.setTurn": "Set as Current Turn",
  "partyMenu.markDefeated": "Mark Defeated",
  "partyMenu.unmarkDefeated": "Unmark Defeated",
  "partyRail.minimize": "Minimize party rail",
  "partyRail.expand": "Expand party rail",
  "sections.standard": "Standard",
  "sections.action": "Action",
  "sections.bonus": "Bonus",
  "sections.reaction": "Reaction",
  "sections.legendary": "Legendary",
  "sections.lair": "Lair",
  "reasons.noLair": "No lair actions left",
  "actions.dash": "Dash",
  "actions.disengage": "Disengage",
  "actions.dodge": "Dodge",
  "actions.help": "Help",
  "actions.hide": "Hide",
  "actions.ready": "Ready",
  "actions.readyPrompt": "Describe the readied action:",
  "actions.readyTrigger": "Trigger",
  "actions.readyTriggerMove": "A hostile creature moves within range",
  "actions.readyTriggerCast": "A hostile creature casts a spell within range",
  "actions.readyTriggerAttack": "A hostile creature makes an attack within range",
  "actions.readyTriggerManual": "Something else (resolve by hand)",
  "actions.readyActivity": "Readied action",
  "actions.readyRange": "Range (ft)",
  "movement.remaining": "Movement remaining",
  "movement.mode": "Movement mode",
  "movement.dashing": "Dashing",
  "movement.overBudget": "Not enough movement left ({remaining} ft remaining).",
  "actionBar.targetPickHintMany": "Pick who {name} hits — up to {count}. One person is fine.",
  "actionBar.targetPickCanvasHint": "Tap people on the map. The big check fires it.",
  "actionBar.flipToken": "Flip token",
  "actionBar.tipFlipDetail": "Mirror the token so it faces the other way.",
  "actionBar.elevation": "Height",
  "actionBar.elevationUp": "Raise height",
  "actionBar.elevationDown": "Lower height",
  "actionBar.tipElevationDetail": "Each click moves one square up or down.",
  "actionBar.movementUndo": "Undo movement",
  "actionBar.movementUndoHint": "Put this token back where it started this turn.",
  "actionBar.movementUndoEmpty": "Nothing to undo.",
  "actionBar.gameLog": "Game log",
  "actionBar.gameLogMaster": "Combat game log",
  "actionBar.gameLogHint": "This turn’s action list. Undo reverses that action and everything after it on the turn.",
  "actionBar.gameLogCombatOnly": "Game log is available during combat.",
  "actionBar.gameLogEmpty": "No actions recorded yet.",
  "actionBar.gameLogEmptyTurn": "Nothing on this turn yet.",
  "actionBar.gameLogUndo": "Undo",
  "actionBar.gameLogUndoEmpty": "Nothing to undo.",
  "actionBar.gameLogUndoTitle": "Undo from this action",
  "actionBar.gameLogUndoConfirm": "Undo “{label}” and everything after it on this turn? Damage, movement, and effects reverse.",
  "actionBar.gameLogClose": "Close",
  "actionBar.gameLogGoto": "Go to this action",
  "actionBar.gameLogGotoTitle": "Rewind combat log",
  "actionBar.gameLogGotoConfirm": "Undo “{label}” and everything after it on this turn?",
  "actionBar.gameLogGmOnly": "Only the GM can rewind the game log.",
  "actionBar.gameLogPopupHintGm": "Current turn’s list. Undo reverses that action and later ones (HP, moves, effects) and removes them.",
  "actionBar.gameLogPopupHint": "Actions on the current turn.",
  "actionBar.gameLogMasterHintGm": "Full encounter log. Undo reverses that action and later ones on its turn (HP, moves, effects).",
  "actionBar.gameLogMasterHint": "Actions recorded for this encounter.",
  "actionBar.toggleAura": "Aura",
  "actionBar.tipAuraDetail": "Paint up to three colored circles around this token.",
  "actionBar.auraOff": "Off",
  "actionBar.auraFeet": "{feet} ft",
  "actionBar.auraFeetUnit": "ft",
  "actionBar.auraColor": "Color",
  "actionBar.auraPickColor": "Pick a color",
  "actionBar.auraAdd": "Add",
  "target.none": "Select target(s) on the canvas (T)",
  "target.one": "1 target selected",
  "target.many": "{count} targets selected",
  "target.outOfRange": "Out of range",
  "target.noLOS": "No line of sight",
  "target.totalCover": "Target has total cover",
  "cover.softTitle": "Cover adjudication",
  "cover.softHint": "{target}: ~{pct}% of the silhouette is blocked. Choose cover.",
  "cover.none": "None",
  "cover.half": "Half (+2)",
  "cover.threeQuarters": "Three-quarters (+5)",
  "knockout.title": "Knock out?",
  "knockout.hint": "{name} dropped to 0 HP. Knock them out (unconscious & stable) or leave them dying?",
  "knockout.knockOut": "Knock Out",
  "knockout.leaveDying": "Leave Dying",
  "target.list": "Targets: {names}",
  "reaction.prompt": "{name} can use a reaction.",
  "reaction.banner": "Reaction available — {trigger}",
  "reaction.pass": "Pass",
  "reaction.notTriggered": "Not available for this trigger",
  "turn.end": "End Turn",
  "turn.endShort": "End",
  "turn.notYourTurn": "It is not this token's turn.",
  "warnings.noOwner": "You do not own this token.",
  "warnings.economySpent": "{type} already spent.",
  "warnings.needTarget": "Select a target first.",
  "warnings.needAlly": "Select an ally to help.",
  "warnings.ddbPulling": "Updating from D&D Beyond…",
  "warnings.ddbPulled": "Updated from D&D Beyond.",
  "warnings.ddbNoImporter": "D&D Beyond Importer is not enabled.",
  "warnings.ddbNoLink": "This character is not linked to D&D Beyond.",
  "warnings.ddbFailed": "Could not update from D&D Beyond.",
  "warnings.ddbNoGm": "A GM must be connected to update from D&D Beyond.",
  "empty.noParty": "No party",
  "empty.noAbilities": "No {section} abilities.",
  "empty.noAbilitiesOoc": "No {section} abilities (out of combat).",
  "empty.notInCombat": "This token is not in the active combat.",
  "reasons.cannotUse": "Cannot use",
  "reasons.unavailable": "Unavailable",
  "reasons.notYourTurn": "Not your turn",
  "reasons.noSpellSlots": "No spell slots",
  "reasons.noUses": "No uses left",
  "reasons.noAmmo": "No ammo",
  "reasons.missingMaterials": "Missing materials",
  "reasons.selectTarget": "Select a target",
  "reasons.notInCombat": "Not in combat",
  "reasons.noLegendary": "No legendary actions left",
  "ui.concentratingOn": "Concentrating on {name}",
  "ui.spellSlotsLevel": "Level {level} spell slots",
  "ui.actionEconomy": "Action economy",
  "ui.armorClass": "Armor Class",
  "ui.walkSpeed": "Walk speed",
  "ui.openSheet": "Open Character Sheet",
  "ui.showLocation": "Show location on map",
  "ui.deathSaves": "Death saves",
  "ui.stabilized": "Stabilized",
  "ui.unconscious": "Unconscious",
  "ui.dead": "Dead",
  "ui.dropConcentration": "Drop concentration",
  "actionBar.resources": "Resources",
  "actionBar.pactMagic": "Pact Magic",
  "actionBar.pactLevel": "Slot level {level}",
  "actionBar.legendaryResistance": "Legendary Resistance",
  "actionBar.tipResistanceDetail": "{remaining} left",
  "actionBar.immunities": "Immunities",
  "actionBar.resistances": "Resistances",
  "actionBar.languages": "Languages",
  "actionBar.languagesNone": "None",
  "actionBar.lairActions": "Lair Actions",
  "actionBar.tipLairDetail": "{remaining} of {max} lair actions remaining.",
  "ui.ready": "Ready",
  "ui.cancel": "Cancel",
  "cameraPad.title": "Move the map",
  "cameraPad.tableTitle": "Move the table",
  "cameraPad.zoomIn": "Closer",
  "cameraPad.zoomOut": "Farther",
  "cameraPad.panUp": "Up",
  "cameraPad.panDown": "Down",
  "cameraPad.panLeft": "Left",
  "cameraPad.panRight": "Right",
  "cameraPad.recenter": "Center on token",
  "settings.mobileClientMode.name": "Mobile Client Mode",
  "settings.mobileClientMode.hint": "Auto: sheet-only for players; full HUD for GM and Touchscreen. Force Mobile/Desktop overrides that.",
  "settings.mobileClientMode.auto": "Auto (players sheet-only)",
  "settings.mobileClientMode.forceMobile": "Force Mobile (sheet-only)",
  "settings.mobileClientMode.forceDesktop": "Force Desktop (full HUD)",
  "settings.gmResolutionChat.name": "GM resolution chat",
  "settings.gmResolutionChat.hint": "When an activity finishes, whisper a short resolution summary to GMs only.",
  "settings.enableCameraPad.name": "Enable Camera Pad",
  "settings.enableCameraPad.hint": "Show the map pan and zoom cluster on this client when the world allows it.",
  "settings.menus.cameraPad.name": "Camera Pad Settings",
  "settings.menus.cameraPad.label": "Camera Pad Settings",
  "settings.menus.cameraPad.hint": "The GM pad moves the Touchscreen table. Checked users get a pad for their own map.",
  "settings.menus.cameraPad.title": "Camera Pad Settings",
  "settings.cameraPadVisibleTo.name": "Who can see the camera pad",
  "settings.cameraPadVisibleTo.hint": "Checked users get a pad that moves their own map. The user chosen under Display → Tabletop camera controls moves the table instead.",
  "settings.tabletopUser.name": "Tabletop",
  "settings.tabletopUser.hint": "This user's camera stays where it is. None leaves every camera free.",
  "settings.tabletopUser.none": "None",
  "settings.tabletopCameraUser.name": "Tabletop camera controls",
  "settings.tabletopCameraUser.hint": "This user moves the tabletop camera. Choose the tabletop user again to put the camera pad on the table.",
  "settings.tabletopCameraUser.none": "None",
  "settings.cameraPadVisibleTo.empty": "No users in this world yet.",
  "mobileMove.title": "Move",
  "mobileMove.noToken": "This character is not on the map.",
  "mobileMove.panUp": "Up",
  "mobileMove.panDown": "Down",
  "mobileMove.panLeft": "Left",
  "mobileMove.panRight": "Right",
  "mobileMove.panUpLeft": "Up left",
  "mobileMove.panUpRight": "Up right",
  "mobileMove.panDownLeft": "Down left",
  "mobileMove.panDownRight": "Down right",
  "mobileMove.undoOne": "Undo 1",
  "mobileMove.undoAll": "Undo all",
  "mobileMove.failed": "Could not move that token.",
  "mobileMove.noTargetsInRange": "Nobody is in range.",
  "mobileMove.showSidebar": "Show tabs",
  "mobileMove.hideSidebar": "Hide tabs",
  "mobileSheet.openDdb": "Open D&D Beyond",
  "mobileSheet.pullDdb": "Update from Beyond"
};

/** @type {Map<string, string>} */
let STRING_TABLE = new Map();
let i18nReady = false;

const MODULE_KEY_PREFIX = `${MODULE_ID}.`;
const MODULE_KEY_RE = /illusive-dnd-5e\./;

export function fullKey(key) {
  return key.startsWith(MODULE_KEY_PREFIX) ? key : `${MODULE_ID}.${key}`;
}

export function shortKey(key) {
  return key.startsWith(MODULE_KEY_PREFIX) ? key.slice(MODULE_KEY_PREFIX.length) : key;
}

function formatData(str, data = {}) {
  if (!str || !data || !Object.keys(data).length) return str;
  return Object.entries(data).reduce(
    (text, [entryKey, value]) => text.replaceAll(`{${entryKey}}`, String(value ?? "")),
    str
  );
}

export function looksLikeModuleKey(value) {
  if (!value || typeof value !== "string") return true;
  return value.includes(MODULE_KEY_PREFIX) || MODULE_KEY_RE.test(value);
}

function humanizeKey(short) {
  const parts = short.split(".");
  const suffixes = new Set([
    "name", "hint", "label", "title", "bar", "text", "left", "center",
    "compact", "normal", "large", "bg3", "minimal", "fixed", "initiative", "alphabetical"
  ]);
  let leaf = parts[parts.length - 1] ?? short;
  if (suffixes.has(leaf) && parts.length > 1) leaf = parts[parts.length - 2];

  return leaf
    .replace(/^show/, "Show ")
    .replace(/^enable/, "Enable ")
    .replace(/^hide/, "Hide ")
    .replace(/^prefer/, "Prefer ")
    .replace(/^color/, "Color ")
    .replace(/^party/, "Party ")
    .replace(/^token/, "Token ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

export function storeString(key, value) {
  if (!key || typeof value !== "string" || !value) return;
  STRING_TABLE.set(key, value);
  const short = shortKey(key);
  if (!STRING_TABLE.has(short)) STRING_TABLE.set(short, value);
}

function ingestLangObject(obj, prefix = MODULE_ID) {
  if (!obj || typeof obj !== "object") return;
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      storeString(key.includes(".") ? key : `${prefix}.${key}`, value);
      continue;
    }
    if (value && typeof value === "object") ingestLangObject(value, `${prefix}.${key}`);
  }
}

function mergeFoundryCatalogs() {
  const catalogs = [
    game.i18n?.translations?.[game.i18n.lang],
    game.i18n?.translations?.en,
    game.i18n?._fallback
  ].filter(Boolean);

  for (const catalog of catalogs) {
    for (const [key, value] of Object.entries(catalog)) {
      if (key.startsWith(MODULE_KEY_PREFIX) && typeof value === "string") storeString(key, value);
    }
    const mod = catalog[MODULE_ID];
    if (mod && typeof mod === "object") ingestLangObject(mod, MODULE_ID);
  }
}

async function loadLangFile(lang) {
  return foundry.utils.fetchJsonWithTimeout(`modules/${MODULE_ID}/lang/${lang}.json`);
}

export async function initI18n() {
  STRING_TABLE = new Map();

  for (const [key, value] of Object.entries(HUD_FALLBACKS)) {
    storeString(`${MODULE_ID}.${key}`, value);
  }

  const lang = game.i18n?.lang ?? "en";
  const files = lang === "en" ? ["en"] : [lang, "en"];

  for (const file of files) {
    try {
      ingestLangObject(await loadLangFile(file));
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not load lang/${file}.json`, error);
    }
  }

  mergeFoundryCatalogs();
  i18nReady = true;
}

function lookupRaw(key) {
  const id = fullKey(key);
  const short = shortKey(key);
  return STRING_TABLE.get(id) ?? STRING_TABLE.get(short) ?? null;
}

/** Resolve any module string key. Never returns a raw module i18n key. */
export function illusiveDndLocalize(key, data = {}) {
  if (!key) return "";

  const short = shortKey(fullKey(key));
  let text = lookupRaw(key);

  if (!text && game.i18n) {
    const id = fullKey(key);
    const fromCore = data && Object.keys(data).length
      ? game.i18n.format(id, data)
      : game.i18n.localize(id);
    if (fromCore && !looksLikeModuleKey(fromCore)) text = fromCore;
  }

  if (!text) text = humanizeKey(short);

  text = formatData(text, data);
  if (looksLikeModuleKey(text)) text = humanizeKey(short);

  if (!i18nReady) console.warn(`${MODULE_ID} | illusiveDndLocalize before initI18n: ${short}`);

  return text;
}

export function illusiveDndResolve(value, data = {}) {
  if (!value || typeof value !== "string") return value ?? "";
  if (!looksLikeModuleKey(value)) return formatData(value, data);
  return illusiveDndLocalize(value, data);
}

/** Foundry system/core keys only — not module strings. */
export function illusiveDndCore(key, data = {}) {
  if (!game.i18n) return key;
  const text = data && Object.keys(data).length ? game.i18n.format(key, data) : game.i18n.localize(key);
  return text && text !== key ? text : key;
}
