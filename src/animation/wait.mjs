/**
 * Which running Sequencer effects a resolution should wait for. A lingering
 * aura never ends, and an effect older than a few seconds belongs to an
 * earlier action. Pure: the caller lists the effects Sequencer reports.
 */

export function relevantAnimations(effects, uuids, now, { recentMs = 3000 } = {}) {
  const wanted = new Set([...uuids].filter(Boolean));
  if (!wanted.size) return [];
  return (effects ?? [])
    .filter((e) => !e.ended && !e.persist && (now - e.started) <= recentMs
      && (wanted.has(e.source) || wanted.has(e.target)))
    .map((e) => e.id);
}

function sequencerEffects() {
  const manager = globalThis.Sequencer?.EffectManager;
  if (!manager) return null;
  if (typeof manager.getEffects === "function") return manager.getEffects() ?? [];
  if (Array.isArray(manager.effects)) return manager.effects;
  return [];
}

/**
 * Hold a hit-point write until the swing, including rider impacts, has finished.
 * With no Sequencer effects there is nothing to wait for.
 */
export async function waitForCombatAnimations(uuids, {
  timeoutMs = 8000,
  pollMs = 40,
  now = () => Date.now(),
  list = null
} = {}) {
  const read = list ?? sequencerEffects;
  const first = read?.() ?? null;
  if (!first) return;
  const started = now();
  let saw = relevantAnimations(first, uuids, started).length > 0;
  while (now() - started < timeoutMs) {
    const live = relevantAnimations(read() ?? [], uuids, now());
    if (live.length) saw = true;
    else if (saw || now() - started >= 80) return;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
