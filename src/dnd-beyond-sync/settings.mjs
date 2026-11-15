import { MODULE_ID } from "../constants.mjs";
import { DEFAULT_RELAY } from "./fetch.mjs";

export const SETTING = {
  enabled: "ddbEnabled",
  cobaltCookie: "ddbCobaltCookie",
  relayUrl: "ddbRelayUrl",
  proxyUrl: "ddbProxyUrl",
  proxyUsername: "ddbProxyUsername",
  proxyPassword: "ddbProxyPassword",
  userId: "ddbUserId",
  campaignId: "ddbCampaignId",
  updateDamage: "ddbUpdateDamage",
  debug: "ddbDebug",
  characterMapping: "ddbCharacterMapping"
};

export function readSetting(key) {
  return game.settings.get(MODULE_ID, key);
}

export function registerBeyondSettings() {
  const world = (key, config) => game.settings.register(MODULE_ID, key, {
    scope: "world",
    config: false,
    ...config
  });

  world(SETTING.enabled, {
    name: "D&D Beyond sync",
    hint: "Listen to a campaign game log and copy hit point changes onto mapped actors.",
    type: Boolean,
    default: false,
    onChange: () => game.illusiveBeyond?.follow?.()
  });
  world(SETTING.cobaltCookie, {
    name: "D&D Beyond CobaltSession",
    hint: "The CobaltSession cookie from a logged-in dndbeyond.com browser. This is a password. It stays in this world.",
    type: String,
    default: ""
  });
  world(SETTING.relayUrl, {
    name: "D&D Beyond relay",
    hint: "Wisp relay the page reaches D&D Beyond through. Requests are encrypted in this page, so the relay cannot read the cookie or the character.",
    type: String,
    default: DEFAULT_RELAY
  });
  world(SETTING.proxyUrl, {
    name: "D&D Beyond proxy URL",
    hint: "Your ddb-proxy, for example http://localhost:3000. The /proxy/auth response must include the token.",
    type: String,
    default: "http://localhost:3000"
  });
  world(SETTING.proxyUsername, {
    name: "D&D Beyond proxy username",
    hint: "Basic auth username, when the proxy requires it.",
    type: String,
    default: ""
  });
  world(SETTING.proxyPassword, {
    name: "D&D Beyond proxy password",
    hint: "Basic auth password, when the proxy requires it.",
    type: String,
    default: ""
  });
  world(SETTING.userId, {
    name: "D&D Beyond user id",
    hint: "Cobalt.User.ID from the browser console on dndbeyond.com.",
    type: String,
    default: ""
  });
  world(SETTING.campaignId, {
    name: "D&D Beyond campaign id",
    hint: "The number in dndbeyond.com/campaigns/{id}.",
    type: String,
    default: ""
  });
  world(SETTING.updateDamage, {
    name: "Sync play state with D&D Beyond",
    hint: "Hit points, slots, uses, conditions, death saves, inspiration, currency, XP, hit dice, equipped, and attuned move both ways between Beyond and the linked actor.",
    type: Boolean,
    default: true
  });
  world(SETTING.debug, {
    name: "D&D Beyond debug log",
    hint: "Write sync events to the browser console. The menu keeps the same log either way.",
    type: Boolean,
    default: true
  });
  game.settings.register(MODULE_ID, SETTING.characterMapping, {
    name: "D&D Beyond character mapping",
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });
}

export function connectionConfig() {
  return {
    enabled: Boolean(readSetting(SETTING.enabled)),
    cobaltCookie: String(readSetting(SETTING.cobaltCookie) ?? "").trim(),
    relayUrl: String(readSetting(SETTING.relayUrl) ?? "").trim() || DEFAULT_RELAY,
    proxyUrl: String(readSetting(SETTING.proxyUrl) ?? "").trim().replace(/\/$/, ""),
    proxyUsername: String(readSetting(SETTING.proxyUsername) ?? "").trim(),
    proxyPassword: String(readSetting(SETTING.proxyPassword) ?? ""),
    userId: String(readSetting(SETTING.userId) ?? "").trim(),
    campaignId: String(readSetting(SETTING.campaignId) ?? "").trim(),
    updateDamage: readSetting(SETTING.updateDamage) !== false
  };
}

/** What connect() still needs before it opens the socket. */
export function missingConnectionFields(config) {
  const missing = [];
  if (!config.cobaltCookie) missing.push("CobaltSession");
  if (!config.userId) missing.push("user id");
  if (!config.campaignId) missing.push("campaign id");
  return missing;
}

export function proxyHeaders(config) {
  const headers = { "Content-Type": "application/json" };
  if (config.proxyUsername && config.proxyPassword) {
    const token = btoa(`${config.proxyUsername}:${config.proxyPassword}`);
    headers.Authorization = `Basic ${token}`;
  }
  return headers;
}

export function gameLogUrl(config, accessToken) {
  const gameId = encodeURIComponent(config.campaignId);
  const userId = encodeURIComponent(config.userId);
  const token = encodeURIComponent(accessToken);
  return `wss://game-log-api-live.dndbeyond.com/v1?gameId=${gameId}&userId=${userId}&stt=${token}`;
}
