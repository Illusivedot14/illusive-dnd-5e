/**
 * Dice that players see. Engine-made dice post a chat roll (Dice So Nice animates
 * chat rolls), and saves / checks forced on a creature roll on its owner's client:
 * their dice, their skin, their chat card. A player owner rolls through dnd5e's
 * roll dialog; GMs roll NPC saves without one.
 */

import { registerQuery, queryName } from "../foundry/gm-query.mjs";
import { remoteOwnerFor } from "../foundry/reaction-socket.mjs";

const OWNER_ROLL_TIMEOUT_MS = 60000;
const ROLL_METHODS = { save: "rollSavingThrow", check: "rollAbilityCheck" };

function firstRoll(rolls) {
  return Array.isArray(rolls) ? rolls[0] : rolls;
}

/**
 * Roll a formula and post it to chat when it has dice.
 * @returns {Promise<object|null>} the evaluated Roll, or null without Foundry's Roll.
 */
export async function rollVisible(formula, { actor = null, data = null, flavor = undefined } = {}) {
  const RollCls = globalThis.Roll;
  if (!RollCls) return null;
  const rollData = data ?? (typeof actor?.getRollData === "function" ? actor.getRollData() : {});
  const roll = await new RollCls(String(formula), rollData).evaluate();
  if (roll?.dice?.length && typeof roll.toMessage === "function") {
    try {
      const speaker = actor ? globalThis.ChatMessage?.getSpeaker?.({ actor }) : undefined;
      await roll.toMessage({ ...(speaker ? { speaker } : {}), flavor });
    } catch {
      /* chat optional */
    }
  }
  return roll;
}

function playerOwns(actor) {
  const user = globalThis.game?.user;
  return Boolean(user && !user.isGM && actor?.isOwner === true);
}

/**
 * A player who owns the creature clicks the roll themselves; closing the dialog
 * rolls it plainly so the resolution never stalls.
 */
async function rollHere(actor, kind, config, { ask = false } = {}) {
  const method = ROLL_METHODS[kind];
  if (!method || typeof actor?.[method] !== "function") return null;
  if (ask) {
    const asked = firstRoll(await actor[method](config, { configure: true }, {}));
    if (asked) return asked;
  }
  return firstRoll(await actor[method](config, { configure: false }, {}));
}

function reviveRoll(data) {
  if (!data) return null;
  try {
    const revived = globalThis.Roll?.fromData?.(data);
    if (revived) return revived;
  } catch {
    /* plain total below */
  }
  return { total: data.total, formula: data.formula ?? null };
}

/**
 * A save or ability check on the creature's owner's client (active player owner,
 * else the active GM for NPCs). Falls back to rolling here if they don't answer.
 * @param {"save"|"check"} kind
 * @returns {Promise<object|null>} the roll (`total`, `formula`), or null.
 */
export async function rollAsOwner(actor, kind, config = {}) {
  const owner = globalThis.game?.user && actor?.uuid ? remoteOwnerFor(actor) : null;
  if (owner && typeof owner.query === "function") {
    const { event: _event, ...portable } = config;
    try {
      const data = await owner.query(
        queryName("ownerRoll"),
        { actorUuid: actor.uuid, kind, config: portable },
        { timeout: OWNER_ROLL_TIMEOUT_MS }
      );
      const roll = reviveRoll(data);
      if (roll) return roll;
    } catch {
      /* owner gone: roll here */
    }
    return rollHere(actor, kind, config);
  }
  return rollHere(actor, kind, config, { ask: playerOwns(actor) });
}

/** Owner-side handler (init). */
export function bindOwnerRolls() {
  registerQuery("ownerRoll", async ({ actorUuid, kind, config }) => {
    const actor = await globalThis.fromUuid?.(actorUuid);
    if (!actor) return null;
    const roll = await rollHere(actor, kind, config ?? {}, { ask: playerOwns(actor) });
    if (!roll) return null;
    return typeof roll.toJSON === "function" ? roll.toJSON() : { total: roll.total, formula: roll.formula };
  });
}
