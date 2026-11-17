import { MODULE_PATH } from "../constants.mjs";
import { IllusiveDndSubsettingsForm } from "../i18n/settings-ui.mjs";
import { illusiveDnd } from "../i18n/catalog.mjs";
import { clearBeyondLog, beyondLogText, beyondStatus, subscribeBeyondLog, beyondDebug } from "./debug.mjs";
import { linkCharacter, playerTokenChoices, readCharacterMapping, unlinkCharacter } from "./character-mapper.mjs";
import { readSetting, SETTING } from "./settings.mjs";

const FIELDS = [
  SETTING.enabled,
  SETTING.showRolls,
  SETTING.debug,
  SETTING.userId,
  SETTING.campaignId,
  SETTING.cobaltCookie,
  SETTING.relayUrl
];

export class BeyondSyncMenu extends IllusiveDndSubsettingsForm {
  constructor() {
    super(FIELDS, { windowTitle: illusiveDnd.t("settings.menus.dndBeyond.title") });
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["illusive-dnd-subsettings", "illusive-dnd-beyond-window"],
      width: 780,
      closeOnSubmit: false
    });
  }

  get template() {
    return `${MODULE_PATH}/src/dnd-beyond-sync/menu.hbs`;
  }

  getData() {
    const data = super.getData();
    const mapping = readCharacterMapping();
    const actors = [...(game.actors ?? [])];
    const tokens = canvas?.tokens?.placeables ?? [];
    const choices = playerTokenChoices({
      tokens: tokens.map((token) => ({
        actorId: token.actor?.id ?? token.document?.actorId,
        actor: token.actor,
        name: token.name || token.document?.name
      })),
      actors
    });
    const mappings = Object.entries(mapping).map(([characterId, actorId]) => {
      const actor = game.actors?.get?.(actorId);
      const choice = choices.find((entry) => entry.id === String(actorId));
      const reimport = actor?.flags?.["illusive-dnd-5e"]?.beyond?.reimport ?? [];
      return {
        characterId,
        actorId,
        actorName: choice?.name || actor?.name || "Unknown token",
        reimport
      };
    });
    return {
      ...data,
      fields: data.fields.map((field) => ({
        ...field,
        isPassword: field.key === SETTING.cobaltCookie
      })),
      choices,
      mappings,
      status: beyondStatus(),
      log: beyondLogText()
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    this._unsubscribeLog?.();
    const root = html?.[0] ?? html;
    this._unsubscribeLog = subscribeBeyondLog(({ status, text }) => {
      const log = root.querySelector?.(".illusive-dnd-beyond-log");
      const state = root.querySelector?.(".beyond-status");
      if (log) log.value = text;
      if (state) state.textContent = status;
    });
    html.find('[data-action="clear-beyond-log"]').on("click", (event) => {
      event.preventDefault();
      clearBeyondLog();
    });
    html.find('[data-action="add-mapping"]').on("click", async (event) => {
      event.preventDefault();
      const characterId = String(root.querySelector('[name="newCharacterId"]')?.value ?? "").trim();
      const actorId = String(root.querySelector('[name="newActorId"]')?.value ?? "").trim();
      if (!characterId || !actorId) {
        ui.notifications?.warn?.("Enter a Beyond character id and choose a token.");
        return;
      }
      const { conflicts } = await linkCharacter(characterId, actorId, {
        campaignId: String(readSetting(SETTING.campaignId) ?? "").trim()
      });
      const actor = game.actors?.get?.(actorId);
      const actorName = (id) => game.actors?.get?.(id)?.name ?? id;
      for (const conflict of conflicts) {
        const text = conflict.kind === "character"
          ? `Beyond character ${characterId} moved from ${actorName(conflict.actorId)} to ${actor?.name ?? actorId}.`
          : `${actor?.name ?? actorId} was linked to Beyond character ${conflict.characterId}. That link was removed.`;
        ui.notifications?.warn?.(text);
      }
      beyondDebug("linked", { name: actor?.name ?? actorId, characterId, conflicts });
      this.render();
    });
    html.find('[data-action="remove-mapping"]').on("click", async (event) => {
      event.preventDefault();
      const characterId = event.currentTarget?.dataset?.characterId;
      if (!characterId) return;
      await unlinkCharacter(characterId);
      this.render();
    });
  }

  async close(options) {
    this._unsubscribeLog?.();
    this._unsubscribeLog = null;
    return super.close(options);
  }
}
