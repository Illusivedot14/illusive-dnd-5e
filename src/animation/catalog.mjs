/**
 * Free JB2A names (the Patreon pack keeps the same ones). Sequencer plays them.
 * Sounds are omitted: PSFX is not installed.
 */

export const IMPACTS = Object.freeze({
  acid: { file: "jb2a.impact.004.blue", tint: "#6fd02a" },
  bludgeoning: { file: "jb2a.impact.005.orange" },
  cold: { file: "jb2a.impact_themed.ice_shard.blue" },
  fire: { file: "jb2a.impact.fire.01.orange" },
  force: { file: "jb2a.impact.011.blue" },
  lightning: { file: "jb2a.static_electricity.01.blue" },
  necrotic: { file: "jb2a.toll_the_dead.green.skull_smoke" },
  piercing: { file: "jb2a.impact.007.yellow" },
  poison: { file: "jb2a.icon.poison.dark_green" },
  psychic: { file: "jb2a.impact.004.blue", tint: "#c060ff" },
  radiant: { file: "jb2a.divine_smite.target.blueyellow" },
  slashing: { file: "jb2a.impact.008.orange" },
  thunder: { file: "jb2a.thunderwave.center.blue" },
  healing: { file: "jb2a.healing_generic.400px.green" }
});

export const AREAS = Object.freeze({
  fire: { circle: "jb2a.fireball.explosion.orange", cone: "jb2a.burning_hands.01.orange", line: "jb2a.breath_weapons.fire.line.orange" },
  cold: { circle: "jb2a.ice_spikes.radial.burst.white", cone: "jb2a.cone_of_cold.blue", line: "jb2a.template_line.ice.01.blue" },
  lightning: { circle: "jb2a.template_circle.lightning.01.loop.bluepurple", cone: "jb2a.template_cone_5e.lightning.01.loop.bluepurple.30ft", line: "jb2a.lightning_bolt.wide.blue" },
  acid: { circle: "jb2a.liquid.splash.blue", cone: "jb2a.breath_weapons.poison.cone.green", line: "jb2a.breath_weapons.acid.line.green", tint: "#6fd02a" },
  poison: { circle: "jb2a.template_circle.smoke.001.complete.800px.001.greenpurple", cone: "jb2a.breath_weapons.poison.cone.green", tint: "#9ad000" },
  thunder: { circle: "jb2a.thunderwave.center.blue" },
  force: { circle: "jb2a.template_circle.out_pulse.01.burst.bluewhite" },
  necrotic: { circle: "jb2a.toll_the_dead.green.shockwave" },
  radiant: { circle: "jb2a.template_circle.out_pulse.02.burst.bluewhite", tint: "#fff2a0" },
  healing: { circle: "jb2a.template_circle.out_pulse.01.burst.bluewhite", tint: "#60e090" }
});

export const AREAS_BY_ID = Object.freeze({
  fireball: { circle: "jb2a.fireball.explosion.orange" },
  "burning-hands": { cone: "jb2a.burning_hands.01.orange" },
  "cone-of-cold": { cone: "jb2a.cone_of_cold.blue" },
  "lightning-bolt": { line: "jb2a.lightning_bolt.wide.blue" },
  moonbeam: { circle: "jb2a.moonbeam.01.loop.blue", persist: true },
  "spirit-guardians": { circle: "jb2a.spirit_guardians.blueyellow.ring", persist: true },
  web: { circle: "jb2a.web.loop.002.white", persist: true },
  darkness: { circle: "jb2a.darkness.black", persist: true },
  "fog-cloud": { circle: "jb2a.fog_cloud.01.white", persist: true },
  entangle: { circle: "jb2a.entangle.02.loop.02.green", persist: true }
});

const SHAPE = Object.freeze({ cone: "cone", ray: "line", line: "line" });

export function impactFor(type) {
  return IMPACTS[type] ?? IMPACTS.force;
}

/** A JB2A area file for this spell or damage type and template shape. */
export function areaFor({ identifier = null, damageType = null, shape = "circle" } = {}) {
  const key = SHAPE[shape] ?? "circle";
  const named = identifier ? AREAS_BY_ID[identifier] : null;
  const row = named ?? AREAS[damageType] ?? AREAS.force;
  return {
    file: row[key] ?? row.circle,
    tint: row.tint ?? null,
    persist: Boolean(named?.persist)
  };
}
