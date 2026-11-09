import { MODULE_ID } from "../../../constants.mjs";
import { illusiveDnd } from "../../../i18n/index.mjs";
import {
  swipeStyleEvaluateAndToMessage,
  broadcastDiceSoNiceToOthers
} from "./mobile-sheet-dsn.mjs";
import {
  pickRollModeOverlay,
  pickAttackOrDamageOverlay,
  openHpDialogOverlay,
  openItemDetailOverlay,
  openAccentColorOverlay,
  openDiceSoNiceSettings,
  withSheetDropped
} from "./mobile-sheet-dialogs.mjs";
import { canUseItem } from "./mobile-sheet-data.mjs";
import { ensureMobileSheetStyles } from "./mobile-sheet-styles.mjs";
import { useActivityFromHud } from "../../../application/activity.mjs";
import { listActivities, requiresCanvasTargets } from "../../../application/ability.mjs";
import { findTokenForActor } from "../../../application/reaction-context.mjs";
import {
  applyDeathSaveResult,
  toggleActorInspiration,
  toggleDeathSavePip
} from "../../../application/party-combat.mjs";
import { runRest } from "../../../application/rest.mjs";
import { pickCastSlotLevel } from "../action-bar/action-bar-cast-picker.mjs";
import { startMobileTargetUse } from "./mobile-target-pick.mjs";
import { pullActorFromDdb, readDdbCharacterUrl } from "../../../foundry/ddb-pull.mjs";

function signed(n) {
  const v = Number(n) || 0;
  return v >= 0 ? `+ ${v}` : `- ${Math.abs(v)}`;
}

async function pickRollMode(title) {
  ensureMobileSheetStyles();
  return withSheetDropped(() => pickRollModeOverlay(title));
}

async function pickAttackOrDamage(title) {
  ensureMobileSheetStyles();
  return withSheetDropped(() => pickAttackOrDamageOverlay(title));
}

function d20Formula(modTotal, mode) {
  const bonus = signed(modTotal);
  if (mode === "advantage") return `2d20kh1 ${bonus}`;
  if (mode === "disadvantage") return `2d20kl1 ${bonus}`;
  return `1d20 ${bonus}`;
}

function d20Dice(mode) {
  if (mode === "advantage") return "2d20kh1";
  if (mode === "disadvantage") return "2d20kl1";
  return "1d20";
}

function abilityMod(actor, abilityId, type /* check|save */) {
  const ab = actor.system?.abilities?.[abilityId];
  if (!ab) return 0;
  if (type === "save") {
    const save = ab.save?.value ?? ab.save;
    if (typeof save === "number") return save;
    return Number(ab.mod) || 0;
  }
  return Number(ab.mod) || 0;
}

function skillMod(actor, skillId) {
  const sk = actor.system?.skills?.[skillId];
  return Number(sk?.total ?? sk?.mod) || 0;
}

async function rollMobileD20(actor, kind, id) {
  if (!actor?.isOwner) {
    ui.notifications.warn(illusiveDnd.warning("noOwner"));
    return false;
  }
  if (!id) return false;

  let mod = 0;
  let flavor = "";
  if (kind === "check") {
    mod = abilityMod(actor, id, "check");
    flavor = `${CONFIG.DND5E?.abilities?.[id]?.label ?? id} Check`;
  } else if (kind === "save") {
    mod = abilityMod(actor, id, "save");
    flavor = `${CONFIG.DND5E?.abilities?.[id]?.label ?? id} Saving Throw`;
  } else if (kind === "skill") {
    mod = skillMod(actor, id);
    flavor = CONFIG.DND5E?.skills?.[id]?.label ?? id;
  } else {
    return false;
  }

  const mode = await pickRollMode(flavor);
  if (!mode) return false;

  await swipeStyleEvaluateAndToMessage(d20Formula(mod, mode), {
    data: actor.getRollData?.() ?? {},
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor
  });
  return true;
}

