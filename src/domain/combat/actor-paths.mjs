/**
 * dnd5e 6 moved speeds to `movement.speeds.*` and senses to `senses.ranges.*`;
 * the old flat keys remain as deprecated getters until dnd5e 7.
 */

export function movementSpeed(movement, key = "walk") {
  if (!movement) return 0;
  const raw = movement.speeds?.[key] ?? movement[key] ?? (key === "walk" ? movement.speed : undefined);
  return Math.max(0, Number(raw) || 0);
}

/** Speed shown on stat blocks: walk, else fly, else swim. */
export function primarySpeed(movement) {
  return movementSpeed(movement, "walk") || movementSpeed(movement, "fly") || movementSpeed(movement, "swim");
}

export function senseRange(senses, key) {
  if (!senses) return 0;
  return Math.max(0, Number(senses.ranges?.[key] ?? senses[key]) || 0);
}
