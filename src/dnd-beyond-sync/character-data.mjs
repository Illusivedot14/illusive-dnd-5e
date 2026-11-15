import { connectionConfig } from "./settings.mjs";
import { readBeyondCharacter, writeBeyondCalls } from "./beyond-api.mjs";
import { beyondFetch, describeFetchFailure } from "./fetch.mjs";

/**
 * Read one Beyond character, including removedHitPoints.
 * @returns {Promise<{ success: boolean, ddb?: { character?: object }, reason?: string }>}
 */
export async function fetchCharacterData(characterId, config = connectionConfig(), fetchImpl = beyondFetch(config.relayUrl)) {
  try {
    return await readBeyondCharacter(config.cobaltCookie ?? "", characterId, fetchImpl);
  } catch (error) {
    return { success: false, ...describeFetchFailure(error, "character") };
  }
}

/**
 * Send calls to Beyond, in order.
 * @param {{ method: string, path: string, body: object }[]} calls
 * @returns {Promise<{ success: boolean, done?: number, reason?: string, status?: number }>}
 */
export async function sendBeyondCalls(characterId, calls, config = connectionConfig(), fetchImpl = beyondFetch(config.relayUrl)) {
  try {
    return await writeBeyondCalls(config.cobaltCookie ?? "", { characterId, calls }, fetchImpl);
  } catch (error) {
    return { success: false, done: 0, ...describeFetchFailure(error, "update") };
  }
}
