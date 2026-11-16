import { actorIdFor, readCharacterMapping } from "./character-mapper.mjs";
import { characterIdOf } from "./message.mjs";
import { beyondDebug } from "./debug.mjs";
import { readSetting, SETTING } from "./settings.mjs";

export const ROLL_FULFILLED = "dice/roll/fulfilled";

/** Beyond's set operations: 1 keeps the lowest die, 2 keeps the highest. */
const KEEP = { 1: "kl", 2: "kh" };

export function isRollFulfilled(message) {
  return message?.eventType === ROLL_FULFILLED;
}

function faces(dieType) {
  const value = Number(String(dieType ?? "").replace(/^d/i, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function diceResults(values, keep) {
  const results = values.map((result) => ({ result, active: true }));
  if (!keep || results.length < 2) return results;
  const pick = keep === "kh" ? Math.max(...values) : Math.min(...values);
  const kept = values.indexOf(pick);
  return results.map((entry, index) => (index === kept ? entry : { ...entry, active: false, discarded: true }));
}

/**
 * One Beyond roll → stored Foundry roll data with Beyond's dice already in it.
 * @returns {object|null} data for `Roll.fromData`
 */
export function rollDataFromBeyond(roll) {
  const notation = roll?.diceNotation ?? {};
  const terms = [];
  const formula = [];
  const push = (operator, term, text) => {
    if (terms.length || operator === "-") {
      terms.push({ class: "OperatorTerm", operator, evaluated: true });
      formula.push(operator);
    }
    terms.push(term);
    formula.push(text);
  };

  for (const set of notation.set ?? []) {
    const size = faces(set?.dieType);
    const values = (set?.dice ?? []).map((die) => Number(die?.dieValue)).filter(Number.isFinite);
    if (!size || !values.length) continue;
    const keep = values.length > 1 ? KEEP[set.operation] ?? null : null;
    const modifiers = keep ? [`${keep}1`] : [];
    push(Number(set.count) < 0 ? "-" : "+", {
      class: "Die",
      number: values.length,
      faces: size,
      modifiers,
      results: diceResults(values, keep),
      evaluated: true
    }, `${values.length}d${size}${modifiers.join("")}`);
  }
  const constant = Number(notation.constant ?? roll?.result?.constant) || 0;
  if (constant) push(constant < 0 ? "-" : "+", { class: "NumericTerm", number: Math.abs(constant), evaluated: true }, String(Math.abs(constant)));
  if (!terms.length) return null;

  const total = Number(roll?.result?.total);
  return {
    class: "Roll",
    formula: formula.join(" "),
    terms,
    total: Number.isFinite(total) ? total : summed(terms),
    evaluated: true
  };
}

function summed(terms) {
  let sign = 1;
  let total = 0;
  for (const term of terms) {
    if (term.class === "OperatorTerm") sign = term.operator === "-" ? -1 : 1;
    else if (term.class === "NumericTerm") total += sign * term.number;
    else total += sign * term.results.filter((entry) => entry.active).reduce((sum, entry) => sum + entry.result, 0);
  }
  return total;
}

function label(text) {
  const value = String(text ?? "").trim();
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

/** "Longsword: To Hit (advantage)" */
export function rollFlavor(message) {
  const roll = message?.rolls?.[0] ?? {};
  const kind = String(roll.rollKind ?? "").trim();
  const type = label(roll.rollType === "roll" ? "" : roll.rollType);
  const action = String(message?.action ?? "").trim();
  const head = [action, type].filter(Boolean).join(": ") || "D&D Beyond roll";
  return kind ? `${head} (${kind})` : head;
}

function speakerFor(message, { mapping, actors }) {
  const characterId = characterIdOf(message);
  const actorId = characterId ? actorIdFor(mapping, characterId) : null;
  const actor = actorId ? actors?.get?.(actorId) : null;
  if (actor) return { speaker: ChatMessage.getSpeaker({ actor }), actor };
  const alias = message?.context?.name ?? message?.name ?? "D&D Beyond";
  return { speaker: { alias }, actor: null };
}

/**
 * A finished game-log roll → a Foundry chat message carrying Beyond's dice.
 * Dice animation modules play chat rolls, so the dice roll on screen with Beyond's results.
 */
export async function showBeyondRoll({
  message,
  enabled = readSetting(SETTING.showRolls) !== false,
  mapping = readCharacterMapping(),
  actors = game.actors,
  RollClass = globalThis.Roll,
  createMessage = (data) => ChatMessage.implementation.create(data)
} = {}) {
  if (!enabled) return finish({ ok: false, reason: "disabled" });
  const rolls = (message?.rolls ?? []).map(rollDataFromBeyond).filter(Boolean).map((data) => RollClass.fromData(data));
  if (!rolls.length) return finish({ ok: false, reason: "noDice", id: message?.id ?? null });

  const { speaker, actor } = speakerFor(message, { mapping, actors });
  const data = {
    speaker,
    flavor: rollFlavor(message),
    rolls,
    sound: globalThis.CONFIG?.sounds?.dice,
    flags: { "illusive-dnd-5e": { beyondRoll: { rollId: message?.rollId ?? message?.id ?? null } } }
  };
  if (message?.messageScope === "userId") data.whisper = ChatMessage.getWhisperRecipients?.("GM")?.map((user) => user.id) ?? [];
  await createMessage(data);
  return finish({
    ok: true,
    actor: actor?.name ?? speaker.alias ?? null,
    flavor: data.flavor,
    formulas: rolls.map((roll) => roll.formula),
    totals: rolls.map((roll) => roll.total),
    private: Boolean(data.whisper)
  });
}

function finish(result) {
  beyondDebug("roll", result);
  return result;
}

export function rollHandler(deps = {}) {
  return {
    canHandle: isRollFulfilled,
    handle: (message) => showBeyondRoll({ message, ...deps })
  };
}
