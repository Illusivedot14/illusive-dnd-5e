/**
 * Attack vs AC resolution.
 */

/**
 * @param {{ attackTotal: number, ac: number|null|undefined, isCritical?: boolean, isFumble?: boolean }} input
 */
export function evaluateAttackVsAc(input = {}) {
  const total = Number(input.attackTotal);
  const ac = input.ac == null ? null : Number(input.ac);

  if (input.isFumble) {
    return { hit: false, critical: false, fumble: true, reason: "fumble" };
  }
  if (input.isCritical) {
    return { hit: true, critical: true, fumble: false, reason: "critical" };
  }
  if (!Number.isFinite(total)) {
    return { hit: false, critical: false, fumble: false, reason: "no-attack-total" };
  }
  if (ac == null || !Number.isFinite(ac)) {
    return { hit: true, critical: false, fumble: false, reason: "no-ac" };
  }
  if (total >= ac) {
    return { hit: true, critical: false, fumble: false, reason: "hit" };
  }
  return { hit: false, critical: false, fumble: false, reason: "miss" };
}

/**
 * @param {object[]} targets  { uuid, ac, name? }
 * @param {{ attackTotal: number, isCritical?: boolean, isFumble?: boolean }} attack
 */
export function evaluateAttackTargets(targets, attack) {
  return (targets ?? []).map((t) => {
    const outcome = evaluateAttackVsAc({
      attackTotal: attack.attackTotal,
      ac: t.ac,
      isCritical: attack.isCritical,
      isFumble: attack.isFumble
    });
    return { uuid: t.uuid, ac: t.ac ?? null, name: t.name ?? null, ...outcome };
  });
}
