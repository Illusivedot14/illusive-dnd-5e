import { MODULE_ID } from "../../constants.mjs";

/** Token status icons always sit in the top-right strip. */
export function getTokenStatusPlacement() {
  return "topRight";
}

/** Raw value of a module setting. */
export function setting(key) {
  return game.settings.get(MODULE_ID, key);
}

/**
 * True unless a default-true boolean setting has been explicitly disabled.
 * Use `!settingOn(key)` for the "is this turned off?" checks.
 */
export function settingOn(key) {
  return game.settings.get(MODULE_ID, key) !== false;
}

/** Collapse / expand motion for the action bar only. */
export function hudAnimationOn() {
  return settingOn("hudAnimation");
}
