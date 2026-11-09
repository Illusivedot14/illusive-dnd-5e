import { illusiveDndLocalize } from "./core.mjs";
import { illusiveDndSectionLabel } from "./labels.mjs";

function group(prefix) {
  return (id, data = {}) => illusiveDndLocalize(`${prefix}.${id}`, data);
}

/**
 * Grouped HUD string accessors. Prefer these over raw illusiveDndLocalize key strings.
 */
export const illusiveDnd = {
  t: illusiveDndLocalize,
  section: illusiveDndSectionLabel,
  action: group("actions"),
  movement: group("movement"),
  target: group("target"),
  reaction: group("reaction"),
  turn: group("turn"),
  warning: group("warnings"),
  reason: group("reasons"),
  empty: group("empty"),
  ui: group("ui"),
  partyMenu: group("partyMenu"),
  partyRail: group("partyRail"),
  partyPlayerPrefs: group("partyPlayerPrefs"),
  currentToken: group("currentToken"),
  turnTracker: group("turnTracker"),
  actionBar: group("actionBar"),
  cameraPad: group("cameraPad"),
  mobileMove: group("mobileMove"),
  mobileSheet: group("mobileSheet")
};
