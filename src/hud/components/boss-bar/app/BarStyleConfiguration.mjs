import { BAR_STYLE_SELECT, BOSS_BAR_I18N, TEXT_ALIGN } from "../boss-bar-main.mjs";
import { HandlebarsApplication, l, mergeClone, confirm } from "../lib/utils.mjs";
import { DEFAULT_BAR_STYLE, getBossBarSetting, setBossBarSetting } from "../boss-bar-settings.mjs";
import { FormBuilder } from "../lib/formBuilder.mjs";
import { bossBarTemplate } from "../boss-bar-paths.mjs";

export class BarStyleConfiguration extends HandlebarsApplication {
  static get DEFAULT_OPTIONS() {
    return mergeClone(super.DEFAULT_OPTIONS, {
      classes: [this.APP_ID],
      id: this.APP_ID,
      window: {
        title: `${BOSS_BAR_I18N}.${this.APP_ID}.title`,
        icon: "fas fa-paint-brush",
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
        scrollable: []
      }
    };
  }

  async _prepareContext() {
    return {
      styles: getBossBarSetting("barStyles")
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const html = this.element;
    html.querySelectorAll(".edit-style").forEach((button) => {
      button.addEventListener("click", (event) => {
        const styleId = event.currentTarget.dataset.styleId;
        this._onEdit(styleId);
      });
    });
    html.querySelectorAll(".delete-style").forEach((button) => {
      button.addEventListener("click", (event) => {
        const styleId = event.currentTarget.dataset.styleId;
        this._onDelete(styleId);
      });
    });
    html.querySelector(".add-style").addEventListener("click", () => {
      this._onAdd();
    });
  }

  async _onEdit(id) {
    const settingStyle = getBossBarSetting("barStyles").find((style) => style.id === id);
    if (!settingStyle) return;
    const style = mergeClone(DEFAULT_BAR_STYLE, settingStyle);
    const data = await new FormBuilder()
      .title(l(`${BOSS_BAR_I18N}.${this.APP_ID}.edit`) + `: ${style.name}`)
      .object(style)
      .text({ name: "name", label: "Name" })
      .file({ name: "background", label: `${BOSS_BAR_I18N}.${this.APP_ID}.background` })
      .file({ name: "bar", label: `${BOSS_BAR_I18N}.${this.APP_ID}.bar` })
      .file({ name: "foreground", label: `${BOSS_BAR_I18N}.${this.APP_ID}.foreground` })
      .color({ name: "tempBarColor", label: `${BOSS_BAR_I18N}.${this.APP_ID}.tempBarColor` })
      .number({
        name: "tempBarAlpha",
        label: `${BOSS_BAR_I18N}.${this.APP_ID}.tempBarAlpha`,
        min: 0,
        max: 1,
        step: 0.01
      })
      .number({
        name: "barHeight",
        label: `${BOSS_BAR_I18N}.${this.APP_ID}.barHeight`,
        min: 5,
        max: 100,
        step: 1
      })
      .select({
        name: "font",
        label: `${BOSS_BAR_I18N}.${this.APP_ID}.font`,
        options: FontConfig.getAvailableFontChoices()
      })
      .number({
        name: "textSize",
        label: `${BOSS_BAR_I18N}.${this.APP_ID}.textSize`,
        min: 5,
        max: 100,
        step: 1
      })
      .select({ name: "textAlign", label: `${BOSS_BAR_I18N}.${this.APP_ID}.textAlign`, options: TEXT_ALIGN })
      .select({
        name: "type",
        label: `${BOSS_BAR_I18N}.${this.APP_ID}.type`,
        hint: `${BOSS_BAR_I18N}.${this.APP_ID}.type-hint`,
        options: BAR_STYLE_SELECT
      })
      .render();
    if (!data) return;
    const styles = getBossBarSetting("barStyles");
    const current = styles.find((style) => style.id === id);
    Object.keys(data).forEach((key) => {
      current[key] = data[key];
    });
    await setBossBarSetting("barStyles", styles);
    this.render();
  }

  async _onDelete(id) {
    const confirmed = await confirm(
      `${BOSS_BAR_I18N}.${this.APP_ID}.delete-title`,
      `${BOSS_BAR_I18N}.${this.APP_ID}.delete-confirm`
    );
    if (!confirmed) return;
    const styles = getBossBarSetting("barStyles");
    await setBossBarSetting("barStyles", styles.filter((style) => style.id != id));
    this.render();
  }

  async _onAdd() {
    const data = await new FormBuilder()
      .size({ width: 400 })
      .title(`${BOSS_BAR_I18N}.${this.APP_ID}.add`)
      .text({ name: "name", label: "Name" })
      .render();
    if (!data || !data.name) return;
    const styles = getBossBarSetting("barStyles");
    styles.push(mergeClone(DEFAULT_BAR_STYLE, { id: foundry.utils.randomID(), ...data }));
    await setBossBarSetting("barStyles", styles);
    this.render();
  }
}
