import { MODULE_ID } from "../constants.mjs";
import { illusiveDndMenu } from "../i18n/labels.mjs";
import { registerBeyondSettings, readSetting, SETTING, connectionConfig } from "./settings.mjs";
import { BeyondSyncMenu } from "./menu.mjs";
import { noteFoundryHitPoints } from "./foundry-hp.mjs";
import { characterIdForActor, linkedCharacterIds, readCharacterMapping } from "./character-mapper.mjs";
import { beyondDebug } from "./debug.mjs";
import { BeyondSyncManager } from "./manager.mjs";
import { fetchCharacterData } from "./character-data.mjs";
import { applyBeyondSheet, READ_OPTION } from "./read.mjs";
import { queueBeyondWrite } from "./writeback.mjs";
import { SHEET_UPDATE } from "./message.mjs";

let manager = null;

/** Actor fields that are shared with D&D Beyond. */
const ACTOR_PATHS = [
  "system.attributes.hp",
  "system.attributes.death",
  "system.attributes.inspiration",
  "system.attributes.exhaustion",
  "system.currency",
  "system.details.xp",
  "system.spells"
];
const ITEM_PATHS = ["system.uses", "system.equipped", "system.attuned"];

export function registerDndBeyondSync() {
  registerBeyondSettings();
  game.settings.registerMenu(MODULE_ID, "ddbMenu", {
    name: illusiveDndMenu("dndBeyond", "name"),
    label: illusiveDndMenu("dndBeyond", "label"),
    hint: illusiveDndMenu("dndBeyond", "hint"),
    icon: "fas fa-dragon",
    restricted: true,
    type: BeyondSyncMenu
  });
}

function hasPath(changes, path) {
  return foundry.utils.hasProperty(changes ?? {}, path);
}

/** While sync is on, copy each added character, then follow new changes both ways. */
export function startDndBeyondSync() {
  if (!game.user?.isGM) return;
  manager = new BeyondSyncManager();
  manager.follow();
  void pullRegisteredCharacters();
  Hooks.on("updateSetting", (setting) => {
    if (!String(setting?.key ?? "").includes("ddb")) return;
    manager?.reconnect();
    void pullRegisteredCharacters();
  });

  const target = (actor, options) => writeTarget(actor, options, {
    enabled: readSetting(SETTING.enabled),
    holding: manager?.holding,
    updateDamage: connectionConfig().updateDamage,
    mapping: readCharacterMapping()
  });
  const queue = (actor, options, extra = {}) => {
    const characterId = target(actor, options);
    if (characterId) void queueBeyondWrite(actor, characterId, extra);
  };

  Hooks.on("updateActor", (actor, changes, options) => {
    noteFoundryHitPoints(actor, changes, {
      enabled: readSetting(SETTING.enabled),
      mapping: readCharacterMapping(),
      log: beyondDebug
    });
    if (ACTOR_PATHS.some((path) => hasPath(changes, path))) queue(actor, options);
  });
  Hooks.on("updateItem", (item, changes, options) => {
    if (ITEM_PATHS.some((path) => hasPath(changes, path))) queue(item.parent, options);
  });
  for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
    Hooks.on(hook, (effect, ...rest) => {
      const options = hook === "updateActiveEffect" ? rest[1] : rest[0];
      if (effect.parent?.documentName !== "Actor" || !effect.statuses?.size) return;
      queue(effect.parent, options);
    });
  }
  Hooks.on("dnd5e.restCompleted", (actor, result) => queue(actor, {}, { rest: result?.type === "long" ? "long" : "short" }));
  window.addEventListener("pagehide", () => manager?.shutdown());
}

/** The Beyond character a Foundry change should be saved to, or null. */
export function writeTarget(actor, options, { enabled, holding, updateDamage, mapping }) {
  if (!enabled || !holding || !updateDamage || !actor) return null;
  if (options?.illusiveBeyond === READ_OPTION.illusiveBeyond) return null;
  return characterIdForActor(mapping, actor.id);
}

/** Copy current Beyond play state onto each added character. */
export async function pullRegisteredCharacters(deps = {}) {
  const config = deps.config ?? connectionConfig();
  if (!config.enabled) return [];
  const mapping = deps.mapping ?? readCharacterMapping();
  const fetchCharacter = deps.fetchCharacter ?? fetchCharacterData;
  const apply = deps.apply ?? applyBeyondSheet;
  const results = [];
  for (const characterId of linkedCharacterIds(mapping)) {
    const sheet = await fetchCharacter(characterId, config);
    if (!sheet?.success) {
      beyondDebug("startup-miss", { characterId, reason: sheet?.reason ?? "unknown" });
      results.push({ characterId, ok: false, reason: sheet?.reason ?? "unknown" });
      continue;
    }
    const result = await apply({
      message: {
        eventType: SHEET_UPDATE,
        id: `startup-${characterId}`,
        characterId: String(characterId)
      },
      config,
      mapping,
      fetchCharacter: async () => sheet,
      actors: deps.actors
    });
    results.push({ characterId, ...result });
  }
  return results;
}
