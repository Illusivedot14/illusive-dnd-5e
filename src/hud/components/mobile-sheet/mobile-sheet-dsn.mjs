import { MODULE_ID } from "../../../constants.mjs";

const SOCKET_EVENT = `module.${MODULE_ID}`;
const MSG_TYPE = "illusive-dnd-mobile-dsn";

let bound = false;
const shownMessageIds = new Set();

function normalizeRollList(rolls) {
  if (!rolls) return [];
  const list = Array.isArray(rolls) ? rolls : [rolls];
  return list.filter((roll) => roll && (Number(roll.dice?.length) > 0 || Number(roll.terms?.length) > 0));
}

function diceLookInteractive(rolls) {
  const methods = CONFIG.Dice?.fulfillment?.methods ?? {};
  const list = normalizeRollList(rolls);
  if (!list.length) return false;
  return list.every((roll) => (roll.dice ?? []).every((die) => methods[die.method]?.interactive === true));
}

function isOurMobileRollMessage(message) {
  return message?.flags?.[MODULE_ID]?.mobileSheetDsn === true;
}

/**
 * Foundry posts rolls with CONFIG.sounds.dice. Dice So Nice deletes that sound
 * when it decides to animate 3D (so only collide SFX remain). Mobile-sheet rolls
 * always take that chat→3D path on desktop (allowInteractive:false), so without
 * this the table hears nothing familiar when the phone rolls.
 */
function playDesktopDiceSound() {
  const src = CONFIG.sounds?.dice;
  if (!src || typeof game.audio?.play !== "function") return;
  try {
    game.audio.play(src, { context: game.audio.interface });
  } catch (err) {
    console.warn(`${MODULE_ID} | desktop dice sound failed`, err);
  }
}

function reviveRoll(data) {
  if (!data) return null;
  try {
    const classes = CONFIG.Dice?.rolls ?? [];
    const named = data.class
      ? classes.find((cls) => cls.name === data.class || cls.documentName === data.class)
      : null;
    const Cls = named ?? classes[0] ?? globalThis.Roll;
    if (typeof Cls.fromData === "function") return Cls.fromData(data);
    if (typeof Roll?.fromData === "function") return Roll.fromData(data);
  } catch (err) {
    console.warn(`${MODULE_ID} | roll revive failed`, err);
  }
  return null;
}

async function forceShowForRolls(rolls, user, messageId, speaker) {
  const dsn = game.dice3d;
  if (!dsn || !game.modules.get("dice-so-nice")?.active) return false;
  const list = normalizeRollList(rolls);
  if (!list.length) return false;
  if (messageId && shownMessageIds.has(messageId)) return false;

  const prev = dsn.messageHookDisabled;
  dsn.messageHookDisabled = false;
  try {
    for (const roll of list) {
      await dsn.showForRoll(roll, user, false, null, false, messageId ?? null, speaker ?? null);
    }
    if (messageId) {
      shownMessageIds.add(messageId);
      if (shownMessageIds.size > 40) {
        const first = shownMessageIds.values().next().value;
        shownMessageIds.delete(first);
      }
    }
    return true;
  } catch (err) {
    console.error(`${MODULE_ID} | forceShowForRolls failed`, err);
    return false;
  } finally {
    dsn.messageHookDisabled = prev;
  }
}

/**
 * Official DSN API: force desktop 3D for Illusive mobile-sheet rolls.
 * Skip the author client (phone) so dice appear on desktop only.
 */
function onDiceSoNiceMessagePreProcess(messageId, data) {
  const message = game.messages.get(messageId);
  if (!isOurMobileRollMessage(message)) return;
  if (message.author?.id === game.user.id) {
    data.willTrigger3DRoll = false;
    return;
  }
  data.willTrigger3DRoll = true;
}

/**
 * Desktop observers: restore chat dice cue, and force 3D if DSN would skip.
 * Author (phone) is skipped — no 3D / no local cue there by design.
 */
async function onCreateChatMessage(message) {
  if (!isOurMobileRollMessage(message) || !message?.isRoll) return;
  if (message.author?.id === game.user.id) return;

  playDesktopDiceSound();

  if (!game.modules.get("dice-so-nice")?.active || !game.dice3d) return;

  const rolls = message.rolls;
  if (!normalizeRollList(rolls).length) return;

  const wouldSkip = game.settings.get("dice-so-nice", "disabledForManualRolls") === true
    && diceLookInteractive(rolls);
  if (!wouldSkip) return;

  console.log(`${MODULE_ID} | desktop forcing DSN for mobile sheet roll`, message.id);
  await forceShowForRolls(rolls, message.author, message.id, message.speaker);
}

async function onSocketMessage(data) {
  if (!data || data.type !== MSG_TYPE) return;
  if (data.userId === game.user.id) return;
  if (data.messageId && shownMessageIds.has(data.messageId)) return;

  const user = game.users.get(data.userId) ?? game.user;
  const rolls = (data.rolls ?? []).map(reviveRoll).filter(Boolean);
  await forceShowForRolls(rolls, user, data.messageId, data.speaker);
}

/**
 *   new Roll(formula) → evaluate() → toMessage()
 *
 * allowInteractive:false so dice are NOT tagged with DSN interactive fulfillment.
 * DSN's default disabledForManualRolls skips chat animation for interactive dice
 * Non-interactive
 * evaluate lets the desktop chat hook run showForRoll — and skips phone 3D.
 */
export async function swipeStyleEvaluateAndToMessage(formula, { data = {}, speaker = null, flavor = "" } = {}) {
  const roll = new Roll(formula, data);
  await roll.evaluate({ allowInteractive: false });
  const message = await roll.toMessage({
    speaker: speaker ?? ChatMessage.getSpeaker(),
    flavor: flavor || undefined,
    flags: { [MODULE_ID]: { mobileSheetDsn: true } }
  });
  return { roll, message };
}

/**
 * Optional socket ping for paths that cannot use swipeStyleEvaluateAndToMessage
 * (e.g. initiative). Deduped against chat-hook / force paths via message id.
 */
export async function broadcastDiceSoNiceToOthers(returnedRolls, { actor = null, speaker = null, message = null } = {}) {
  let rolls = normalizeRollList(returnedRolls);
  let msg = message ?? [...game.messages].reverse().find((m) => (
    m.author?.id === game.user.id && m.isRoll && normalizeRollList(m.rolls).length
  )) ?? null;

  if (!rolls.length && msg) rolls = normalizeRollList(msg.rolls);
  if (!rolls.length) return false;

  const payload = {
    type: MSG_TYPE,
    userId: game.user.id,
    messageId: msg?.id ?? null,
    speaker: speaker ?? msg?.speaker ?? (actor ? ChatMessage.getSpeaker({ actor }) : null),
    rolls: rolls.map((r) => {
      try { return r.toJSON(); } catch { return null; }
    }).filter(Boolean)
  };
  if (!payload.rolls.length) return false;

  game.socket.emit(SOCKET_EVENT, payload);
  return true;
}

export function bindMobileSheetDiceBroadcast() {
  if (bound) return;
  bound = true;
  game.socket.on(SOCKET_EVENT, (data) => { void onSocketMessage(data); });
  Hooks.on("diceSoNiceMessagePreProcess", onDiceSoNiceMessagePreProcess);
  Hooks.on("createChatMessage", (msg) => { void onCreateChatMessage(msg); });
  console.log(`${MODULE_ID} | desktop DSN bridge ready (allowInteractive:false + PreProcess)`);
}
