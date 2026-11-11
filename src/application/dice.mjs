/**
 * Dice that players see. Engine-made dice post a chat roll (Dice So Nice animates
 * chat rolls), and saves / checks forced on a creature roll on its owner's client:
 * their dice, their skin, their chat card. Saving throws follow the player or GM
 * setting: physical (GM marks passed or failed), manual (roll dialog), or automated.
 */

import { MODULE_ID } from "../constants.mjs";
import { askGm, canAskGm, registerQuery, queryName } from "../foundry/gm-query.mjs";
import { remoteOwnerFor } from "../foundry/reaction-socket.mjs";
import { illusiveDndLocalize } from "../i18n/index.mjs";

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

const ABILITY_NAMES = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma"
};

function playerOwns(actor) {
  const user = globalThis.game?.user;
  return Boolean(user && !user.isGM && actor?.isOwner === true);
}

/** The player whose save setting applies, or null when the GM's setting does. */
function owningPlayerId(actor) {
  const users = [];
  for (const user of globalThis.game?.users ?? []) {
    if (!user?.id || user.isGM) continue;
    try {
      if (actor?.testUserPermission?.(user, "OWNER") === true) users.push(user);
    } catch {
      /* skip */
    }
  }
  const me = globalThis.game?.user;
  if (playerOwns(actor) && me?.id && !users.some((user) => user.id === me.id)) users.push(me);
  if (!users.length) return null;
  const active = users.filter((user) => user.active);
  const pool = active.length ? active : users;
  if (me?.id && pool.some((user) => user.id === me.id)) return me.id;
  return [...pool].sort((a, b) => String(a.id).localeCompare(String(b.id)))[0].id;
}

const SAVE_ROLL_MODES = new Set(["physical", "manual", "automated"]);

function storedMode(key, fallback) {
  try {
    const value = globalThis.game?.settings?.get?.(MODULE_ID, key);
    return SAVE_ROLL_MODES.has(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

/** Saving throws only. Attacks and checks keep their own dialog rules. */
function saveRollMode(actor) {
  const playerId = owningPlayerId(actor);
  if (!playerId) return storedMode("gmSaveRolls", "automated");
  let modes = {};
  try {
    const stored = globalThis.game?.settings?.get?.(MODULE_ID, "playerSaveRolls");
    if (stored && typeof stored === "object" && !Array.isArray(stored)) modes = stored;
  } catch {
    modes = {};
  }
  return SAVE_ROLL_MODES.has(modes[playerId]) ? modes[playerId] : "physical";
}

function shouldAsk(actor, kind) {
  if (kind === "save") return saveRollMode(actor) === "manual";
  return playerOwns(actor);
}

function physicalVerdict(passed, dc) {
  const success = passed === true;
  const target = Number(dc);
  return {
    physical: true,
    success,
    total: Number.isFinite(target) ? (success ? target : target - 1) : (success ? 1 : 0),
    formula: null
  };
}

function markedPassed(value) {
  return value === true || value === "passed";
}

async function gmPassFailDialog({ name = "Creature", ability = "dex", dc = null, advantage = false, disadvantage = false } = {}) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (!DialogV2?.wait) return false;
  const abilityName = ABILITY_NAMES[ability] ?? String(ability);
  const target = Number(dc);
  let edge = "";
  if (advantage && !disadvantage) edge = ` ${illusiveDndLocalize("save.physicalAdvantage")}`;
  else if (disadvantage && !advantage) edge = ` ${illusiveDndLocalize("save.physicalDisadvantage")}`;
  const dcText = Number.isFinite(target) ? String(target) : "—";
  const content = `<p>${illusiveDndLocalize("save.physicalBody")
    .replace("{name}", name)
    .replace("{ability}", abilityName)
    .replace("{dc}", dcText)}${edge}.</p>`;
  try {
    const choice = await DialogV2.wait({
      window: { title: illusiveDndLocalize("save.physicalTitle") },
      content,
      rejectClose: false,
      modal: true,
      buttons: [
        {
          action: "passed",
          label: illusiveDndLocalize("save.passed"),
          callback: () => true
        },
        {
          action: "failed",
          label: illusiveDndLocalize("save.failed"),
          callback: () => false
        }
      ]
    });
    return markedPassed(choice);
  } catch {
    return false;
  }
}

/** Physical player save: the GM says passed or failed. No digital dice. */
async function physicalSaveVerdict(actor, config = {}) {
  const payload = {
    name: actor?.name ?? "Creature",
    ability: config.ability ?? "dex",
    dc: config.target ?? null,
    advantage: Boolean(config.advantage),
    disadvantage: Boolean(config.disadvantage)
  };
  let passed = false;
  if (globalThis.game?.user?.isGM || !canAskGm()) {
    passed = await gmPassFailDialog(payload);
  } else {
    try {
      passed = markedPassed(await askGm("physicalSave", payload, { timeout: OWNER_ROLL_TIMEOUT_MS }));
    } catch {
      passed = false;
    }
  }
  return physicalVerdict(passed, config.target);
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
  if (data?.physical) return data;
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
  if (kind === "save" && saveRollMode(actor) === "physical") {
    return physicalSaveVerdict(actor, config);
  }
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
  return rollHere(actor, kind, config, { ask: shouldAsk(actor, kind) });
}

/** Owner-side handler (init). */
export function bindOwnerRolls() {
  registerQuery("physicalSave", async (data) => gmPassFailDialog(data ?? {}));
  registerQuery("reactionWindow", async (data) => {
    const { adjudicateReactionQuery } = await import("./reactions/window.mjs");
    return adjudicateReactionQuery(data ?? {});
  });
  registerQuery("reactionUse", async (data) => {
    const { useReactionQuery } = await import("./reactions/window.mjs");
    return useReactionQuery(data ?? {});
  });
  registerQuery("opportunityAttack", async (data) => {
    console.info("illusive-dnd-5e | oa | GM handler", {
      reactor: data?.reactorName ?? null,
      mover: data?.moverName ?? null
    });
    const { adjudicateOpportunityQuery } = await import("./opportunity-attack.mjs");
    return adjudicateOpportunityQuery(data ?? {});
  });
  console.info("illusive-dnd-5e | oa | query registered", {
    ready: typeof globalThis.CONFIG?.queries?.["illusive-dnd-5e.opportunityAttack"] === "function"
  });
  registerQuery("ownerRoll", async ({ actorUuid, kind, config }) => {
    const actor = await globalThis.fromUuid?.(actorUuid);
    if (!actor) return null;
    const roll = await rollHere(actor, kind, config ?? {}, { ask: shouldAsk(actor, kind) });
    if (!roll) return null;
    return typeof roll.toJSON === "function" ? roll.toJSON() : { total: roll.total, formula: roll.formula };
  });
}
