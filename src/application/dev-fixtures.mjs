/**
 * Dev / test fixtures — GM-only helpers for building stress actors.
 */

const BATCH = 40;

/**
 * Create (or refresh) an NPC that owns every spell from the stock dnd5e packs.
 * Prefer 2024 when both packs share an identifier.
 *
 * @param {{ packs?: string[], name?: string, replace?: boolean }} [opts]
 * @returns {Promise<Actor|null>}
 */
export async function createSpellOmnibusNpc(opts = {}) {
  if (!game?.user?.isGM) {
    ui.notifications?.error?.("Spell Omnibus: GM only.");
    return null;
  }

  const packIds = opts.packs ?? ["dnd5e.spells24", "dnd5e.spells"];
  const name = opts.name ?? "Spell Omnibus";
  const replace = opts.replace !== false;

  /** @type {Map<string, object>} */
  const byKey = new Map();

  for (const packId of packIds) {
    const pack = game.packs.get(packId);
    if (!pack) {
      ui.notifications?.warn?.(`Spell Omnibus: missing pack ${packId}`);
      continue;
    }
    const prefer = packId.includes("24");
    await pack.getIndex({ fields: ["name", "system.identifier", "img", "type"] });
    for (const entry of pack.index) {
      if (entry.type && entry.type !== "spell") continue;
      const doc = await pack.getDocument(entry._id);
      if (!doc || doc.type !== "spell") continue;
      const data = doc.toObject();
      delete data._id;
      delete data.folder;
      delete data.sort;
      delete data.ownership;
      if (data.flags?.core) delete data.flags.core.sourceId;
      foundry.utils.setProperty(data, "flags.core.sourceId", doc.uuid);
      // Always prepared / known so the HUD lists everything
      foundry.utils.setProperty(data, "system.preparation.mode", "always");
      foundry.utils.setProperty(data, "system.preparation.prepared", true);
      const key = data.system?.identifier || data.name?.toLowerCase?.() || entry._id;
      if (!byKey.has(key) || prefer) byKey.set(key, data);
    }
  }

  const spells = [...byKey.values()].sort((a, b) => {
    const la = Number(a.system?.level) || 0;
    const lb = Number(b.system?.level) || 0;
    if (la !== lb) return la - lb;
    return String(a.name).localeCompare(String(b.name));
  });

  if (!spells.length) {
    ui.notifications?.error?.("Spell Omnibus: no spells found in packs.");
    return null;
  }

  if (replace) {
    const existing = game.actors.filter((a) => a.name === name && a.getFlag?.("illusive-dnd-5e", "fixture") === "spell-omnibus");
    for (const a of existing) await a.delete();
  }

  const actor = await Actor.create({
    name,
    type: "npc",
    img: "icons/magic/symbols/rune-sigil-red-purple.webp",
    prototypeToken: {
      name,
      disposition: -1,
      actorLink: true,
      texture: { src: "icons/magic/symbols/rune-sigil-red-purple.webp" }
    },
    system: {
      details: {
        type: { value: "humanoid" },
        cr: 20,
        biography: {
          value: `<p>Dev fixture: ${spells.length} spells from ${packIds.join(", ")}. Built by Illusive D&D 5e.</p>`
        }
      },
      attributes: {
        hp: { value: 200, max: 200 },
        ac: { flat: 15, calc: "flat" },
        spell: { level: 20 }
      },
      abilities: {
        str: { value: 10 },
        dex: { value: 14 },
        con: { value: 16 },
        int: { value: 20 },
        wis: { value: 18 },
        cha: { value: 20 }
      },
      traits: {
        size: "med"
      }
    },
    flags: {
      "illusive-dnd-5e": {
        fixture: "spell-omnibus",
        spellCount: spells.length,
        packs: packIds
      }
    }
  });

  for (let i = 0; i < spells.length; i += BATCH) {
    const chunk = spells.slice(i, i + BATCH);
    await actor.createEmbeddedDocuments("Item", chunk);
    ui.notifications?.info?.(
      `Spell Omnibus: ${Math.min(i + chunk.length, spells.length)} / ${spells.length} spells…`
    );
  }

  ui.notifications?.info?.(`Spell Omnibus ready — ${spells.length} spells on ${actor.name}.`);
  return actor;
}
