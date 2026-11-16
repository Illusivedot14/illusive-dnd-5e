import { beyondDebug, setBeyondStatus } from "./debug.mjs";
import { MessageDeduplicator } from "./dedupe.mjs";
import { MessageDispatcher } from "./dispatcher.mjs";
import { readHandler } from "./read.mjs";
import { rollHandler } from "./roll.mjs";
import { messageKey } from "./message.mjs";
import { connectionConfig, missingConnectionFields } from "./settings.mjs";
import { BeyondSocket } from "./websocket.mjs";

export const RELAY_RETRY_MS = 10000;

/**
 * Health sync for one campaign.
 * The active GM with the lowest id holds the game-log socket while the world is open.
 * Closing the world closes that socket and does not reconnect.
 */
export class BeyondSyncManager {
  constructor() {
    this.dedupe = new MessageDeduplicator();
    this.dispatcher = new MessageDispatcher();
    this.dispatcher.register(readHandler());
    this.dispatcher.register(rollHandler());
    this.socket = null;
    this.down = false;
    this.mode = "";
    this.relayTimer = null;
  }

  follow() {
    if (this.down) return;
    const enabled = connectionConfig().enabled;
    if (!enabled) {
      if (this.mode !== "off") {
        this.mode = "off";
        setBeyondStatus("Off");
        beyondDebug("off");
      }
      this.disconnect();
      return;
    }
    if (!this.holding) {
      if (this.mode !== "standby") {
        this.mode = "standby";
        setBeyondStatus("Another client is holding the sync");
      }
      this.disconnect();
      return;
    }
    if (this.socket) return;
    if (this.mode === "missing" && missingConnectionFields(connectionConfig()).length) return;
    this.mode = "connecting";
    void this.connect();
  }

  get holding() {
    return this.holderId != null && this.holderId === game.user?.id;
  }

  get holderId() {
    return syncHolderId([...(game.users ?? [])]);
  }

  /** World closed or this page is leaving. */
  shutdown() {
    if (this.down) return;
    this.down = true;
    setBeyondStatus("World closed");
    beyondDebug("shutdown");
    this.disconnect();
  }

  async connect() {
    if (this.down) return false;
    const config = connectionConfig();
    const missing = missingConnectionFields(config);
    if (missing.length) {
      this.mode = "missing";
      const text = `Needs ${missing.join(", ")}.`;
      setBeyondStatus(text);
      beyondDebug("missing", { missing });
      globalThis.ui?.notifications?.warn?.(`D&D Beyond sync ${text.charAt(0).toLowerCase()}${text.slice(1)}`);
      return false;
    }

    this.disconnect();
    setBeyondStatus("Connecting");
    beyondDebug("connecting", { campaignId: config.campaignId, userId: config.userId });
    this.socket = new BeyondSocket(config);
    this.socket.mayReconnect = () => !this.down && connectionConfig().enabled;
    this.socket.on("message", (message) => { void this.handleMessage(message); });
    this.socket.on("connected", () => {
      setBeyondStatus("Connected");
      beyondDebug("connected");
      globalThis.ui?.notifications?.info?.("Connected to D&D Beyond.");
    });
    this.socket.on("disconnected", (detail) => {
      if (this.down || detail?.intentional) return;
      setBeyondStatus(connectionConfig().enabled ? "Disconnected" : "Off");
      beyondDebug("disconnected");
      if (connectionConfig().enabled) {
        globalThis.ui?.notifications?.warn?.("Disconnected from D&D Beyond.");
      }
    });
    this.socket.on("cookieExpired", () => this.#cookieExpired());
    const socket = this.socket;
    socket.on("relayDown", () => {
      if (this.socket === socket) this.#waitForRelay();
    });
    return socket.connect();
  }

  disconnect() {
    clearTimeout(this.relayTimer);
    this.relayTimer = null;
    this.socket?.disconnect?.();
    this.socket = null;
  }

  /** D&D Beyond could not be reached through the relay. Try again until it can. */
  #waitForRelay() {
    if (this.down) return;
    if (this.mode !== "relay") {
      this.mode = "relay";
      setBeyondStatus("Cannot reach D&D Beyond through the relay. Retrying.");
      beyondDebug("relay-wait", { relay: connectionConfig().relayUrl });
    }
    this.disconnect();
    this.relayTimer = setTimeout(() => {
      this.relayTimer = null;
      this.follow();
    }, RELAY_RETRY_MS);
  }

  reconnect() {
    this.disconnect();
    this.follow();
  }

  async handleMessage(message) {
    const key = messageKey(message);
    if (this.dedupe.isProcessed(key)) {
      beyondDebug("duplicate", { key });
      return;
    }
    this.dedupe.markProcessed(key);
    const handled = await this.dispatcher.dispatch(message);
    if (!handled) beyondDebug("unhandled", { eventType: message?.eventType ?? null, key });
  }

  #cookieExpired() {
    setBeyondStatus("Cookie expired");
    beyondDebug("cookie-expired");
    globalThis.ui?.notifications?.error?.(
      "The D&D Beyond CobaltSession cookie expired. Open the D&D Beyond menu and paste a new one."
    );
    this.disconnect();
  }
}

/** The active GM with the lowest id keeps the one health socket. */
export function syncHolderId(users = []) {
  return users
    .filter((user) => user?.active && user?.isGM && user?.id)
    .map((user) => user.id)
    .sort()[0] ?? null;
}
