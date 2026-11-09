import { BAR_STYLES, BOSS_BAR_I18N } from "../boss-bar-main.mjs";
import { getProperty, HandlebarsApplication, mergeClone } from "../lib/utils.mjs";
import { DEFAULT_BAR_STYLE, getBossBarSetting, setBossBarSetting } from "../boss-bar-settings.mjs";
import { bossBarTemplate } from "../boss-bar-paths.mjs";
import { MODULE_ID } from "../../../../constants.mjs";
import { changeTouches } from "../../../../foundry/document-change.mjs";
import { BOSS_BAR_FLAG, getSceneBossBarActors, isLegacyBossBarActive } from "../boss-bar-paths.mjs";
import { settingOn } from "../../../lib/hud-settings.mjs";
import { desktopHudEnabled } from "../../../lib/mobile-client.mjs";
import { BossBarConfiguration } from "./BossBarConfiguration.mjs";

export function setBossBarHooks() {
  Hooks.on("updateScene", (scene, updates) => {
    if (updates.flags?.[MODULE_ID]?.[BOSS_BAR_FLAG] && scene === game.scenes.viewed) BossBar.update();
    if (isLegacyBossBarActive() && updates.flags?.bossbar?.actors && scene === game.scenes.viewed) {
      BossBar.update();
    }
  });
  Hooks.on("canvasReady", () => BossBar.update());
  Hooks.on("updateActor", (actor, changes) => {
    if (!changeTouches(changes, "system.attributes.hp")) return;
    ui.bossBar?._onActorUpdate(actor);
  });
}

export class BossBar extends HandlebarsApplication {
  constructor(scene) {
    super();
    if (ui.bossBar) ui.bossBar.close();
    ui.bossBar = this;
    this.scene = scene ?? game.scenes.viewed;
    this.savePosition = foundry.utils.debounce(this.savePosition.bind(this), 100);
  }

  static update() {
    if (!settingOn("enableBossBar") || !desktopHudEnabled()) {
      ui.bossBar?.close();
      return;
    }

    const current = ui.bossBar;
    const scene = game.scenes.viewed;
    const actors = getSceneBossBarActors(scene);
    if (!actors.length && current) return current.close();
    if (actors.length) {
      return new BossBar(scene).render({ position: getBossBarSetting("barPosition"), force: true });
    }
  }

  static resetPosition() {
    setBossBarSetting("barPosition", {
      width: BossBar.defaultWidth,
      height: "auto",
      top: 50,
      left: BossBar.defaultLeft
    });
    setBossBarSetting("resetPosition", false);
    BossBar.update();
  }

  static get DEFAULT_OPTIONS() {
    return mergeClone(super.DEFAULT_OPTIONS, {
      classes: [this.APP_ID],
      id: this.APP_ID,
      window: {
        title: `${BOSS_BAR_I18N}.${this.APP_ID}.title`,
        icon: "",
        resizable: true
      },
      position: {
        width: this.defaultWidth,
        height: "auto",
        top: 50,
        left: this.defaultLeft
      }
    });
  }

  static get defaultSizeMulti() {
    return 0.8;
  }

  static get defaultWidth() {
    return document.querySelector("#ui-top").offsetWidth * this.defaultSizeMulti;
  }

  static get defaultLeft() {
    const uiTop = document.querySelector("#ui-top");
    return uiTop.getBoundingClientRect().left + (uiTop.offsetWidth * (1 - this.defaultSizeMulti)) / 2;
  }

  static get PARTS() {
    return {
      content: {
        template: bossBarTemplate(`${this.APP_ID}.hbs`),
        classes: [],
        scrollable: []
      }
    };
  }

  async _prepareContext() {
    const actors = getSceneBossBarActors(this.scene);
    const bars = actors.map((a) => new Bar(fromUuidSync(a.uuid), a.style, a.hideName));
    this.actors = new Set(actors.map((a) => fromUuidSync(a.uuid)));
    this.bars = bars;
    return { bars };
  }

  _onActorUpdate(actor) {
    if (!this.actors.has(actor)) return;
    this.updateBars();
  }

  updateBars() {
    this.bars.forEach((b) => {
      const element = this.element.querySelector(`.bar-list-item[data-uuid="${b.actor.uuid}"]`);
      if (!element) return;
      element.style.setProperty("--bar-percent", `${b.hpPercent}%`);
    });
  }

  _onRender(context, options) {
    super._onRender(context, options);
    foundry.applications.instances.delete(this.APP_ID);
    if (!game.user.isGM) return;
    this.element.querySelector(".window-header").addEventListener("contextmenu", (event) => {
      event.preventDefault();
      new BossBarConfiguration().render(true);
    });
  }

  setPosition(...args) {
    const r = super.setPosition(...args);
    const barContainerOuterWidth = this.element.querySelector(".boss-bar-container").offsetWidth;
    this.element.style.setProperty("--bar-container-outer-width", `${barContainerOuterWidth}px`);
    this.savePosition(this.position);
    return r;
  }

  savePosition(position) {
    setBossBarSetting("barPosition", { width: position.width, left: position.left, top: position.top });
  }
}

class Bar {
  #actor;
  #style;

  constructor(actor, style, hideName) {
    this.#actor = actor;
    this.#style =
      getBossBarSetting("barStyles").find((s) => s.id === style) ??
      getBossBarSetting("barStyles")[0] ??
      DEFAULT_BAR_STYLE;
    this.hideName = hideName;
    this.useWounds = getBossBarSetting("woundsSystem");
  }

  get actor() {
    return this.#actor;
  }

  get style() {
    return this.#style;
  }

  get currentHp() {
    return getProperty(this.actor.system, getBossBarSetting("currentHpPath"));
  }

  get maxHp() {
    return getProperty(this.actor.system, getBossBarSetting("maxHpPath"));
  }

  get hpPercent() {
    if (this.useWounds) return Math.max(0, Math.round((100 * (this.maxHp - this.currentHp)) / this.maxHp));
    return Math.max(0, Math.round((100 * this.currentHp) / this.maxHp));
  }

  get name() {
    if (this.hideName) return "";
    return this.actor.name;
  }

  get isClassic() {
    return this.style.type == BAR_STYLES.CLASSIC;
  }

  get isMatchingImages() {
    return this.style.type == BAR_STYLES.MATCHING_IMAGES;
  }

  get cssClass() {
    if (this.isClassic) return "classic";
    if (this.isMatchingImages) return "matching-images";
    return "classic";
  }
}
