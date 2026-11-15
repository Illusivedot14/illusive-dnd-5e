/**
 * D&D Beyond only answers its own website, so the page cannot use the browser's fetch.
 * libcurl.js runs HTTP and TLS inside the page and sends only encrypted bytes through a Wisp relay,
 * so the relay never sees the cookie, the token, or the character.
 */
import { beyondDebug } from "./debug.mjs";

export const DEFAULT_RELAY = "wss://wisp.mercurywork.shop/";
const LIBCURL_URL = new URL("../../vendor/libcurl/libcurl.mjs", import.meta.url).href;
const WASM_URL = new URL("../../vendor/libcurl/libcurl.wasm", import.meta.url).href;

let loading = null;

/** Load libcurl.js once per page. */
export function loadCurl({ importer = (url) => import(url) } = {}) {
  loading ??= (async () => {
    const { libcurl } = await importer(LIBCURL_URL);
    libcurl.stdout = () => {};
    libcurl.stderr = () => {};
    await libcurl.load_wasm(WASM_URL);
    return libcurl;
  })().catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

export class RelayError extends Error {
  constructor(message, relay) {
    super(message);
    this.name = "RelayError";
    this.relay = relay;
  }
}

export const REQUEST_TIMEOUT_MS = 20000;
let session = null;

/** libcurl pools one Wisp connection per relay. A connection that died silently hangs every request, so drop it. */
export function resetRelay(curl) {
  const pool = curl?.wisp?.wisp_connections ?? {};
  for (const [url, connection] of Object.entries(pool)) {
    delete pool[url];
    try { connection?.ws?.close?.(); } catch { /* already closed */ }
  }
  try { session?.close?.(); } catch { /* already closed */ }
  session = null;
}

function sessionFor(curl) {
  if (typeof curl.HTTPSession !== "function") return curl;
  session ??= new curl.HTTPSession();
  return session;
}

async function timedFetch(curl, url, options, timeout) {
  const controller = new AbortController();
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`No answer through the relay within ${timeout / 1000} seconds.`));
    }, timeout);
  });
  const request = (async () => {
    const response = await sessionFor(curl).fetch(url, { ...options, signal: controller.signal });
    if (typeof response?.arrayBuffer !== "function") return response;
    const body = await response.arrayBuffer();
    return new Response(body.byteLength ? body : null, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  })();
  try {
    return await Promise.race([request, expired]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A fetch that reaches D&D Beyond from the page through the relay. Network failures throw `RelayError`.
 * A failed request resets the relay connection. Reads try once more on the fresh connection.
 */
export function beyondFetch(relay = DEFAULT_RELAY, { load = loadCurl, timeout = REQUEST_TIMEOUT_MS } = {}) {
  return async (url, options = {}) => {
    const attempts = String(options.method ?? "GET").toUpperCase() === "GET" ? 2 : 1;
    let curl = null;
    let failure = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        curl ??= await load();
        if (curl.websocket_url !== relay) curl.set_websocket(relay);
        return await timedFetch(curl, url, options, timeout);
      } catch (error) {
        failure = error;
        beyondDebug("relay-reset", { attempt: attempt + 1, of: attempts, error: error?.message ?? String(error) });
        resetRelay(curl);
      }
    }
    throw new RelayError(failure?.message ?? String(failure), relay);
  };
}

/** Turn a thrown request into a log entry. */
export function describeFetchFailure(error, url) {
  if (error?.name === "RelayError") {
    return {
      reason: "relay-down",
      url,
      relay: error.relay,
      detail: "The page could not reach D&D Beyond through the relay."
    };
  }
  return { reason: error?.message || "failed", url };
}