function getAttackActivity(item) {
  const acts = listActivities(item);
  return acts.find((a) => a.type === "attack" && typeof a.use === "function")
    ?? acts.find((a) => a.type === "attack" && typeof a.rollAttack === "function")
    ?? acts.find((a) => typeof a.rollAttack === "function")
    ?? null;
}

function getPrimaryUseActivity(item) {
  const acts = listActivities(item);
  return acts.find((a) => typeof a.use === "function")
    ?? acts.find((a) => typeof a.rollAttack === "function")
    ?? acts[0]
    ?? null;
}

function getDamageActivity(item) {
  const acts = listActivities(item);
  return acts.find((a) => a.type === "damage" || a.type === "heal")
    ?? getAttackActivity(item)
    ?? acts.find((a) => a.damage?.parts?.length || a.damage)
    ?? null;
}

function parseModifierNumber(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const m = String(value).trim().match(/^[+-]?\d+/);
  return m ? Number(m[0]) : null;
}

function partToFormula(part) {
  if (!part) return null;
  if (typeof part === "string") return part.trim() || null;
  if (Array.isArray(part)) {
    // dnd5e legacy [formula, type]
    const f = part[0];
    return typeof f === "string" && f.trim() ? f.trim() : null;
  }
  if (typeof part === "object") {
    const f = part.formula ?? part.custom?.formula ?? part.number;
    if (typeof f === "string" && f.trim()) return f.trim();
    if (typeof part.denomination === "number" && part.number != null) {
      return `${part.number}d${part.denomination}${part.bonus ? ` + ${part.bonus}` : ""}`;
    }
  }
  return null;
}

function collectDamageFormula(item, activity) {
  // Modern activity API
  if (activity && typeof activity.getDamageData === "function") {
    try {
      const data = activity.getDamageData({});
      const parts = (data?.parts ?? data?.rolls ?? []).map(partToFormula).filter(Boolean);
      if (parts.length) return { formula: parts.join(" + "), data: data?.data ?? {} };
    } catch (err) {
      console.warn(`${MODULE_ID} | getDamageData failed`, err);
    }
  }

  const actParts = Array.isArray(activity?.damage?.parts)
    ? activity.damage.parts
    : Array.isArray(activity?.damage?.value)
      ? activity.damage.value
      : null;
  if (Array.isArray(actParts)) {
    const parts = actParts.map(partToFormula).filter(Boolean);
    if (parts.length) return { formula: parts.join(" + "), data: {} };
  }

  // Legacy item.system.damage
  const sysParts = item.system?.damage?.parts;
  if (Array.isArray(sysParts)) {
    const parts = sysParts.map(partToFormula).filter(Boolean);
    if (parts.length) return { formula: parts.join(" + "), data: {} };
  }

  const label = item.labels?.damage ?? item.labels?.derivedDamage?.[0]?.formula;
  if (typeof label === "string" && label.trim()) return { formula: label.trim(), data: {} };

  return null;
}

/**
 * Weapons: choose Attack or Damage.
 * Attack → Adv/Normal/Disadv then d20.
 * Damage → weapon damage formula to chat (+ desktop DSN).
 */
async function rollMobileWeapon(actor, item) {
  const choice = await pickAttackOrDamage(item.name);
  if (!choice) return false;
  if (choice === "damage") return rollMobileDamage(actor, item);
  return rollMobileAttack(actor, item);
}

