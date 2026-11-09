import { illusiveDnd } from "../../../i18n/index.mjs";
import { ABILITY_ORDER, SKILL_ORDER, abilityLabel, formatMod, skillLabel } from "../../../foundry/actor-stats.mjs";

function toolLabel(id, fallback = null) {
  const lookup = CONFIG.DND5E?.enrichmentLookup?.tools?.[id]?.label
    ?? CONFIG.DND5E?.toolProficiencies?.[id]
    ?? CONFIG.DND5E?.vehicleTypes?.[id]
    ?? CONFIG.DND5E?.tools?.[id];
  if (typeof lookup === "string" && !lookup.startsWith("Compendium.")) {
    const loc = game.i18n?.localize?.(lookup);
    if (loc && loc !== lookup) return loc;
    if (!lookup.includes(".")) return lookup;
  }
  return fallback || id;
}

function collectToolEntries(actor) {
  const seen = new Set();
  const tools = [];

  for (const [id, data] of Object.entries(actor.system?.tools ?? {})) {
    if (!id || data == null) continue;
    seen.add(id);
    const total = data.total ?? data.mod;
    tools.push({
      id,
      type: "tool",
      label: toolLabel(id),
      mod: total,
      modLabel: formatMod(total)
    });
  }

  for (const item of actor.items ?? []) {
    if (item?.type !== "tool") continue;
    const key = item.system?.type?.baseItem || item.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const total = item.system?.total ?? actor.system?.tools?.[key]?.total;
    tools.push({
      id: key,
      type: "tool",
      label: item.name || toolLabel(key),
      mod: total,
      modLabel: formatMod(total)
    });
  }

  tools.sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { sensitivity: "base" }));
  return tools;
}

export function buildDrawerEntries(actor) {
  if (!actor) return { checks: [], skills: [], saves: [], tools: [] };

  const checks = ABILITY_ORDER.filter((id) => actor.system?.abilities?.[id]).map((id) => ({
    id,
    type: "check",
    label: illusiveDnd.actionBar("checkLabel", { ability: abilityLabel(id) }),
    mod: actor.system.abilities[id]?.mod,
    modLabel: formatMod(actor.system.abilities[id]?.mod)
  }));

  const skills = SKILL_ORDER.filter((id) => actor.system?.skills?.[id]).map((id) => ({
    id,
    type: "skill",
    label: skillLabel(id),
    mod: actor.system.skills[id]?.total ?? actor.system.skills[id]?.mod,
    modLabel: formatMod(actor.system.skills[id]?.total ?? actor.system.skills[id]?.mod)
  }));

  const saves = ABILITY_ORDER.filter((id) => actor.system?.abilities?.[id]).map((id) => ({
    id,
    type: "save",
    label: illusiveDnd.actionBar("saveLabel", { ability: abilityLabel(id) }),
    mod: actor.system.abilities[id]?.save?.value
      ?? actor.system.abilities[id]?.save
      ?? actor.system.abilities[id]?.mod,
    modLabel: formatMod(
      actor.system.abilities[id]?.save?.value
      ?? actor.system.abilities[id]?.save
      ?? actor.system.abilities[id]?.mod
    )
  }));

  const tools = collectToolEntries(actor);

  return { checks, skills, saves, tools };
}

/** Show Advantage / Normal / Disadvantage unless the sheet skip-dialog keys are held. */
function buildD20Dialog(event) {
  const areKeysPressed = game.system?.utils?.areKeysPressed;
  if (typeof areKeysPressed === "function" && event) {
    const skip = ["skipDialogNormal", "skipDialogAdvantage", "skipDialogDisadvantage"]
      .some((action) => areKeysPressed(event, action));
    if (skip) return {};
  }
  return { configure: true };
}

function skillAbility(actor, skillId) {
  return actor?.system?.skills?.[skillId]?.ability
    ?? CONFIG?.DND5E?.skills?.[skillId]?.ability
    ?? null;
}

function applyCheckMods(config, mods) {
  if (mods.disadvantage && !mods.advantage) {
    config.disadvantage = true;
    config.advantage = false;
  } else if (mods.advantage && !mods.disadvantage) {
    config.advantage = true;
    config.disadvantage = false;
  }
  return config;
}

export async function rollDrawerEntry(actor, entry, event = null) {
  if (!actor?.isOwner) {
    ui.notifications.warn(illusiveDnd.warning("noOwner"));
    return false;
  }

  const dialog = buildD20Dialog(event);
  const message = { create: true };

  // Lazy import keeps drawer load light; modifiers cover Hex / poisoned / restrained.
  const { collectAbilityCheckModifiers, collectSaveModifiers, consumeRollAdvantage } = await import(
    "../../../application/roll-modifiers.mjs"
  );

  if (entry.type === "check") {
    const mods = collectAbilityCheckModifiers({ actor, ability: entry.id });
    const config = applyCheckMods({ ability: entry.id, event }, mods);
    const rolls = typeof actor.rollAbilityCheck === "function"
      ? await actor.rollAbilityCheck(config, dialog, message)
      : await actor.rollAbilityTest?.(config, dialog, message);
    if (rolls) await consumeRollAdvantage(actor, mods.reasons);
    return true;
  }

  if (entry.type === "skill") {
    const ability = skillAbility(actor, entry.id);
    const mods = collectAbilityCheckModifiers({ actor, ability });
    const config = applyCheckMods({ skill: entry.id, event }, mods);
    if (await actor.rollSkill(config, dialog, message)) await consumeRollAdvantage(actor, mods.reasons);
    return true;
  }

  if (entry.type === "save") {
    const mods = collectSaveModifiers({ actor, ability: entry.id });
    const config = applyCheckMods({ ability: entry.id, event }, mods);
    const rolls = typeof actor.rollSavingThrow === "function"
      ? await actor.rollSavingThrow(config, dialog, message)
      : await actor.rollAbilitySave?.(config, dialog, message);
    if (rolls) await consumeRollAdvantage(actor, mods.reasons);
    return true;
  }

  if (entry.type === "tool") {
    if (typeof actor.rollToolCheck === "function") {
      await actor.rollToolCheck({ tool: entry.id, event }, dialog, message);
      return true;
    }
    const item = actor.items?.get?.(entry.id);
    if (!item) return false;
    if (typeof item.rollToolCheck === "function") {
      await item.rollToolCheck({ tool: entry.id, event }, dialog, message);
    } else {
      await item.roll?.({ event }, dialog, message);
    }
    return true;
  }

  return false;
}
