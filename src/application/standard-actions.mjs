import { MODULE_ID } from "../constants.mjs";
import { illusiveDnd } from "../i18n/index.mjs";
import { markEconomyUsed, spendBasicAction } from "./economy.mjs";
import { isTokenInCombat } from "./action-economy.mjs";
import { markDisengaging } from "./opportunity-attack.mjs";
import { recordStandardActionOnGameLog } from "./combat-game-log.mjs";
import { listActivities } from "../domain/combat/activity-kind.mjs";
import { setReadiedAction, tickPendingHitRiders } from "./reactions/reaction-state.mjs";
import { createEmbedded, setDocFlag, unsetDocFlag } from "../foundry/write-gateway.mjs";
import { isPrimaryWriter } from "../foundry/gm-query.mjs";

const BASIC_BUDGET_ACTIONS = new Set(["dash", "disengage", "dodge", "ready"]);

export const STANDARD_ACTION_IDS = ["dash", "disengage", "dodge", "help", "hide", "ready"];

const STANDARD_ACTION_ICONS = {
  dash: "systems/dnd5e/icons/svg/activity/forward.svg",
  disengage: "systems/dnd5e/icons/svg/activity/utility.svg",
  dodge: "systems/dnd5e/icons/svg/statuses/dodging.svg",
  help: "icons/svg/aura.svg",
  hide: "systems/dnd5e/icons/svg/statuses/hiding.svg",
  ready: "systems/dnd5e/icons/svg/activity/order.svg"
};

export function buildStandardActions(actor, context = {}) {
  if (!actor || context.inCombat === false) return [];

  return STANDARD_ACTION_IDS.map((id) => ({
    id,
    itemId: `standard:${id}`,
    activityId: "",
    section: "action",
    activationType: "action",
    name: illusiveDnd.action(id),
    img: STANDARD_ACTION_ICONS[id],
    needsTarget: id === "help",
    hasTargets: id === "help" ? (game.user.targets?.size ?? 0) > 0 : false,
    disabled: false,
    disabledReason: null,
    title: illusiveDnd.action(id),
    isStandard: true
  }));
}

/** @returns {Promise<string[]>} created effect uuids */
async function createRoundEffect(actor, name, icon, statuses = []) {
  const combat = game.combat;
  const made = await createEmbedded(actor, "ActiveEffect", [{
    name,
    icon,
    statuses,
    duration: combat?.started
      ? { rounds: 1, startRound: combat.round, startTurn: combat.turn }
      : { seconds: 6 }
  }]);
  return made.uuids ?? [];
}

function effectChange(actor, tokenUuid, effectUuids) {
  if (!effectUuids?.length) return null;
  return {
    type: "effect",
    actorUuid: actor?.uuid ?? null,
    tokenUuid: tokenUuid ?? null,
    effectUuids: [...effectUuids]
  };
}

/**
 * Shared spend + chat closeout.
 * `afterSpend` may return an array of appliedChanges for game-log undo.
 */
async function finishStandard(token, actionId, chat, afterSpend) {
  const actor = token.actor;
  const tokenUuid = token.document?.uuid ?? token.uuid ?? null;
  let economySpend = null;
  if (isTokenInCombat(token)) {
    economySpend = BASIC_BUDGET_ACTIONS.has(actionId)
      ? await spendBasicAction(actor, actionId)
      : await markEconomyUsed(actor, "action");
  }
  const fromAfter = await afterSpend?.();
  const appliedChanges = Array.isArray(fromAfter)
    ? fromAfter.filter(Boolean)
    : (fromAfter?.appliedChanges ?? []).filter(Boolean);

  if (isTokenInCombat(token)) {
    recordStandardActionOnGameLog({
      actionId,
      label: illusiveDnd.action(actionId),
      detail: chat,
      tokenUuid,
      actorUuid: actor?.uuid ?? null,
      appliedChanges,
      economySpend
    });
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor, token: token.document }),
    content: `<strong>${illusiveDnd.action(actionId)}</strong> — ${chat}`
  });
  return true;
}

function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  })[c]);
}

/** Action-cost activities worth readying (attacks, spells, saves, damage). */
function readyableActivities(actor) {
  const out = [];
  for (const item of actor?.items ?? []) {
    for (const act of listActivities(item)) {
      if (act?.activation?.type !== "action") continue;
      if (!["attack", "save", "damage", "cast", "utility"].includes(act.type)) continue;
      if (item.type !== "spell" && item.type !== "weapon" && act.type === "utility") continue;
      out.push({ item, act });
    }
  }
  return out;
}

function defaultReadyRange(item, act) {
  const range = Number(act?.range?.value ?? item?.system?.range?.value);
  const reach = Number(item?.system?.range?.reach);
  if (item?.type === "weapon" && !Number.isFinite(range)) return Number.isFinite(reach) ? reach : 5;
  return Number.isFinite(range) && range > 0 ? range : 5;
}

