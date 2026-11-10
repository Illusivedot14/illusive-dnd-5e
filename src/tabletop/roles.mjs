import { MODULE_ID } from "../constants.mjs";

function settingUserId(key) {
  try {
    return String(game.settings.get(MODULE_ID, key) ?? "").trim();
  } catch {
    return "";
  }
}

/** User id chosen as the table. Empty until Display settings picks one. */
export function tabletopUserId() {
  return settingUserId("tabletopUser");
}

/** User id whose pad moves the table. May be the tabletop user. Empty until a table is chosen. */
export function tabletopCameraUserId() {
  if (!tabletopUserId()) return "";
  return settingUserId("tabletopCameraUser");
}

/** The table user is also the one moving that camera. */
export function tabletopControlsItself() {
  const table = tabletopUserId();
  return Boolean(table) && table === tabletopCameraUserId();
}

/** This client is the locked table. */
export function isTabletopClient() {
  const id = tabletopUserId();
  return Boolean(id) && id === game.user?.id;
}

/** This client is allowed to move the table camera. */
export function isTabletopPilot() {
  const id = tabletopCameraUserId();
  return Boolean(id) && id === game.user?.id;
}

export function userIsTabletop(user) {
  const id = tabletopUserId();
  return Boolean(id) && user?.id === id;
}

export function userIsPilot(user) {
  const id = tabletopCameraUserId();
  return Boolean(id) && user?.id === id;
}
