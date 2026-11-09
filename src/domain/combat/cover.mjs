/**
 * Cover matrix — pure evaluation from geometric / wall facts.
 *
 * 2024 & 2014 share the same mechanical bonuses:
 *   half → +2 AC & Dex saves
 *   three-quarters → +5 AC & Dex saves
 *   total → cannot be targeted
 *
 * Callers supply how much of the target is blocked (0–1) and whether
 * a sight-blocking wall creates total cover.
 */

export const COVER_LEVELS = Object.freeze(["none", "half", "three-quarters", "total"]);

const BONUSES = Object.freeze({
  none: { ac: 0, dexSave: 0, canTarget: true },
  half: { ac: 2, dexSave: 2, canTarget: true },
  "three-quarters": { ac: 5, dexSave: 5, canTarget: true },
  total: { ac: 0, dexSave: 0, canTarget: false }
});

/**
 * Map blocked fraction → cover level.
 * Defaults match common Foundry/table practice:
 *   < 1/2 → none, ≥ 1/2 → half, ≥ 3/4 → three-quarters, full wall → total
 */
export function coverLevelFromBlockedFraction(fraction, { totalCover = false } = {}) {
  if (totalCover) return "total";
  const f = Math.max(0, Math.min(1, Number(fraction) || 0));
  if (f >= 0.999) return "total";
  if (f >= 0.75) return "three-quarters";
  if (f >= 0.5) return "half";
  return "none";
}

/**
 * Soft three-quarters band: sampling cannot reliably separate half from ¾.
 * Callers should prompt the GM when this is true (unless total / same-square).
 */
export function isCoverAmbiguous(fraction, { totalCover = false } = {}) {
  if (totalCover) return false;
  const f = Math.max(0, Math.min(1, Number(fraction) || 0));
  if (f >= 0.999 || f >= 0.75) return false;
  return f >= 0.5;
}

/** Rebuild cover bonuses for an explicitly chosen level. */
export function coverResultForLevel(level, { edition = "2024", factors = [] } = {}) {
  const ed = edition === "2014" ? "2014" : "2024";
  const lvl = COVER_LEVELS.includes(level) ? level : "none";
  return {
    level: lvl,
    ...spreadBonuses(lvl),
    edition: ed,
    rule: ed === "2014" ? "combat.cover.2014" : "combat.cover.2024",
    factors,
    ambiguous: false
  };
}

/**
 * @param {object} input
 * @param {number} [input.blockedFraction] 0–1 of silhouette blocked
 * @param {boolean} [input.totalCover] sight-blocking wall with no gap
 * @param {boolean} [input.sameSquare] attacker in target's space → usually none
 * @param {"2024"|"2014"} [input.edition]
 * @returns {{
 *   level: string,
 *   acBonus: number,
 *   dexSaveBonus: number,
 *   canTarget: boolean,
 *   edition: string,
 *   rule: string,
 *   factors: object[]
 * }}
 */
export function evaluateCover(input = {}) {
  const edition = input.edition === "2014" ? "2014" : "2024";
  const rule = edition === "2014" ? "combat.cover.2014" : "combat.cover.2024";
  const factors = [];

  if (input.sameSquare) {
    factors.push({ code: "same-square", detail: "Attacker shares the target's space" });
    return {
      level: "none",
      ...spreadBonuses("none"),
      edition,
      rule,
      factors,
      ambiguous: false,
      blockedFraction: 0
    };
  }

  if (input.totalCover) {
    factors.push({ code: "blocking-wall", detail: "Sight-blocking cover with no clear lane" });
  }

  const fraction = input.blockedFraction ?? 0;
  const totalCover = Boolean(input.totalCover);
  const level = coverLevelFromBlockedFraction(fraction, { totalCover });
  const ambiguous = Boolean(input.forceAmbiguous)
    || isCoverAmbiguous(fraction, { totalCover });
  factors.push({
    code: "blocked-fraction",
    detail: `Blocked ≈ ${Math.round((Number(fraction) || 0) * 100)}%`
  });
  if (ambiguous) {
    factors.push({ code: "ambiguous", detail: "Soft cover — GM chooses half / three-quarters / none" });
  }

  return {
    level,
    ...spreadBonuses(level),
    edition,
    rule,
    factors,
    ambiguous,
    blockedFraction: Math.max(0, Math.min(1, Number(fraction) || 0))
  };
}

function spreadBonuses(level) {
  const b = BONUSES[level] ?? BONUSES.none;
  return {
    acBonus: b.ac,
    dexSaveBonus: b.dexSave,
    canTarget: b.canTarget
  };
}

/** Apply cover bonuses onto a plain AC / save preview object. */
export function applyCoverToDefenses(defenses, cover) {
  if (!cover || cover.level === "none" || cover.level === "total") {
    return {
      ...defenses,
      coverLevel: cover?.level ?? "none",
      canTarget: cover?.canTarget ?? true,
      ac: defenses?.ac ?? null,
      dexSave: defenses?.dexSave ?? null
    };
  }
  return {
    ...defenses,
    coverLevel: cover.level,
    canTarget: true,
    ac: (Number(defenses?.ac) || 0) + cover.acBonus,
    dexSave: defenses?.dexSave == null ? null : (Number(defenses.dexSave) || 0) + cover.dexSaveBonus,
    acBonusFromCover: cover.acBonus,
    dexSaveBonusFromCover: cover.dexSaveBonus
  };
}

/**
 * Bake half / three-quarters cover into a target's AC for attack resolution.
 * Total cover leaves AC unchanged and sets canTarget false (caller should gate).
 */
export function bakeCoverIntoAc(ac, cover) {
  if (!cover || cover.level === "none" || cover.level === "total") {
    return {
      ac: ac == null ? null : Number(ac),
      acBonus: 0,
      level: cover?.level ?? "none",
      canTarget: cover?.canTarget ?? true
    };
  }
  const base = Number(ac);
  const bonus = Number(cover.acBonus) || 0;
  return {
    ac: Number.isFinite(base) ? base + bonus : bonus,
    acBonus: bonus,
    level: cover.level,
    canTarget: true
  };
}

/** Dexterity save bonus from cover (0 unless ability is dex). */
export function bakeCoverIntoDexSave(ability, cover) {
  if (ability !== "dex" || !cover) return 0;
  if (cover.level === "none" || cover.level === "total") return 0;
  return Number(cover.dexSaveBonus) || 0;
}
