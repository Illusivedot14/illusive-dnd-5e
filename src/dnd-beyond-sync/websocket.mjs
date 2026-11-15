import { SHEET_UPDATE, isHealthUpdate } from "./message.mjs";
import { gameLogUrl } from "./settings.mjs";
import { beyondDebug } from "./debug.mjs";
import { beyondFetch, describeFetchFailure } from "./fetch.mjs";
import { BEYOND_AUTH_URL, exchangeCobalt } from "./beyond-api.mjs";

/**
 * Ask Beyond for the access token, then listen for hit point updates.
 */
export class BeyondSocket extends EventTarget {
  constructor(config, { fetchImpl = beyondFetch(config.relayUrl), socketImpl = globalThis.WebSocket } = {}) {
    super();
    this.config = config;
    this.fetchImpl = fetchImpl;
    this.socketImpl = socketImpl;
    this.ws = null;
    this.accessToken = null;
    this.reconnects = 0;
    this.maxReconnects = 5;
    this.closedByUser = false;
    this.refreshing = false;
    this.refreshTimer = null;
    this.tokenTtl = 300;
  }

  async fetchAccessToken() {
    try {
      const auth = await exchangeCobalt(this.config.cobaltCookie, this.fetchImpl);
      if (auth.token) {
        this.tokenTtl = Number(auth.ttl) || 300;
        return auth.token;
      }
      if (auth.status < 500) {
        beyondDebug("auth-rejected", { status: auth.status });
        this.dispatchEvent(new CustomEvent("cookieExpired"));
        return null;
      }
      beyondDebug("auth-failed", { status: auth.status });
      return null;
    } catch (error) {
      const failure = describeFetchFailure(error, BEYOND_AUTH_URL);
      beyondDebug("auth-failed", failure);
      if (failure.reason === "relay-down") this.dispatchEvent(new CustomEvent("relayDown"));
      return null;
    }
  }

  async connect() {
    this.closedByUser = false;
    this.accessToken = await this.fetchAccessToken();
    if (!this.accessToken) return false;

    const url = gameLogUrl(this.config, this.accessToken);
    beyondDebug("socket-open");
    this.ws = new this.socketImpl(url);
    this.ws.onopen = () => this.#onOpen();
    this.ws.onmessage = (event) => this.#onMessage(event);
    this.ws.onclose = (event) => this.#onClose(event);
    this.ws.onerror = () => beyondDebug("socket-error");
    return true;
  }

  #onOpen() {
    this.reconnects = 0;
    this.#armRefresh();
    this.dispatchEvent(new CustomEvent("connected"));
  }

  #armRefresh() {
    clearTimeout(this.refreshTimer);
    const delay = Math.max(30000, (this.tokenTtl - 40) * 1000);
    this.refreshTimer = setTimeout(() => {
      if (this.closedByUser) return;
      this.refreshing = true;
      beyondDebug("token-refresh");
      this.ws?.close?.(1000, "token refresh");
    }, delay);
  }

  #onMessage(event) {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!isHealthUpdate(message.eventType)) {
      if (!this.seenTypes) this.seenTypes = new Set();
      const eventType = message.eventType ?? null;
      if (!this.seenTypes.has(eventType)) {
        this.seenTypes.add(eventType);
        beyondDebug("event", { eventType });
      }
      return;
    }

    const data = message.data && typeof message.data === "object" ? message.data : {};
    const detail = {
      ...data,
      eventType: message.eventType === "character-sheet/character-update" ? SHEET_UPDATE : message.eventType,
      id: message.id ?? message.rollId ?? data.id,
      characterId: message.entityId ?? message.characterId ?? data.characterId ?? data.entityId ?? data.character?.id
    };
    beyondDebug("forward", { eventType: detail.eventType, id: detail.id ?? null });
    this.dispatchEvent(new CustomEvent("message", { detail }));
  }

  #onClose() {
    clearTimeout(this.refreshTimer);
    const refreshing = this.refreshing;
    this.refreshing = false;
    this.dispatchEvent(new CustomEvent("disconnected", { detail: { intentional: this.closedByUser || refreshing } }));
    if (this.closedByUser && !refreshing) return;
    if (refreshing) {
      void this.connect();
      return;
    }
    if (this.mayReconnect && !this.mayReconnect()) return;
    this.#scheduleReconnect();
  }

  #scheduleReconnect() {
    if (this.reconnects >= this.maxReconnects) return;
    this.reconnects += 1;
    const delay = 3000 * this.reconnects;
    beyondDebug("reconnect", { attempt: this.reconnects, delay });
    setTimeout(() => { void this.connect(); }, delay);
  }

  disconnect() {
    this.closedByUser = true;
    this.refreshing = false;
    clearTimeout(this.refreshTimer);
    this.ws?.close?.(1000, "Manual disconnect");
    this.ws = null;
  }

  on(name, callback) {
    this.addEventListener(name, (event) => callback(event.detail));
  }
}
