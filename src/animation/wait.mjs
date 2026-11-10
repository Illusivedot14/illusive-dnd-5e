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
