/**
 * Which installed module plays a visual, in DAS source order.
 * Boss Loot is absent here, so it is not pinned. Automated Animations plays
 * only when it already has a match; otherwise the next source does.
 */

export const SOURCES = Object.freeze(["aa", "jb2a", "tokenmagic", "native"]);

export const DOMAINS = Object.freeze({
  strikes: ["aa", "jb2a", "tokenmagic", "native"],
  areas: ["aa", "jb2a", "tokenmagic", "native"],
  auras: ["jb2a", "tokenmagic", "native"]
});

const KIND_DOMAIN = Object.freeze({
  attackHit: "strikes",
  damage: "strikes",
  hitRider: "strikes",
  overTime: "strikes",
  reaction: "strikes",
  templatePlace: "areas",
  templateSave: "areas",
  aura: "auras",
  summon: "strikes"
});

export function domainFor(kind) {
  return KIND_DOMAIN[kind] ?? null;
}

export function defaultSources() {
  return {
    order: [...SOURCES],
    off: [],
    domains: Object.fromEntries(Object.keys(DOMAINS).map((d) => [d, true]))
  };
}

export function sourceChain(domain, value, available = {}) {
  const v = value ?? defaultSources();
  if (!DOMAINS[domain] || v.domains?.[domain] === false) return [];
  const order = v.order?.length ? v.order : SOURCES;
  return order.filter((s) => DOMAINS[domain].includes(s)
    && !v.off?.includes(s)
    && (s === "native" || available[s]));
}

/** First source that should play. Automated Animations only when it has a match. */
export function pickSource(domain, value, available = {}, { aaMatch = false } = {}) {
  const chain = sourceChain(domain, value, available);
  if (aaMatch && chain.includes("aa")) return "aa";
  return chain.find((s) => s !== "aa") ?? null;
}
