export const BEYOND_AUTH_URL = "https://auth-service.dndbeyond.com/v1/cobalt-token";
const SERVICE_URL = "https://character-service.dndbeyond.com/character/v5";
const CHARACTER_URL = `${SERVICE_URL}/character`;

/** Exchange a CobaltSession cookie for a short-lived token. A bad cookie answers 200 with a null token. */
export async function exchangeCobalt(cobalt, fetchImpl) {
  const response = await fetchImpl(BEYOND_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `CobaltSession=${cobalt ?? ""}`
    },
    body: "{}"
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, token: body?.token ?? null, ttl: body?.ttl ?? null };
}

/** Read one character, including removedHitPoints, using a fresh token. */
export async function readBeyondCharacter(cobalt, characterId, fetchImpl) {
  const auth = await exchangeCobalt(cobalt, fetchImpl);
  if (!auth.token) return { success: false, reason: "auth", status: auth.status };
  const response = await fetchImpl(
    `${CHARACTER_URL}/${characterId}?includeCustomItems=true`,
    { headers: { Authorization: `Bearer ${auth.token}`, Cookie: `CobaltSession=${cobalt}` } }
  );
  if (!response.ok) return { success: false, reason: "character", status: response.status };
  const body = await response.json().catch(() => null);
  const character = body?.data ?? null;
  if (!character) return { success: false, reason: "character" };
  return { success: true, ddb: { character } };
}

function wholeOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

/**
 * The character-service calls the D&D Beyond sheet makes for play state.
 * Routes and bodies come from the sheet bundle (`ApiRequests.put*`, `post*`, `delete*`).
 */
export const BEYOND_WRITE_ROUTES = new Set([
  "PUT life/hp/damage-taken",
  "PUT life/hp/bonus",
  "PUT life/death-saves",
  "PUT character/inspiration",
  "PUT character/progression",
  "PUT inventory/currency",
  "PUT spell/slots",
  "PUT spell/pact-magic",
  "PUT condition",
  "DELETE condition",
  "POST character/rest/short",
  "POST character/rest/long",
  "PUT action/limited-use",
  "PUT inventory/item/charge",
  "PUT inventory/item/equipped",
  "PUT inventory/item/attuned"
]);

/**
 * Send calls in order, as the sheet does: each body gets `characterId`.
 * Stops at the first failure and reports how many went through.
 */
export async function writeBeyondCalls(cobalt, body, fetchImpl) {
  const characterId = wholeOrNull(body?.characterId);
  if (!characterId) return { success: false, reason: "noCharacter", done: 0 };
  const calls = Array.isArray(body?.calls) ? body.calls : [];
  if (!calls.length) return { success: false, reason: "empty", done: 0 };
  const blocked = calls.find((call) => !BEYOND_WRITE_ROUTES.has(`${call?.method} ${call?.path}`));
  if (blocked) return { success: false, reason: "route", route: `${blocked?.method} ${blocked?.path}`, done: 0 };

  const auth = await exchangeCobalt(cobalt, fetchImpl);
  if (!auth.token) return { success: false, reason: "auth", status: auth.status, done: 0 };
  let done = 0;
  for (const call of calls) {
    let response;
    try {
      response = await fetchImpl(`${SERVICE_URL}/${call.path}`, {
        method: call.method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.token}`,
          Cookie: `CobaltSession=${cobalt}`
        },
        body: JSON.stringify({ ...(call.body ?? {}), characterId })
      });
    } catch (error) {
      return { success: false, reason: `${call.method} ${call.path}`, error: error?.message ?? "network", done };
    }
    if (!response.ok) return { success: false, reason: `${call.method} ${call.path}`, status: response.status, done };
    done += 1;
  }
  return { success: true, done };
}
