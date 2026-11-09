export class HandlebarsApplication extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static get APP_ID() {
    return this.name
      .split(/(?=[A-Z])/)
      .join("-")
      .toLowerCase();
  }

  get APP_ID() {
    return this.constructor.APP_ID;
  }

  static get DEFAULT_OPTIONS() {
    return {
      tag: "div",
      window: {
        frame: true,
        positioned: true,
        icon: "",
        controls: [],
        minimizable: true,
        resizable: false,
        contentTag: "section",
        contentClasses: []
      },
      actions: {},
      form: {
        handler: undefined,
        submitOnChange: false,
        closeOnSubmit: false
      },
      position: {
        width: 560,
        height: "auto"
      }
    };
  }
}

export function confirm(title, content) {
  title = l(title);
  content = l(content);
  return foundry.applications.api.DialogV2.confirm({ window: { title }, content });
}

export function deepClone(obj) {
  return foundry.utils.deepClone(obj);
}

export function mergeClone(obj, other) {
  obj = foundry.utils.deepClone(obj);
  other = foundry.utils.deepClone(other);
  return foundry.utils.mergeObject(obj, other);
}

export function getProperty(obj, key) {
  return foundry.utils.getProperty(obj, key);
}

export function l(x) {
  return game.i18n.localize(x);
}