/** @returns {Promise<import("./reactions/reaction-state.mjs").ReadiedAction|null>} */
async function promptReadiedAction(actor, title) {
  const DialogV2 = foundry.applications.api.DialogV2;
  const choices = readyableActivities(actor);
  const triggers = [
    ["move", illusiveDnd.action("readyTriggerMove")],
    ["cast", illusiveDnd.action("readyTriggerCast")],
    ["attack", illusiveDnd.action("readyTriggerAttack")],
    ["manual", illusiveDnd.action("readyTriggerManual")]
  ];
  const activityOptions = choices.map(({ item, act }, i) => {
    const name = act.name && act.name !== item.name ? `${item.name} — ${act.name}` : item.name;
    return `<option value="${i}">${escapeText(name)}</option>`;
  }).join("");
  const content = `
    <div class="form-group"><label>${illusiveDnd.action("readyTrigger")}</label>
      <select name="trigger">${triggers.map(([v, l]) => `<option value="${v}">${escapeText(l)}</option>`).join("")}</select></div>
    <div class="form-group"><label>${illusiveDnd.action("readyActivity")}</label>
      <select name="activity"><option value="">—</option>${activityOptions}</select></div>
    <div class="form-group"><label>${illusiveDnd.action("readyRange")}</label>
      <input type="number" name="range" min="0" step="5" placeholder="auto"></div>
    <div class="form-group stacked"><label>${illusiveDnd.action("readyPrompt")}</label>
      <textarea name="text" rows="2"></textarea></div>`;

  const data = await DialogV2.wait({
    window: { title },
    content,
    rejectClose: false,
    buttons: [
      {
        action: "ok",
        label: illusiveDnd.ui("ready"),
        icon: "fas fa-check",
        default: true,
        callback: (_event, button) => {
          const form = button.form;
          return {
            trigger: form.elements.trigger.value,
            activity: form.elements.activity.value,
            range: form.elements.range.value,
            text: form.elements.text.value.trim()
          };
        }
      },
      { action: "cancel", label: illusiveDnd.ui("cancel"), icon: "fas fa-times" }
    ]
  });
  if (!data || data === "cancel") return null;
  const pick = data.activity !== "" ? choices[Number(data.activity)] : null;
  if (!pick && !data.text) return null;
  const range = Number(data.range);
  return {
    text: data.text,
    trigger: pick ? data.trigger : "manual",
    itemId: pick?.item.id ?? null,
    activityId: pick?.act.id ?? null,
    rangeFeet: Number.isFinite(range) && data.range !== "" ? range : (pick ? defaultReadyRange(pick.item, pick.act) : null)
  };
}

export async function executeStandardAction(token, actionId) {
  const actor = token?.actor;
  if (!actor?.isOwner) {
    ui.notifications.warn(illusiveDnd.warning("noOwner"));
    return false;
  }

  const label = illusiveDnd.action(actionId);
  const selfUuid = token.document?.uuid ?? token.uuid ?? null;

  switch (actionId) {
    case "dash":
      return finishStandard(token, actionId, `${actor.name} doubles movement this turn.`);

    case "disengage":
      return finishStandard(token, actionId, `${actor.name} avoids opportunity attacks until their next turn.`, async () => {
        const effectUuids = await createRoundEffect(actor, label, STANDARD_ACTION_ICONS.disengage);
        await markDisengaging(actor, true);
        return [effectChange(actor, selfUuid, effectUuids)].filter(Boolean);
      });

    case "dodge":
      return finishStandard(token, actionId, `${actor.name} is dodging.`, async () => {
        const effectUuids = await createRoundEffect(
          actor,
          label,
          STANDARD_ACTION_ICONS.dodge,
          ["dodging"]
        );
        return [effectChange(actor, selfUuid, effectUuids)].filter(Boolean);
      });

    case "help": {
      const target = [...(game.user.targets ?? [])][0];
      if (!target?.actor) {
        ui.notifications.warn(illusiveDnd.warning("needAlly"));
        return false;
      }
      return finishStandard(token, actionId, `${actor.name} helps ${target.name} (advantage on the next attack or check).`, async () => {
        const effectUuids = await createRoundEffect(
          target.actor,
          `${label} from ${actor.name}`,
          STANDARD_ACTION_ICONS.help
        );
        await setDocFlag(target.actor, MODULE_ID, "helpedBy", {
          helperUuid: actor.uuid,
          attackerUuid: null
        });
        return [effectChange(
          target.actor,
          target.document?.uuid ?? target.uuid ?? null,
          effectUuids
        )].filter(Boolean);
      });
    }

    case "hide":
      return finishStandard(token, actionId, `${actor.name} attempts to hide.`, async () => {
        const effectUuids = await createRoundEffect(
          actor,
          label,
          STANDARD_ACTION_ICONS.hide,
          ["hiding"]
        );
        return [effectChange(actor, selfUuid, effectUuids)].filter(Boolean);
      });

    case "ready": {
      const readied = await promptReadiedAction(actor, label);
      if (!readied) return false;
      const act = readied.itemId ? actor.items.get(readied.itemId) : null;
      const chat = [act?.name, readied.text].filter(Boolean).join(": ") || label;
      return finishStandard(token, actionId, `${actor.name} readies ${chat}`, () =>
        setReadiedAction(actor, readied));
    }

    default:
      return false;
  }
}

/**
 * Turn start for this actor. Legacy turn fluff (budget owns dashed/disengaged); a readied
 * action lapses; reaction hit riders arm or expire. One writer: the active GM, else an owner.
 */
export async function clearTurnFlags(actor) {
  if (!actor) return;
  const writer = game.users?.activeGM ? isPrimaryWriter() : actor.isOwner;
  if (!writer) return;
  for (const key of ["dashing", "readied", "weaponSwings", "disengaging"]) {
    await unsetDocFlag(actor, MODULE_ID, key);
  }
  await tickPendingHitRiders(actor);
}
