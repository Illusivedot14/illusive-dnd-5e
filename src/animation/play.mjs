/**
 * Play one planned visual through the module that owns it. Sequencer needs a
 * JB2A (or Patreon) database entry. Token Magic and the plain ring cover the
 * rest. Nothing here runs unless a plan asked for it.
 */

function tokenObjects(uuids) {
  const out = [];
  for (const uuid of uuids ?? []) {
    const doc = globalThis.fromUuidSync?.(uuid, { strict: false });
    const obj = doc?.object ?? doc;
    if (obj) out.push(obj);
  }
  return out;
}

function placesFor(evt, at) {
  if (at === "area") return [evt.tokenUuid, ...(evt.targetUuids ?? [])].filter(Boolean);
  if (at === "source") return [evt.tokenUuid].filter(Boolean);
  const targets = evt.targetUuids ?? [];
  return targets.length ? targets : [evt.tokenUuid].filter(Boolean);
}

/** Far end of a cone or line. Direction is degrees, 0 = east, canvas y grows down. */
export function templateEnd(point, direction, distanceFeet, { gridDistance = 5, gridSize = 100 } = {}) {
  const feet = Number(distanceFeet) || 0;
  const pixels = (feet / (gridDistance || 5)) * (gridSize || 100);
  const rad = ((Number(direction) || 0) * Math.PI) / 180;
  return {
    x: point.x + Math.cos(rad) * pixels,
    y: point.y + Math.sin(rad) * pixels
  };
}

function gridFacts() {
  const grid = globalThis.canvas?.scene?.grid;
  return {
    gridDistance: Number(grid?.distance) || 5,
    gridSize: Number(grid?.size) || 100
  };
}

async function playSequencer(play, places, { point = null, distance = null, direction = null, shape = null } = {}) {
  const Sequence = globalThis.Sequence;
  if (!Sequence || !play?.file) return false;
  const known = globalThis.Sequencer?.Database?.entryExists?.(play.file);
  if (known === false) return false;
  const sequence = new Sequence();
  const aimed = shape === "cone" || shape === "ray";
  const spots = point ? [point] : places;
  for (const place of spots) {
    const effect = sequence.effect().file(play.file).atLocation(place);
    if (aimed && point && typeof effect.stretchTo === "function") {
      effect.stretchTo(templateEnd(point, direction, distance, gridFacts()), { onlyX: true });
    } else if (!aimed && point && distance && typeof effect.size === "function") {
      const span = shape === "rect" ? distance : distance * 2;
      effect.size(span, { gridUnits: true });
    } else if (typeof effect.scaleToObject === "function") {
      effect.scaleToObject(1.5);
    }
    if (play.tint && typeof effect.tint === "function") effect.tint(play.tint);
    if (play.persist && typeof effect.persist === "function") effect.persist(true);
  }
  if (!spots.length) return false;
  await sequence.play();
  return true;
}

async function playTokenMagic(places, tint) {
  const TM = globalThis.TokenMagic;
  if (typeof TM?.addUpdateFilters !== "function") return false;
  const color = Number.parseInt(String(tint ?? "#ff5040").replace("#", ""), 16);
  const filterId = "illusive-dnd-5e-fx";
  for (const place of places) {
    const obj = place?.object ?? place;
    if (!obj) continue;
    try {
      await TM.addUpdateFilters(obj, [{
        filterType: "glow",
        filterId,
        outerStrength: 4,
        color,
        quality: 0.5,
        padding: 10
      }]);
      setTimeout(() => {
        try { TM.deleteFilters?.(obj, filterId); } catch { /* already gone */ }
      }, 900);
    } catch {
      return false;
    }
  }
  return places.length > 0;
}

function playRing(places, tint) {
  const PIXI = globalThis.PIXI;
  if (!PIXI) return false;
  const color = Number.parseInt(String(tint ?? "#ff5040").replace("#", ""), 16);
  let drawn = false;
  for (const place of places) {
    const obj = place?.object ?? place;
    if (typeof obj?.addChild !== "function") continue;
    const ring = new PIXI.Graphics();
    ring.lineStyle?.(3, color, 0.9);
    ring.drawCircle?.(0, 0, (obj.w ?? 100) / 2);
    obj.addChild(ring);
    drawn = true;
    setTimeout(() => ring.destroy?.(), 700);
  }
  return drawn;
}

/** @returns {Promise<boolean>} true when something was shown */
export async function playFx(plan, evt) {
  if (!plan?.play) return false;
  const docs = tokenObjects(placesFor(evt, plan.play.at));
  if (plan.source === "jb2a") {
    const distance = Number(evt?.outcome?.distance);
    if (await playSequencer(
      plan.play,
      docs.length ? docs : placesFor(evt, plan.play.at),
      {
        point: evt.point ?? null,
        distance: Number.isFinite(distance) ? distance : null,
        direction: evt?.outcome?.direction,
        shape: evt?.subtype ?? null
      }
    )) return true;
  }
  if (plan.source === "tokenmagic" || plan.source === "jb2a") {
    if (await playTokenMagic(docs, plan.play.tint)) return true;
  }
  return playRing(docs, plan.play.tint);
}