async function rollMobileDamage(actor, item) {
  if (!actor?.isOwner) {
    ui.notifications.warn(illusiveDnd.warning("noOwner"));
    return false;
  }
  const activity = getDamageActivity(item);
  const found = collectDamageFormula(item, activity);
  if (!found?.formula) {
    ui.notifications.warn("No damage formula on that item.");
    return false;
  }

  const data = {
    ...(actor.getRollData?.() ?? {}),
    ...(found.data ?? {})
  };

  await swipeStyleEvaluateAndToMessage(found.formula, {
    data,
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${item.name} — Damage`
  });
  return true;
}

/**
 * Attack roll: Adv / Normal / Disadv, then roll to chat (+ desktop DSN).
 */
async function rollMobileAttack(actor, item) {
  const activity = getAttackActivity(item);
  const title = `${item.name} Attack`;
  const mode = await pickRollMode(title);
  if (!mode) return false;

  let formula = null;
  let data = actor.getRollData?.() ?? {};

  if (activity && typeof activity.getAttackData === "function") {
    try {
      const attackData = activity.getAttackData({});
      const parts = (attackData.parts ?? []).filter(Boolean);
      data = { ...data, ...(attackData.data ?? {}) };
      formula = [d20Dice(mode), ...parts].join(" + ");
    } catch (err) {
      console.warn(`${MODULE_ID} | getAttackData failed, falling back`, err);
    }
  }

  if (!formula) {
    const mod = parseModifierNumber(
      activity?.labels?.modifier
      ?? item.labels?.modifier
      ?? item.labels?.toHit
      ?? activity?.attack?.bonus
    ) ?? 0;
    formula = d20Formula(mod, mode);
  }

  await swipeStyleEvaluateAndToMessage(formula, {
    data,
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${item.name} — Attack`
  });
  return true;
}

/** Tap item: open detail overlay with description + bottom actions. */
async function inspectAndActItem(actor, itemId, event) {
  const item = actor.items.get(itemId);
  if (!item) {
    ui.notifications.warn("Item not found.");
    return false;
  }

  const showAttack = Boolean(item.type === "weapon" || getAttackActivity(item));
  const showDamage = Boolean(getDamageActivity(item) || (item.type === "weapon" && getAttackActivity(item)));
  const mode = item.system?.preparation?.mode;
  const always = ["always", "innate", "atwill", "pact"].includes(mode);
  const canPrepare = item.type === "spell"
    && !always
    && (mode === "prepared" || (mode == null && Number(item.system?.level ?? 0) > 0));
  const prepared = always || Boolean(item.system?.preparation?.prepared);
  // Prefer localized CONFIG labels; fall back to capitalized type key.
  let typeBit = "";
  try {
    if (item.type === "feat") {
      const value = item.system?.type?.value;
      const label = value ? CONFIG.DND5E?.featureTypes?.[value]?.label : null;
      typeBit = label ? game.i18n.localize(label) : "Feat";
    } else if (CONFIG.Item?.typeLabels?.[item.type]) {
      typeBit = game.i18n.localize(CONFIG.Item.typeLabels[item.type]);
    } else if (item.type) {
      typeBit = item.type.charAt(0).toUpperCase() + item.type.slice(1);
    }
  } catch {
    typeBit = item.type ? item.type.charAt(0).toUpperCase() + item.type.slice(1) : "";
  }

  const choice = await withSheetDropped(() => openItemDetailOverlay(item, {
    subtitle: typeBit,
    canUse: canUseItem(item),
    canEquip: "equipped" in (item.system ?? {}),
    equipped: Boolean(item.system?.equipped),
    showAttack,
    showDamage: showDamage || showAttack,
    canPrepare,
    prepared
  }));
  if (!choice) return false;

  try {
    if (choice === "equip") {
      await item.update({ "system.equipped": !item.system.equipped });
      return true;
    }
    if (choice === "prepare") {
      await item.update({ "system.preparation.prepared": !prepared });
      return true;
    }
    if (choice === "attack") return rollMobileAttack(actor, item);
    if (choice === "damage") return rollMobileDamage(actor, item);
    if (choice === "use") return useItemLikeSheet(actor, item, event);
    return false;
  } catch (err) {
    console.error(`${MODULE_ID} | mobile inspect-item failed`, itemId, err);
    ui.notifications.error("Could not use that item.");
    return false;
  }
}

/**
 * Same fire path as the action bar (`useActivityFromHud`).
 * If the use needs people, close the sheet and pick from a range list first.
 */
