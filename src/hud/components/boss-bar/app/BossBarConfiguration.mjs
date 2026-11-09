import { BOSS_BAR_I18N, MODULE_ID } from "../boss-bar-main.mjs";
import { HandlebarsApplication, l, mergeClone } from "../lib/utils.mjs";
import { getBossBarSetting } from "../boss-bar-settings.mjs";
import { BossBarSocket } from "../lib/socket.mjs";
import { BarStyleConfiguration } from "./BarStyleConfiguration.mjs";
import { bossBarTemplate } from "../boss-bar-paths.mjs";
import { BOSS_BAR_FLAG } from "../boss-bar-paths.mjs";

export class BossBarConfiguration extends HandlebarsApplication {
  #scene;

  constructor(scene) {
    super();
    this.#scene = scene ?? game.scenes.viewed;
    if (!this.#scene) ui.notifications.error(`${BOSS_BAR_I18N}.${this.APP_ID}.no-scene`);
    this.prepareActors();
  }

  prepareActors() {
    const actorsData = (this.scene.getFlag(MODULE_ID, BOSS_BAR_FLAG) ?? []).filter((a) => fromUuidSync(a.uuid));
    this.actors = JSON.parse(JSON.stringify(actorsData));
    this.actors.forEach((a) => {
      a.document = fromUuidSync(a.uuid);
    });
  }

  get scene() {
    return this.#scene;
  }

  get title() {
    return l(`${BOSS_BAR_I18N}.${this.APP_ID}.title`) + `: ${this.#scene.name}`;
  }

  static get DEFAULT_OPTIONS() {
    return mergeClone(super.DEFAULT_OPTIONS, {
      classes: [this.APP_ID],
      id: this.APP_ID,
      window: {
        title: `${BOSS_BAR_I18N}.${this.APP_ID}.title`,
        icon: "",
        resizable: false
      },
      position: {
        width: 560,
        height: "auto"
      }
    });
  }

  static get PARTS() {
    return {
      content: {
        template: bossBarTemplate(`${this.APP_ID}.hbs`),
        classes: ["standard-form", "scrollable"],
        scrollable: [""]
      }
    };
  }

  async _prepareContext() {
    const controlled = canvas?.tokens?.controlled?.map((t) => t.actor) ?? [];
    let actorOptions = (controlled.length ? controlled : this.scene.tokens.map((t) => t.actor)).filter(
      (a) => !this.actors.find((ac) => ac.document === a)
    );
    if (!actorOptions.length && !this.actors.length) {
      return ui.notifications.error(`${BOSS_BAR_I18N}.${this.APP_ID}.no-actors`);
    }
    const barStyles = getBossBarSetting("barStyles");
    const barStyleOptions = barStyles.reduce((acc, style) => {
      acc[style.id] = style.name;
      return acc;
    }, {});
    actorOptions = actorOptions.map((a) => ({ uuid: a.uuid, style: barStyles[0].id, document: a }));
    if (
      !this.actors.length &&
      actorOptions.length === 1 &&
      (this.scene.getFlag(MODULE_ID, BOSS_BAR_FLAG) ?? []).length === 0
    ) {
      this.actors.push(actorOptions[0]);
      actorOptions = [];
    }

    return {
      actors: this.actors,
      actorOptions,
      barStyleOptions
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const html = this.element;
    html.querySelectorAll("#add").forEach((button) => {
      button.addEventListener("click", (event) => {
        const li = event.currentTarget.closest("li");
        const actor = li.dataset.uuid;
        const style = li.querySelector("select").value;
        this.actors.push({ uuid: actor, style, document: fromUuidSync(actor) });
        this.render();
      });
    });
    html.querySelectorAll("#delete").forEach((button) => {
      button.addEventListener("click", (event) => {
        const li = event.currentTarget.closest("li");
        const actor = li.dataset.uuid;
        this.actors = this.actors.filter((a) => a.uuid !== actor);
        this.render();
      });
    });
    html.querySelector("#save").addEventListener("click", () => {
      this.saveData();
      this.close();
    });
    html.querySelector("#save-pan").addEventListener("click", () => {
      this.saveData();
      this.close();
      const token = this.actors.find((a) => a.document.getActiveTokens()[0])?.document?.getActiveTokens()[0];
      BossBarSocket.cameraPan({ uuid: token?.document?.uuid, scale: 1.8, duration: 1000 });
    });
    html.querySelector("#edit-themes").addEventListener("click", () => {
      this.close();
      new BarStyleConfiguration().render(true);
    });
  }

  saveData() {
    const actors = this.actors.map((a) => ({
      uuid: a.document.uuid,
      style: this.element.querySelector(`.selected-actors-list li[data-uuid="${a.document.uuid}"] select`).value,
      hideName: this.element.querySelector(
        `.selected-actors-list li[data-uuid="${a.document.uuid}"] input[name="hideName"]`
      ).checked
    }));
    return this.scene.setFlag(MODULE_ID, BOSS_BAR_FLAG, actors);
  }

  static async cleanUpActors(scene) {
    scene ??= game.scenes.viewed;
    const actors = scene.getFlag(MODULE_ID, BOSS_BAR_FLAG) ?? [];
    const cleaned = actors.filter((a) => fromUuidSync(a.uuid));
    if (cleaned.length !== actors.length) {
      return scene.setFlag(MODULE_ID, BOSS_BAR_FLAG, cleaned);
    }
    return null;
  }
}
