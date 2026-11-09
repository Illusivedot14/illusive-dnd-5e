/**
 * Manual dice roller — fixed toggle + panel matching a compact dice-roller layout:
 * command input, die pads, modifier +/- , ADV/DIS, Roll.
 */

import { isIllusiveMobileMode } from "../../lib/mobile-client.mjs";
import { getMobileSheetActor } from "./mobile-sheet.mjs";
import { getMobileFocusedActor } from "./mobile-focus.mjs";
import { swipeStyleEvaluateAndToMessage } from "./mobile-sheet-dsn.mjs";
import { ensureMobileSheetStyles } from "./mobile-sheet-styles.mjs";
import { ensureDomRoot } from "../../lib/viewport.mjs";

const ROOT_ID = "illusive-dnd-mobile-dice-roller";

const DICE_TYPES = [
  { die: "d4", icon: "fa-dice-d4" },
  { die: "d6", icon: "fa-dice-d6" },
  { die: "d8", icon: "fa-dice-d8" },
  { die: "d10", icon: "fa-dice-d10" },
  { die: "d12", icon: "fa-dice-d12" },
  { die: "d20", icon: "fa-dice-d20" },
  { die: "d100", icon: "fa-dice" }
];

let bound = false;
let counts = Object.fromEntries(DICE_TYPES.map((d) => [d.die, 0]));
let modifier = 0;
/** @type {"none"|"advantage"|"disadvantage"} */
let advMode = "none";
let syncingFromUi = false;
let longPressTimer = null;
let longPressFired = false;

function rootEl() {
  return document.getElementById(ROOT_ID);
}

function ensureRoot() {
  return ensureDomRoot(ROOT_ID, {
    className: "illusive-dnd-mobile-dice-roller",
    html: `
    <button type="button" class="illusive-dnd-dice-toggle" data-action="toggle" title="Manual roller" aria-expanded="false" aria-controls="illusive-dnd-dice-panel">
      <i class="fa-solid fa-dice-d20"></i>
    </button>
    <div id="illusive-dnd-dice-panel" class="illusive-dnd-dice-panel" hidden>
      <div class="illusive-dnd-dice-command-row">
        <input type="text" class="illusive-dnd-dice-command" spellcheck="false" autocomplete="off"
          inputmode="text" placeholder="/r 1d20" aria-label="Roll command" />
      </div>
      <div class="illusive-dnd-dice-pad-row" role="group" aria-label="Dice">
        ${DICE_TYPES.map(({ die, icon }) => `
          <button type="button" class="illusive-dnd-dice-btn" data-die="${die}" title="${die.toUpperCase()}">
            <i class="fa-solid ${icon}"></i>
            <span class="illusive-dnd-dice-count" data-count-for="${die}"></span>
          </button>
        `).join("")}
      </div>
      <div class="illusive-dnd-dice-mod-row">
        <button type="button" class="illusive-dnd-dice-mod-btn" data-action="mod-minus" title="Decrease modifier">−</button>
        <input type="number" class="illusive-dnd-dice-mod-input" value="0" step="1" inputmode="numeric" aria-label="Modifier" />
        <button type="button" class="illusive-dnd-dice-mod-btn" data-action="mod-plus" title="Increase modifier">+</button>
        <button type="button" class="illusive-dnd-dice-adv" data-action="adv-cycle" title="Advantage / Disadvantage" aria-pressed="false">
          <span class="illusive-dnd-dice-adv-top">ADV</span>
          <span class="illusive-dnd-dice-adv-bot">DIS</span>
        </button>
        <button type="button" class="illusive-dnd-dice-roll-btn" data-action="roll">Roll</button>
      </div>
    </div>
  `
  });
}

function commandInput() {
  return rootEl()?.querySelector(".illusive-dnd-dice-command");
}

function modInput() {
  return rootEl()?.querySelector(".illusive-dnd-dice-mod-input");
}

function buildDiceParts() {
  const parts = [];
  for (const { die } of DICE_TYPES) {
    const n = counts[die] || 0;
    if (n > 0) parts.push(`${n}${die}`);
  }
  return parts;
}

function buildFormulaFromPads() {
  let parts = buildDiceParts();
  if (!parts.length && modifier === 0) return "";

  // Apply ADV/DIS to d20 pools
  if (advMode !== "none") {
    parts = parts.map((p) => {
      const m = p.match(/^(\d+)d20$/i);
      if (!m) return p;
      const n = Number(m[1]) || 1;
      if (advMode === "advantage") return `${Math.max(2, n)}d20kh1`;
      return `${Math.max(2, n)}d20kl1`;
    });
    if (!parts.some((p) => /d20/i.test(p))) {
      parts.unshift(advMode === "advantage" ? "2d20kh1" : "2d20kl1");
    }
  }

  if (!parts.length) parts.push("0");
  let formula = parts.join("+");
  if (modifier > 0) formula += `+${modifier}`;
  else if (modifier < 0) formula += `${modifier}`;
  return formula;
}