async function useItemLikeSheet(actor, item, event) {
  const activity = getPrimaryUseActivity(item);
  const token = findTokenForActor(actor, { preferControlled: true }) ?? { actor };
  const section = activity?.activation?.type ?? item?.system?.activation?.type ?? "action";

  if (requiresCanvasTargets(item, activity)) {
    let spellLevel = null;
    if (item && (activity?.type === "cast" || item.type === "spell")) {
      const pick = await withSheetDropped(() => pickCastSlotLevel(actor, item, activity));
      if (pick.cancelled) return false;
      spellLevel = pick.level;
    }
    return startMobileTargetUse({ actor, token, item, activity, section, event, spellLevel });
  }

  return useActivityFromHud(token, item, activity, section, event, {}, {
    validateTargets: false,
    clearTargets: false
  });
}

/** Same as Amethyst: rollInitiativeDialog, else rollInitiative({ createCombatants: true }). */
async function rollInitiativeLikeAmethyst(actor) {
  return withSheetDropped(async () => {
    try {
      if (typeof actor.rollInitiativeDialog === "function") {
        await actor.rollInitiativeDialog();
        return true;
      }
      if (typeof actor.rollInitiative === "function") {
        const result = await actor.rollInitiative({ createCombatants: true, rerollInitiative: true });
        await broadcastDiceSoNiceToOthers(result, {
          actor,
          speaker: ChatMessage.getSpeaker({ actor })
        });
        return true;
      }
      const total = Number(actor.system?.attributes?.init?.total) || 0;
      await swipeStyleEvaluateAndToMessage(d20Formula(total, "normal"), {
        data: actor.getRollData?.() ?? {},
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: "Initiative"
      });
      return true;
    } catch (err) {
      console.error(`${MODULE_ID} | initiative roll failed`, err);
      ui.notifications.error("Initiative roll failed.");
      return false;
    }
  });
}

/**
 * Use dnd5e's rollDeathSave so successes/failures/crit revive actually apply.
 * Adv/Disadv via our overlay (system configure dialog skipped).
 */
async function rollDeathSaveLikeSystem(actor) {
  if (!actor?.isOwner) {
    ui.notifications.warn(illusiveDnd.warning("noOwner"));
    return false;
  }

  const mode = await pickRollMode("Death Save");
  if (!mode) return false;

  const advantage = mode === "advantage";
  const disadvantage = mode === "disadvantage";
  const ADV = CONFIG.Dice?.D20Roll?.ADV_MODE;
  const advantageMode = advantage
    ? (ADV?.ADVANTAGE ?? 1)
    : disadvantage
      ? (ADV?.DISADVANTAGE ?? -1)
      : (ADV?.NORMAL ?? 0);

  try {
    if (typeof actor.rollDeathSave === "function") {
      const rolls = await actor.rollDeathSave(
        {
          advantage,
          disadvantage,
          rolls: [{ options: { advantage, disadvantage, advantageMode } }]
        },
        { configure: false },
        {
          data: {
            speaker: ChatMessage.getSpeaker({ actor }),
            flags: { [MODULE_ID]: { mobileSheetDsn: true } }
          }
        }
      );
      if (!rolls) return false;
      await broadcastDiceSoNiceToOthers(rolls, {
        actor,
        speaker: ChatMessage.getSpeaker({ actor })
      });
      return true;
    }

    // Fallback if system API missing: roll + apply DC 10 manually
    const { roll } = await swipeStyleEvaluateAndToMessage(d20Formula(0, mode), {
      data: actor.getRollData?.() ?? {},
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: "Death Saving Throw"
    });
    await applyDeathSaveResult(actor, roll);
    return true;
  } catch (err) {
    console.error(`${MODULE_ID} | death save failed`, err);
    ui.notifications.error("Death save failed.");
    return false;
  }
}

async function openHpDialogFixed(actor) {
  ensureMobileSheetStyles();
  return withSheetDropped(() => openHpDialogOverlay(actor));
}

