/**
 * What to play for one combat-fx event. Automated Animations wins when it has
 * a match, because it already hooks the same dnd5e rolls. Otherwise JB2A,
 * Token Magic, or a plain ring.
 */

import { domainFor, pickSource } from "./sources.mjs";
import { areaFor, impactFor } from "./catalog.mjs";

/**
 * @param {{ kind?: string, shape?: string|null, identifier?: string|null, damageType?: string|null }} evt
 * @param {{ aaMatch?: boolean, available?: object, sources?: object }} ctx
 * @returns {{ source: string, play: object } | null}
 */
export function planFx(evt, { aaMatch = false, available = {}, sources = null } = {}) {
  const domain = domainFor(evt?.kind);
  if (!domain) return null;
  const source = pickSource(domain, sources, available, { aaMatch });
  if (!source || source === "aa") return source === "aa" ? { source: "aa", play: null } : null;
  if (source === "jb2a") {
    const play = domain === "strikes"
      ? { at: "targets", ...impactFor(evt.damageType), persist: false }
      : {
        at: domain === "auras" ? "source" : "area",
        ...areaFor({ identifier: evt.identifier, damageType: evt.damageType, shape: evt.shape })
      };
    return { source, play };
  }
  const tint = evt.damageType === "healing" ? "#60e090" : "#ff5040";
  return { source, play: { at: domain === "areas" ? "area" : "targets", tint, persist: false } };
}