function buildCommandFromPads() {
  const formula = buildFormulaFromPads();
  return formula ? `/r ${formula}` : "/r ";
}

function refreshPadUi() {
  const root = rootEl();
  if (!root) return;
  for (const { die } of DICE_TYPES) {
    const n = counts[die] || 0;
    const btn = root.querySelector(`[data-die="${die}"]`);
    const badge = root.querySelector(`[data-count-for="${die}"]`);
    if (!btn || !badge) continue;
    if (n > 0) {
      badge.textContent = String(n);
      badge.classList.add("is-visible");
      btn.classList.add("is-selected");
    } else {
      badge.textContent = "";
      badge.classList.remove("is-visible");
      btn.classList.remove("is-selected");
    }
  }

  const mod = modInput();
  if (mod && document.activeElement !== mod) mod.value = String(modifier);

  const advBtn = root.querySelector(".illusive-dnd-dice-adv");
  if (advBtn) {
    advBtn.dataset.mode = advMode;
    advBtn.classList.toggle("is-adv", advMode === "advantage");
    advBtn.classList.toggle("is-dis", advMode === "disadvantage");
    advBtn.setAttribute("aria-pressed", advMode !== "none" ? "true" : "false");
  }

  if (!syncingFromUi) {
    const cmd = commandInput();
    if (cmd && document.activeElement !== cmd) cmd.value = buildCommandFromPads();
  }
}

function syncCommandFromPads() {
  syncingFromUi = false;
  refreshPadUi();
}

function parseCommand(raw) {
  let text = String(raw ?? "").trim();
  if (!text) return null;
  // Strip chat commands: /r, /roll, [[ ]], etc.
  text = text.replace(/^\/(?:r|roll)\s+/i, "");
  text = text.replace(/^\[\[\/?(?:r|roll)\s+/i, "").replace(/\]\]$/, "");
  text = text.replace(/^\[\[/, "").replace(/\]\]$/, "");
  return text.trim() || null;
}

/**
 * When the user types a command, try to mirror counts/mod for the pad UI.
 * Does not need to be perfect — pads are a helper; command is source of truth on Roll.
 */
function syncPadsFromCommand() {
  const formula = parseCommand(commandInput()?.value);
  if (!formula) return;

  syncingFromUi = true;
  const next = Object.fromEntries(DICE_TYPES.map((d) => [d.die, 0]));
  let nextMod = 0;
  let nextAdv = "none";

  if (/kh1|advantage/i.test(formula)) nextAdv = "advantage";
  else if (/kl1|disadvantage/i.test(formula)) nextAdv = "disadvantage";

  const cleaned = formula.replace(/\s+/g, "");

  for (const { die } of DICE_TYPES) {
    const re = new RegExp(`(\\d+)${die}(?:kh1|kl1)?`, "gi");
    let m;
    while ((m = re.exec(cleaned))) {
      next[die] += Number(m[1]) || 0;
    }
  }

  const withoutDice = cleaned.replace(/\d+d(?:4|6|8|10|12|20|100)(?:kh1|kl1)?/gi, "");
  const mods = withoutDice.match(/[+-]\d+/g);
  if (mods?.length) {
    nextMod = mods.reduce((sum, t) => sum + (Number(t) || 0), 0);
  }

  counts = next;
  modifier = nextMod;
  advMode = nextAdv;
  refreshPadUi();
  syncingFromUi = false;
}

function addDie(die) {
  counts[die] = (counts[die] || 0) + 1;
  syncCommandFromPads();
}

function removeDie(die) {
  if ((counts[die] || 0) <= 0) return;
  counts[die] -= 1;
  syncCommandFromPads();
}

function adjustModifier(delta) {
  modifier += delta;
  syncCommandFromPads();
}

function setModifierFromInput() {
  const raw = modInput()?.value;
  const n = Number(raw);
  modifier = Number.isFinite(n) ? Math.trunc(n) : 0;
  syncCommandFromPads();
}

function cycleAdv() {
  if (advMode === "none") advMode = "advantage";
  else if (advMode === "advantage") advMode = "disadvantage";
  else advMode = "none";
  syncCommandFromPads();
}

