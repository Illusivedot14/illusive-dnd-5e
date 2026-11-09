/**
 * Self-origin template anchoring (Foundry token geometry only).
 * Cones/lines stick to the caster token edge; emanations stick to center.
 */

/**
 * Point on an axis-aligned token border in the direction of (targetX, targetY).
 * @param {{ center: {x:number,y:number}, w: number, h: number }} token
 * @param {number} targetX
 * @param {number} targetY
 */
export function tokenBorderPoint(token, targetX, targetY) {
  const cx = Number(token?.center?.x) || 0;
  const cy = Number(token?.center?.y) || 0;
  const halfW = Math.max(1, Number(token?.w) || 0) / 2;
  const halfH = Math.max(1, Number(token?.h) || 0) / 2;
  const dx = Number(targetX) - cx;
  const dy = Number(targetY) - cy;
  if (dx === 0 && dy === 0) return { x: cx + halfW, y: cy };
  const scaleX = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? halfH / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

/** Direction in degrees (Foundry: 0 = east, clockwise-positive via atan2). */
export function directionToward(from, to) {
  const dx = Number(to?.x) - Number(from?.x);
  const dy = Number(to?.y) - Number(from?.y);
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

function isSelfishRange(range = {}) {
  const units = range?.units;
  if (units === "self" || units === "none") return true;
  const hasDistance = Number(range?.value) > 0 || Number(range?.long) > 0;
  if (hasDistance) return false;
  // No numeric range and not an explicit touch/ranged unit → treat as from-self
  if (units === "touch" || units === "ft" || units === "m" || units === "km" || units === "mi") {
    return false;
  }
  return true;
}

/**
 * @returns {"edge"|"center"|null}
 *   edge   — cone/ray origin locked to token border (mouse aims)
 *   center — emanation locked to token center
 *   null   — free placement (Fireball, etc.)
 */
export function templateAnchorMode(activity, shape = null) {
  const areaType = activity?.target?.template?.type;
  // Emanations always surround their creature, whatever the listed range.
  if (shape?.t === "emanation" || areaType === "radius") return "center";

  const range = activity?.range ?? {};
  if (!isSelfishRange(range)) return null;

  const t = shape?.t
    ?? (areaType === "line" ? "ray"
      : areaType === "cone" ? "cone"
        : areaType === "radius" || areaType === "sphere" || areaType === "cylinder" || areaType === "circle"
          ? "circle"
          : null);

  if (t === "cone" || t === "ray" || areaType === "cone" || areaType === "line" || areaType === "wall") {
    return "edge";
  }
  if (t === "circle" || areaType === "sphere" || areaType === "cylinder") {
    return "center";
  }
  return null;
}