export async function handleMobileSheetAction(actor, action, dataset, event) {
  if (!actor) return false;

  if (!actor.isOwner && !["close", "open-dndbeyond", "pull-dndbeyond", "open-dice-settings", "open-ui-color"].includes(action)) {
    ui.notifications.warn(illusiveDnd.warning("noOwner"));
    return false;
  }

  switch (action) {
    case "roll-check":
      return rollMobileD20(actor, "check", dataset.ability);
    case "roll-save":
      return rollMobileD20(actor, "save", dataset.ability);
    case "roll-skill":
      return rollMobileD20(actor, "skill", dataset.skill);
    case "roll-initiative":
      return rollInitiativeLikeAmethyst(actor);
    case "roll-death-save":
      return rollDeathSaveLikeSystem(actor);
    case "set-death-pip": {
      const type = dataset.type === "failure" ? "failure" : "success";
      const index = Number(dataset.index);
      return toggleDeathSavePip(actor, type, index);
    }
    case "toggle-inspiration":
      return toggleActorInspiration(actor);
    case "open-hp":
      return openHpDialogFixed(actor);
    case "inspect-item":
    case "use-item":
      return inspectAndActItem(actor, dataset.itemId, event);
    case "toggle-equipped": {
      const item = actor.items.get(dataset.itemId);
      if (!item || !("equipped" in (item.system ?? {}))) return false;
      await item.update({ "system.equipped": !item.system.equipped });
      return true;
    }
    case "toggle-prepared": {
      const item = actor.items.get(dataset.itemId);
      if (!item || item.type !== "spell") return false;
      const prepared = Boolean(item.system?.preparation?.prepared);
      await item.update({ "system.preparation.prepared": !prepared });
      return true;
    }
    case "toggle-effect": {
      const effect = actor.effects.get(dataset.effectId);
      if (!effect) return false;
      await effect.update({ disabled: !effect.disabled });
      return true;
    }
    case "delete-effect": {
      const effect = actor.effects.get(dataset.effectId);
      if (!effect) return false;
      await effect.delete();
      return true;
    }
    case "short-rest":
      return withSheetDropped(() => runRest(actor, "short"));
    case "long-rest":
      return withSheetDropped(() => runRest(actor, "long"));
    case "open-dndbeyond":
      return openDndBeyondCharacter(actor);
    case "pull-dndbeyond":
      return pullDndBeyondCharacter(actor);
    case "open-dice-settings":
      await withSheetDropped(() => openDiceSoNiceSettings());
      return true;
    case "open-ui-color":
      await withSheetDropped(() => openAccentColorOverlay());
      return true;
    default:
      return false;
  }
}

/**
 * Open the actor's D&D Beyond character page (ddb-importer flags).
 * Does not open Foundry's full sheet — that sits under the mobile overlay and is unused here.
 */
async function pullDndBeyondCharacter(actor) {
  ui.notifications?.info?.(illusiveDnd.warning("ddbPulling"));
  const result = await pullActorFromDdb(actor);
  if (result.ok) {
    ui.notifications?.info?.(illusiveDnd.warning("ddbPulled"));
    return true;
  }
  const key = {
    noImporter: "ddbNoImporter",
    noLink: "ddbNoLink",
    noOwner: "noOwner",
    noGm: "ddbNoGm"
  }[result.reason] ?? "ddbFailed";
  ui.notifications?.warn?.(illusiveDnd.warning(key));
  return false;
}

function openDndBeyondCharacter(actor) {
  const url = readDdbCharacterUrl(actor);

  if (!url) {
    ui.notifications?.warn?.(
      "No D&D Beyond link on this actor. Import/link it with ddb-importer first."
    );
    return false;
  }

  window.open(url, "_blank", "noopener,noreferrer");
  return false;
}

export const MOBILE_SHEET_NO_REFRESH = new Set([
  "roll-check",
  "roll-save",
  "roll-skill",
  "roll-initiative",
  "toggle-inspiration"
]);
