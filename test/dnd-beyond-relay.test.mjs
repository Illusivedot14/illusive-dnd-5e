import { afterEach, describe, expect, it, vi } from "vitest";
import { installFoundry } from "./helpers.mjs";
import { DEFAULT_RELAY, RelayError, beyondFetch, loadCurl } from "../src/dnd-beyond-sync/fetch.mjs";
import { fetchCharacterData, sendBeyondCalls } from "../src/dnd-beyond-sync/character-data.mjs";
import { RELAY_RETRY_MS, BeyondSyncManager } from "../src/dnd-beyond-sync/manager.mjs";
import { beyondStatus } from "../src/dnd-beyond-sync/debug.mjs";
import { connectionConfig } from "../src/dnd-beyond-sync/settings.mjs";

afterEach(() => {
  vi.useRealTimers();
});

function fakeCurl() {
  return {
    websocket_url: null,
    set_websocket: vi.fn(function (url) { this.websocket_url = url; }),
    fetch: vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ token: "jwt" }) }))
  };
}

describe("dnd beyond relay transport", () => {
  it("ships libcurl.js with the module", async () => {
    const { existsSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    for (const file of ["libcurl.mjs", "libcurl.wasm", "LICENSE"]) {
      expect(existsSync(fileURLToPath(new URL(`../vendor/libcurl/${file}`, import.meta.url)))).toBe(true);
    }
  });

  it("loads libcurl once and retries a failed load", async () => {
    const curl = { load_wasm: vi.fn(async () => {}) };
    const importer = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ libcurl: curl });
    await expect(loadCurl({ importer })).rejects.toThrow("offline");
    await expect(loadCurl({ importer })).resolves.toBe(curl);
    await expect(loadCurl({ importer })).resolves.toBe(curl);
    expect(importer).toHaveBeenCalledTimes(2);
    expect(curl.load_wasm).toHaveBeenCalledTimes(1);
    expect(curl.load_wasm.mock.calls[0][0]).toMatch(/vendor\/libcurl\/libcurl\.wasm$/);
  });

  it("points libcurl at the relay and passes requests through", async () => {
    const curl = fakeCurl();
    const send = beyondFetch("wss://relay.test/", { load: async () => curl });
    const response = await send("https://auth-service.dndbeyond.com/v1/cobalt-token", { method: "POST" });
    expect(response.ok).toBe(true);
    expect(curl.set_websocket).toHaveBeenCalledWith("wss://relay.test/");
    await send("https://example.test/", {});
    expect(curl.set_websocket).toHaveBeenCalledTimes(1);
    expect(curl.fetch).toHaveBeenCalledWith(
      "https://auth-service.dndbeyond.com/v1/cobalt-token",
      expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) })
    );
  });

  it("drops a silent relay connection and reads again on a fresh one", async () => {
    vi.useFakeTimers();
    const dead = { ws: { close: vi.fn() } };
    const sessions = [];
    const curl = {
      websocket_url: null,
      set_websocket(url) { this.websocket_url = url; },
      wisp: { wisp_connections: { "wss://relay.test/": dead } },
      HTTPSession: class {
        constructor() {
          this.close = vi.fn();
          this.fetch = vi.fn(sessions.length
            ? async () => new Response('{"ok":1}', { status: 200 })
            : () => new Promise(() => {}));
          sessions.push(this);
        }
      }
    };
    const send = beyondFetch("wss://relay.test/", { load: async () => curl, timeout: 1000 });
    const pending = send("https://character-service.dndbeyond.com/character/v5/character/7");
    await vi.advanceTimersByTimeAsync(1000);
    const response = await pending;
    await expect(response.json()).resolves.toEqual({ ok: 1 });
    expect(dead.ws.close).toHaveBeenCalled();
    expect(curl.wisp.wisp_connections).toEqual({});
    expect(sessions).toHaveLength(2);
    expect(sessions[0].close).toHaveBeenCalled();
    expect(sessions[0].fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("sends a write only once when the relay stops answering", async () => {
    vi.useFakeTimers();
    const curl = fakeCurl();
    curl.fetch.mockImplementation(() => new Promise(() => {}));
    const send = beyondFetch("wss://relay.test/", { load: async () => curl, timeout: 1000 });
    const pending = expect(send("https://x.test/", { method: "PUT" })).rejects.toMatchObject({ name: "RelayError" });
    await vi.advanceTimersByTimeAsync(1000);
    await pending;
    expect(curl.fetch).toHaveBeenCalledTimes(1);
  });

  it("turns network failures into relay errors", async () => {
    const curl = fakeCurl();
    curl.fetch.mockRejectedValue(new Error("Websocket connection failed"));
    const send = beyondFetch("wss://relay.test/", { load: async () => curl });
    await expect(send("https://example.test/")).rejects.toMatchObject({ name: "RelayError", relay: "wss://relay.test/" });
    await expect(beyondFetch(DEFAULT_RELAY, { load: async () => { throw new Error("no wasm"); } })("https://x.test/"))
      .rejects.toBeInstanceOf(RelayError);
  });

  it("reads and writes characters without a bridge", async () => {
    const urls = [];
    const fetchImpl = vi.fn(async (url) => {
      urls.push(url);
      if (url.includes("cobalt-token")) return { ok: true, status: 200, json: async () => ({ token: "jwt" }) };
      if (url.includes("/character/v5/character/")) return { ok: true, status: 200, json: async () => ({ data: { id: 7 } }) };
      return { ok: true, status: 200 };
    });
    const config = { cobaltCookie: "cookie", relayUrl: DEFAULT_RELAY };
    await expect(fetchCharacterData("7", config, fetchImpl)).resolves.toEqual({ success: true, ddb: { character: { id: 7 } } });
    await expect(sendBeyondCalls("7", [{ method: "PUT", path: "character/inspiration", body: { inspiration: true } }], config, fetchImpl))
      .resolves.toEqual({ success: true, done: 1 });
    expect(urls.some((url) => url.startsWith("http://127.0.0.1"))).toBe(false);

    const down = async () => { throw new RelayError("closed", DEFAULT_RELAY); };
    await expect(fetchCharacterData("7", config, down)).resolves.toMatchObject({ success: false, reason: "relay-down" });
    await expect(sendBeyondCalls("7", [{ method: "PUT", path: "character/inspiration", body: {} }], config, down))
      .resolves.toMatchObject({ success: false, reason: "relay-down", done: 0 });
  });

  it("keeps the count when the relay drops mid-write", async () => {
    let writes = 0;
    const fetchImpl = async (url) => {
      if (url.includes("cobalt-token")) return { ok: true, status: 200, json: async () => ({ token: "jwt" }) };
      writes += 1;
      if (writes === 2) throw new RelayError("closed", DEFAULT_RELAY);
      return { ok: true, status: 200 };
    };
    const result = await sendBeyondCalls("7", [
      { method: "PUT", path: "character/inspiration", body: {} },
      { method: "PUT", path: "life/death-saves", body: {} }
    ], { cobaltCookie: "cookie" }, fetchImpl);
    expect(result).toMatchObject({ success: false, reason: "PUT life/death-saves", done: 1 });
  });

  it("defaults the relay setting", () => {
    installFoundry({ settings: {} });
    expect(connectionConfig().relayUrl).toBe(DEFAULT_RELAY);
    installFoundry({ settings: { ddbRelayUrl: " wss://mine.test/ " } });
    expect(connectionConfig().relayUrl).toBe("wss://mine.test/");
  });

  it("keeps trying while the relay is unreachable", async () => {
    vi.useFakeTimers();
    installFoundry({
      settings: { ddbEnabled: true, ddbCobaltCookie: "cookie", ddbUserId: "1", ddbCampaignId: "2" }
    });
    game.users = [{ id: "user1", active: true, isGM: true }];
    const attempts = vi.fn();
    const manager = new BeyondSyncManager();
    const realConnect = manager.connect.bind(manager);
    manager.connect = async () => {
      attempts();
      return realConnect();
    };
    const { BeyondSocket } = await import("../src/dnd-beyond-sync/websocket.mjs");
    const spy = vi.spyOn(BeyondSocket.prototype, "fetchAccessToken").mockImplementation(async function () {
      this.dispatchEvent(new CustomEvent("relayDown"));
      return null;
    });

    manager.follow();
    await vi.waitFor(() => expect(beyondStatus()).toMatch(/through the relay/));
    expect(manager.socket).toBe(null);
    expect(attempts).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(RELAY_RETRY_MS);
    expect(attempts).toHaveBeenCalledTimes(2);
    manager.shutdown();
    await vi.advanceTimersByTimeAsync(RELAY_RETRY_MS);
    expect(attempts).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