function clearAll() {
  counts = Object.fromEntries(DICE_TYPES.map((d) => [d.die, 0]));
  modifier = 0;
  advMode = "none";
  syncCommandFromPads();
}

function resolveRollActor() {
  return getMobileFocusedActor() ?? getMobileSheetActor();
}

async function rollSelected() {
  // Prefer whatever is typed — allows full freeform commands
  let formula = parseCommand(commandInput()?.value);
  if (!formula) formula = buildFormulaFromPads();
  if (!formula) {
    ui.notifications?.warn?.("Enter a roll or select dice");
    return;
  }

  const actor = resolveRollActor();
  await swipeStyleEvaluateAndToMessage(formula, {
    data: actor?.getRollData?.() ?? {},
    speaker: ChatMessage.getSpeaker({ actor: actor ?? undefined }),
    flavor: actor ? `${actor.name} — Custom Roll` : "Custom Roll"
  });
  // Keep roller open; reset pads for the next roll
  clearAll();
}

function setOpen(open) {
  const root = ensureRoot();
  const panel = root.querySelector(".illusive-dnd-dice-panel");
  const toggle = root.querySelector(".illusive-dnd-dice-toggle");
  if (!panel || !toggle) return;
  panel.hidden = !open;
  root.classList.toggle("is-open", open);
  document.body.classList.toggle("illusive-dnd-mobile-roller-open", open);
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) syncCommandFromPads();
}

function isRollerOpen() {
  return Boolean(rootEl()?.classList.contains("is-open"));
}

/** Tap outside the roller UI closes the panel. */
function onOutsidePointerUp(event) {
  if (!isRollerOpen()) return;
  const root = rootEl();
  if (!root) return;
  if (root.contains(event.target)) return;
  setOpen(false);
}

function onPointerDown(event) {
  const root = rootEl();
  if (!root?.contains(event.target)) return;
  const btn = event.target.closest?.("[data-die]");
  if (!btn) return;
  longPressFired = false;
  const die = btn.dataset.die;
  longPressTimer = window.setTimeout(() => {
    longPressFired = true;
    removeDie(die);
  }, 450);
}

function onPointerUp(event) {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  const root = rootEl();
  if (!root?.contains(event.target)) return;

  // Don't steal text input interactions
  if (event.target.closest?.("input")) return;

  const actionBtn = event.target.closest?.("[data-action]");
  if (actionBtn) {
    event.preventDefault();
    event.stopPropagation();
    const action = actionBtn.dataset.action;
    if (action === "toggle") setOpen(!root.classList.contains("is-open"));
    else if (action === "roll") void rollSelected();
    else if (action === "mod-plus") adjustModifier(1);
    else if (action === "mod-minus") adjustModifier(-1);
    else if (action === "adv-cycle") cycleAdv();
    else if (action === "clear") clearAll();
    return;
  }

  const dieBtn = event.target.closest?.("[data-die]");
  if (!dieBtn) return;
  event.preventDefault();
  event.stopPropagation();
  if (longPressFired) return;
  addDie(dieBtn.dataset.die);
}

function onPointerCancel() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function onInput(event) {
  const root = rootEl();
  if (!root?.contains(event.target)) return;
  if (event.target.classList?.contains("illusive-dnd-dice-command")) {
    // Live-update pads from typed command (debounced lightly via rAF)
    requestAnimationFrame(() => syncPadsFromCommand());
  } else if (event.target.classList?.contains("illusive-dnd-dice-mod-input")) {
    setModifierFromInput();
  }
}

function onKeyDown(event) {
  const root = rootEl();
  if (!root?.contains(event.target)) return;
  if (event.key === "Enter" && event.target.classList?.contains("illusive-dnd-dice-command")) {
    event.preventDefault();
    void rollSelected();
  }
}

export function renderMobileDiceRoller() {
  ensureMobileSheetStyles();
  if (!isIllusiveMobileMode()) {
    rootEl()?.remove();
    document.body.classList.remove("illusive-dnd-mobile-roller-open");
    return;
  }
  ensureRoot();
  refreshPadUi();
}

export function bindMobileDiceRoller() {
  if (bound) return;
  bound = true;
  renderMobileDiceRoller();
  document.body.addEventListener("pointerdown", onPointerDown, true);
  document.body.addEventListener("pointerup", onPointerUp, true);
  document.body.addEventListener("pointerup", onOutsidePointerUp, false);
  document.body.addEventListener("pointercancel", onPointerCancel, true);
  document.body.addEventListener("input", onInput, true);
  document.body.addEventListener("keydown", onKeyDown, true);
}
