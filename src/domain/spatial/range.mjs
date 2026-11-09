/**
 * Pure range adjudication (DAS-style).
 * Measured distance vs normal / long / minimum bands.
 */

/**
 * @param {{ value: number, units?: string }} measured
 * @param {{ value: number|null|undefined, long?: number|null, units?: string }} range
 * @returns {"outOfRange"|"longRange"|null}
 */
export function rangeIssue(measured, range) {
  const dist = Number(measured?.value);
  const near = Number(range?.value);
  if (!Number.isFinite(dist) || !Number.isFinite(near)) return null;
  if (dist <= near + 1e-6) return null;
  const far = Number(range?.long);
  if (Number.isFinite(far) && dist <= far + 1e-6) return "longRange";
  return "outOfRange";
}

/**
 * Minimum range (e.g. trebuchet): too close when measured ≤ min.
 * @param {{ value: number }} measured
 * @param {{ value: number }|null|undefined} min
 */
export function tooClose(measured, min) {
  const dist = Number(measured?.value);
  const floor = Number(min?.value);
  if (!Number.isFinite(dist) || !Number.isFinite(floor)) return false;
  return dist <= floor + 1e-6;
}

/**
 * Combine planar footprint distance with vertical gap (Chebyshev 3D).
 * Overlapping elevation slabs → vertical 0.
 */
export function combinePlanarVertical(planarFeet, verticalFeet) {
  const planar = Math.max(0, Number(planarFeet) || 0);
  const vertical = Math.max(0, Number(verticalFeet) || 0);
  return Math.max(planar, vertical);
}

/**
 * Vertical gap between two elevation slabs [elev, elev + heightFeet].
 * Token depth defaults to one grid step × max(width, height) when omitted.
 */
export function verticalGapFeet(a, b, { gridDistance = 5 } = {}) {
  const step = Number(gridDistance) || 5;
  const slab = (t) => {
    const elev = Number(t?.elevation) || 0;
    const depthSquares = Number.isFinite(Number(t?.depth))
      ? Math.max(0, Number(t.depth))
      : Math.max(1, Number(t?.width) || 1, Number(t?.height) || 1);
    const top = elev + depthSquares * step;
    return { bottom: elev, top };
  };
  const A = slab(a);
  const B = slab(b);
  if (A.top < B.bottom) return B.bottom - A.top;
  if (B.top < A.bottom) return A.bottom - B.top;
  return 0;
}
