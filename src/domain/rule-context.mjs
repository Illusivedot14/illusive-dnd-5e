/**
 * Explicit 2014/2024 rules context for domain procedures.
 * Pure: no Foundry globals.
 */

/**
 * @param {object} [input]
 * @param {"2014"|"2024"} [input.edition]
 * @param {string} [input.source]
 * @returns {{ edition: "2014"|"2024", legacy: boolean, source: string|null }}
 */
export function createRuleContext(input = {}) {
  const edition = input.edition === "2014" ? "2014" : "2024";
  return {
    edition,
    legacy: edition === "2014",
    source: input.source ?? null
  };
}
