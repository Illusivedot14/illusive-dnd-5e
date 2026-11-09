/**
 * Normalized lighting state and queries. Pure.
 */

/**
 * @param {object} input
 * @param {{ x: number, y: number }} input.point  scene pixels or grid — caller normalizes
 * @param {Array<{ x: number, y: number, bright: number, dim: number, luminosity?: number }>} input.lights
 * @param {number} [input.gridSize]
 * @param {boolean} [input.globalDarkness]
 * @returns {{ illuminated: boolean, darkness: boolean, level: "bright"|"dim"|"dark", sources: number }}
 */
export function evaluateLightAt(input) {
  const lights = input.lights ?? [];
  const size = Number(input.gridSize) || 100;
  const px = input.point;
  let best = "dark";
  let sources = 0;

  for (const light of lights) {
    const dx = (px.x - light.x) / size;
    const dy = (px.y - light.y) / size;
    const dist = Math.hypot(dx, dy);
    const bright = Number(light.bright) || 0;
    const dim = Number(light.dim) || 0;
    if (dist <= bright && bright > 0) {
      best = "bright";
      sources += 1;
    } else if (dist <= dim && dim > 0) {
      if (best !== "bright") best = "dim";
      sources += 1;
    }
  }

  const darkness = Boolean(input.globalDarkness) && best === "dark";
  return {
    illuminated: best !== "dark",
    darkness,
    level: best,
    sources
  };
}
