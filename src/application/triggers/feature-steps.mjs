/**
 * Declaration steps for the combat options that are not a save, a push, or a zone.
 * Each one writes through the gateway or returns a patch the attack or save already reads.
 */

import { MODULE_ID } from "../../constants.mjs";
import { resolveRulesContext } from "../../foundry/dnd5e-adapter.mjs";
import { adjustLegendaryResistance, buildLegendaryResistance } from "../../foundry/actor-resources.mjs";
import { tokenForActor, tokenFromUuid } from "../../foundry/token-lookup.mjs";
import { isFriendly } from "../../domain/combat/disposition.mjs";
import { rollAsOwner, rollVisible } from "../dice.mjs";
import { writeNextD20Advantage } from "../reactions/reaction-state.mjs";
import { copyAuraFromStep } from "../aura-effects.mjs";
import { allDeclarations } from "./index.mjs";
import {
  applyActorDamage,
  createEmbedded,
  deleteDocs,
  setDocFlag,
  toggleActorStatus,
  updateDoc
} from "../../foundry/write-gateway.mjs";

const META_COST = {
  subtle: 1,
  distant: 1,
  extended: 1,
  careful: 1,
  empowered: 1,
  twinned: 1,
  quickened: 2,
  heightened: 3
};

function push(changes, result) {
  if (result?.undo?.length) changes.push(...result.undo);
}

function checkTotal(roll) {
  const total = Number(roll?.total);
  return Number.isFinite(total) ? total : null;
}

async function check(actor, skill) {
  return checkTotal(await rollAsOwner(actor, "check", { ability: skill, skill }));
}

async function saveTotal(actor, ability, dc) {
  return checkTotal(await rollAsOwner(actor, "save", { ability, target: dc }));
}

function grappleDc(actor) {
  const mod = Number(actor?.system?.abilities?.str?.mod) || 0;
  const prof = Number(actor?.system?.attributes?.prof) || 0;
  return 8 + mod + prof;
}

async function holdGrapple(changes, source, target) {
  push(changes, await toggleActorStatus(target, "grappled", { active: true }));
  const token = tokenForActor(target);
  const uuid = token?.document?.uuid;
  if (!uuid) return;
  const held = [...(source.getFlag?.(MODULE_ID, "grappling") ?? [])];
  if (held.includes(uuid)) return;
  held.push(uuid);
  push(changes, await setDocFlag(source, MODULE_ID, "grappling", held));
}

function findItem(actor, name) {
  const want = String(name ?? "").toLowerCase();
  return [...(actor?.items ?? [])].find((item) => item.id === name
    || String(item.name ?? "").toLowerCase() === want
    || String(item.system?.identifier ?? "").toLowerCase() === want) ?? null;
}

function resourceUpdate(actor, match, amount) {
  const resources = actor?.system?.resources ?? {};
  const key = Object.keys(resources).find((id) => id.toLowerCase().includes(match));
  if (!key) return null;
  const current = Number(resources[key]?.value);
  if (!Number.isFinite(current)) return null;
  const next = Math.max(0, current - amount);
  if (next === current) return null;
  return { [`system.resources.${key}.value`]: next };
}

async function die(faces, flavor) {
  try {
    const roll = await rollVisible(`1d${faces}`, { flavor });
    const total = Number(roll?.total);
    if (Number.isFinite(total)) return total;
  } catch {
    /* no dice */
  }
  return 0;
}

function actorHasLegendary(actor) {
  return allDeclarations(actor).some((entry) => entry.decl.do?.some((step) => step.step === "legendaryResistance"));
}

/** Spend one use after the creature agrees. False when they have none or decline. */
export async function spendLegendaryResistance(actor) {
  let current = null;
  try {
    current = buildLegendaryResistance(actor);
  } catch {
    current = null;
  }
  if (!current || current.remaining <= 0) return false;
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (typeof DialogV2?.confirm === "function") {
    const ok = await DialogV2.confirm({
      window: { title: current.label || "Legendary Resistance" },
      content: "<p>Spend a use of Legendary Resistance to succeed?</p>"
    });
    if (!ok) return false;
  }
  return adjustLegendaryResistance(actor, -1);
}

/** A failed save this module rolled succeeds when the creature has the step and spends a use. */
export async function offerLegendaryResistance(actor) {
  if (!actorHasLegendary(actor)) return false;
  return spendLegendaryResistance(actor);
}

/** Move tokens this creature is grappling by the same delta. */
export async function dragGrappled(tokenDoc, prior) {
  if (!tokenDoc || !prior) return;
  const dx = (Number(tokenDoc.x) || 0) - prior.x;
  const dy = (Number(tokenDoc.y) || 0) - prior.y;
  if (!dx && !dy) return;
  const held = tokenDoc.actor?.getFlag?.(MODULE_ID, "grappling") ?? [];
  for (const uuid of held) {
    const doc = tokenFromUuid(uuid)?.document;
    if (typeof doc?.update !== "function") continue;
    await updateDoc(doc, {
      x: (Number(doc.x) || 0) + dx,
      y: (Number(doc.y) || 0) + dy
    }, { illusiveSkipOA: true, illusiveDndForced: true });
  }
}

function nearestAlly(self) {
  const disposition = self?.document?.disposition ?? self?.disposition;
  return (globalThis.canvas?.tokens?.placeables ?? []).find((token) => {
    if (!token?.actor || token === self) return false;
    if (token.id === self?.id) return false;
    return (token.document?.disposition ?? token.disposition) === disposition;
  }) ?? null;
}

/** Patches: portent, legendary resistance, redirect. */
export async function featurePatch(step, ctx, source) {
  if (step.step === "portent") {
    if (step.mode === "store") {
      const count = Math.max(1, Number(step.dice) || 2);
      const stored = [];
      for (let i = 0; i < count; i += 1) stored.push(await die(20, "Portent"));
      await setDocFlag(ctx.actor, MODULE_ID, "portent", stored.filter((n) => n > 0));
      return [];
    }
    const stored = [...(ctx.actor?.getFlag?.(MODULE_ID, "portent") ?? [])];
    const value = Number(stored.shift());
    if (!Number.isFinite(value) || value <= 0) return [];
    await setDocFlag(ctx.actor, MODULE_ID, "portent", stored);
    return [{ type: "d20Replace", value, source }];
  }
  if (step.step === "legendaryResistance") {
    const spent = await spendLegendaryResistance(ctx.actor);
    return spent ? [{ type: "saveSuccess", source }] : [];
  }
  if (step.step === "redirect") {
    const ally = nearestAlly(ctx.token);
    const targetUuid = ally?.document?.uuid;
    if (!targetUuid) return [];
    return [{ type: "redirect", targetUuid, source }];
  }
  return null;
}

async function grapple(step, ctx, actors, changes) {
  const edition = resolveRulesContext(ctx.actor)?.edition ?? "2024";
  for (const target of actors) {
    if (edition === "2014") {
      const attack = await check(ctx.actor, "ath");
      const defense = Math.max(await check(target, "ath") ?? -Infinity, await check(target, "acr") ?? -Infinity);
      if (attack == null || !(attack > defense)) continue;
    } else {
      const dc = Number(step.dc) || grappleDc(ctx.actor);
      const best = Math.max(
        await saveTotal(target, "str", dc) ?? -Infinity,
        await saveTotal(target, "dex", dc) ?? -Infinity
      );
      if (best >= dc) continue;
    }
    await holdGrapple(changes, ctx.actor, target);
  }
}

async function contest(step, ctx, actors, changes) {
  const mine = await check(ctx.actor, step.ability);
  for (const target of actors) {
    const theirs = await check(target, step.vs);
    const won = mine != null && (theirs == null || mine > theirs);
    if (won && step.onWin) push(changes, await toggleActorStatus(target, step.onWin, { active: true }));
    if (!won && step.onLose) push(changes, await toggleActorStatus(ctx.actor, step.onLose, { active: true }));
  }
}

async function metamagic(step, ctx, changes) {
  const cost = Number(step.cost) || META_COST[step.option] || 1;
  const data = resourceUpdate(ctx.actor, String(step.resource ?? "sorcery").toLowerCase(), cost);
  if (!data) return;
  push(changes, await updateDoc(ctx.actor, data));
  push(changes, await setDocFlag(ctx.actor, MODULE_ID, "metamagic", step.option));
}

function attackSources(beast, listed) {
  const fromBeast = [...(beast?.items ?? [])].filter((item) => {
    if (!item) return false;
    if (item.type === "weapon") return true;
    const acts = item.system?.activities;
    const list = Array.isArray(acts) ? acts : [...(acts?.contents ?? [])];
    return list.some((activity) => activity?.type === "attack");
  });
  return [...fromBeast, ...(Array.isArray(listed) ? listed : [])];
}

function plainAttack(item) {
  const base = typeof item.toObject === "function"
    ? item.toObject()
    : { name: item.name, type: item.type ?? "weapon", img: item.img, system: item.system ?? {} };
  return {
    ...base,
    flags: {
      ...(base.flags ?? {}),
      [MODULE_ID]: { ...(base.flags?.[MODULE_ID] ?? {}), wildShape: true }
    }
  };
}

function beastForm(step) {
  let hp = Number(step.hp);
  let ac = Number(step.ac);
  let movement = step.movement ?? null;
  let senses = step.senses ?? null;
  let size = step.size ?? null;
  let beast = null;
  if (step.beast && typeof globalThis.fromUuidSync === "function") {
    beast = globalThis.fromUuidSync(step.beast);
    hp = Number(beast?.system?.attributes?.hp?.max) || hp;
    ac = Number(beast?.system?.attributes?.ac?.value) || ac;
    movement = movement ?? beast?.system?.attributes?.movement ?? null;
    senses = senses ?? beast?.system?.attributes?.senses ?? null;
    const width = Number(beast?.prototypeToken?.width);
    const height = Number(beast?.prototypeToken?.height);
    if (!size && Number.isFinite(width) && Number.isFinite(height)) size = { width, height };
  }
  return { hp, ac, movement, senses, size, beast };
}

async function wildShape(step, ctx, changes) {
  const actor = ctx.actor;
  const doc = ctx.token?.document;
  if (step.end) {
    const prior = actor?.getFlag?.(MODULE_ID, "wildShape");
    const restore = {};
    if (prior?.hp) {
      restore["system.attributes.hp.value"] = prior.hp.value;
      restore["system.attributes.hp.max"] = prior.hp.max;
    }
    if (prior?.movement) restore["system.attributes.movement"] = prior.movement;
    if (prior?.senses) restore["system.attributes.senses"] = prior.senses;
    if (Object.keys(restore).length) push(changes, await updateDoc(actor, restore));
    if (prior?.size && typeof doc?.update === "function") {
      push(changes, await updateDoc(doc, { width: prior.size.width, height: prior.size.height }));
    }
    const effects = [...(actor?.effects ?? [])].filter((effect) => effect.flags?.[MODULE_ID]?.wildShape);
    if (effects.length) push(changes, await deleteDocs(effects));
    const attacks = [...(actor?.items ?? [])].filter((item) => item.flags?.[MODULE_ID]?.wildShape);
    if (attacks.length) push(changes, await deleteDocs(attacks));
    push(changes, await setDocFlag(actor, MODULE_ID, "wildShape", null));
    if (prior?.transformed && typeof actor?.revertOriginalForm === "function") {
      try { await actor.revertOriginalForm(); } catch { /* the flag restore stands */ }
    }
    return;
  }
  const form = beastForm(step);
  const current = actor?.system?.attributes?.hp ?? {};
  const prior = {
    hp: { value: Number(current.value) || 0, max: Number(current.max) || 0 },
    movement: actor?.system?.attributes?.movement ?? null,
    senses: actor?.system?.attributes?.senses ?? null,
    size: doc ? { width: doc.width ?? 1, height: doc.height ?? 1 } : null,
    transformed: false
  };
  if (form.beast && typeof actor?.transformInto === "function") {
    try {
      await actor.transformInto(form.beast, { keepHP: false });
      prior.transformed = true;
    } catch { /* copy the beast's stats below */ }
  }
  const updates = {};
  if (Number.isFinite(form.hp) && form.hp > 0) {
    updates["system.attributes.hp.value"] = form.hp;
    updates["system.attributes.hp.max"] = form.hp;
  }
  if (form.movement) updates["system.attributes.movement"] = form.movement;
  if (form.senses) updates["system.attributes.senses"] = form.senses;
  const attacks = prior.transformed ? [] : attackSources(form.beast, step.attacks).map(plainAttack);
  if (!Object.keys(updates).length && !form.size && !attacks.length) return;
  push(changes, await setDocFlag(actor, MODULE_ID, "wildShape", prior));
  if (Object.keys(updates).length) push(changes, await updateDoc(actor, updates));
  if (form.size && doc) push(changes, await updateDoc(doc, { width: form.size.width, height: form.size.height }));
  if (attacks.length) push(changes, await createEmbedded(actor, "Item", attacks));
  if (Number.isFinite(form.ac) && form.ac > 0) {
    push(changes, await createEmbedded(actor, "ActiveEffect", [{
      name: "Wild Shape",
      transfer: false,
      disabled: false,
      changes: [{ key: "system.attributes.ac.bonus", mode: 2, value: String(form.ac) }],
      flags: { [MODULE_ID]: { wildShape: true } }
    }]));
  }
}

async function inspiration(step, ctx, changes) {
  const actor = ctx.actor;
  const current = Boolean(actor?.system?.attributes?.inspiration);
  if (step.spend) {
    if (!current) return;
    push(changes, await updateDoc(actor, { "system.attributes.inspiration": false }));
    push(changes, await writeNextD20Advantage(actor, { source: "inspiration" }));
    return;
  }
  if (current) return;
  push(changes, await updateDoc(actor, { "system.attributes.inspiration": true }));
}

async function layOnHands(step, ctx, actors, changes, label) {
  const pools = { ...(ctx.actor?.getFlag?.(MODULE_ID, "pools") ?? {}) };
  const key = "lay-on-hands";
  let remaining = Number(pools[key]);
  if (!Number.isFinite(remaining)) remaining = Number(step.max) || 0;
  const request = Math.max(0, Number(step.value) || 0);
  const spent = Math.min(request, remaining);
  if (!spent) return;
  pools[key] = remaining - spent;
  push(changes, await setDocFlag(ctx.actor, MODULE_ID, "pools", pools));
  for (const actor of actors) {
    push(changes, await applyActorDamage(actor, [{ value: spent, type: "healing" }], { flavor: label }));
  }
}

async function recharge(step, ctx, changes) {
  const face = await die(6, "Recharge");
  const need = Number(step.on) || 6;
  if (face < need) return;
  const item = findItem(ctx.actor, step.item);
  if (!item?.system?.uses) return;
  push(changes, await updateDoc(item, { "system.uses.spent": 0 }));
}

async function split(ctx, changes) {
  const actor = ctx.actor;
  const hp = actor?.system?.attributes?.hp ?? {};
  if ((Number(hp.value) || 0) > 0) return;
  const half = Math.max(1, Math.floor((Number(hp.max) || 1) / 2));
  push(changes, await updateDoc(actor, { "system.attributes.hp.value": half }));
  const scene = globalThis.canvas?.scene;
  const doc = ctx.token?.document;
  if (!scene?.createEmbeddedDocuments || !doc) return;
  const grid = Number(scene.grid?.size) || 100;
  push(changes, await createEmbedded(scene, "Token", [{
    name: actor?.name ?? "Split",
    x: (Number(doc.x) || 0) + grid,
    y: Number(doc.y) || 0,
    actorId: actor?.id ?? null,
    width: doc.width ?? 1,
    height: doc.height ?? 1,
    disposition: doc.disposition
  }]));
}

async function applyControl(step, ctx, actors, changes) {
  for (const actor of actors) {
    if (step.status) push(changes, await toggleActorStatus(actor, step.status, { active: true }));
    if (step.confusion) {
      push(changes, await setDocFlag(actor, MODULE_ID, "confusion", true));
      continue;
    }
    if (step.slow) {
      push(changes, await setDocFlag(actor, MODULE_ID, "control", ["reaction"]));
      push(changes, await createEmbedded(actor, "ActiveEffect", [{
        name: "Slow",
        transfer: false,
        changes: [
          { key: "system.attributes.ac.bonus", mode: 2, value: "-2" },
          { key: "system.attributes.movement.walk", mode: 1, value: "0.5" }
        ],
        flags: { [MODULE_ID]: { control: true } }
      }]));
      continue;
    }
    if (step.order === "halt") {
      push(changes, await setDocFlag(actor, MODULE_ID, "control", ["action", "bonus", "move"]));
      continue;
    }
    if (step.order === "grovel") {
      push(changes, await toggleActorStatus(actor, "prone", { active: true }));
      push(changes, await setDocFlag(actor, MODULE_ID, "control", ["action"]));
      continue;
    }
    if (step.order === "drop") {
      const weapon = [...(actor?.items ?? [])].find((item) => item?.type === "weapon" && item?.system?.equipped !== false);
      if (weapon) push(changes, await updateDoc(weapon, { "system.equipped": false }));
      continue;
    }
    if (step.order === "approach" || step.order === "flee") {
      push(changes, await setDocFlag(actor, MODULE_ID, "controlOrder", {
        order: step.order,
        sourceUuid: ctx.tokenUuid ?? ctx.token?.document?.uuid ?? null
      }));
      continue;
    }
    if (Array.isArray(step.deny)) push(changes, await setDocFlag(actor, MODULE_ID, "control", [...step.deny]));
  }
}

async function markTargets(ctx, actors, changes) {
  const origin = ctx.actor?.uuid ?? null;
  for (const actor of actors) {
    push(changes, await createEmbedded(actor, "ActiveEffect", [{
      name: "Hex",
      statuses: ["marked"],
      origin,
      transfer: false,
      flags: { [MODULE_ID]: { mark: true } }
    }]));
  }
}

async function repeatSave(step, actors, changes) {
  const spec = { ability: step.ability, dc: step.dc, name: step.name ?? null };
  for (const actor of actors) {
    const name = String(step.name ?? "Repeat Save");
    const existing = [...(actor?.effects ?? [])].find((effect) => String(effect?.name ?? "").toLowerCase() === name.toLowerCase());
    if (existing?.setFlag) {
      await existing.setFlag(MODULE_ID, "repeatSave", spec);
      continue;
    }
    push(changes, await createEmbedded(actor, "ActiveEffect", [{
      name,
      transfer: false,
      flags: { [MODULE_ID]: { repeatSave: spec } }
    }]));
  }
}

async function endOnAction(step, actors, changes) {
  const name = String(step.name ?? "");
  for (const actor of actors) {
    const existing = [...(actor?.effects ?? [])].find((effect) => String(effect?.name ?? "").toLowerCase() === name.toLowerCase());
    if (existing) {
      const flags = {
        ...(existing.flags ?? {}),
        [MODULE_ID]: { ...(existing.flags?.[MODULE_ID] ?? {}), specialDuration: ["action"] }
      };
      if (typeof existing.update === "function") push(changes, await updateDoc(existing, { flags }));
      else existing.flags = flags;
      continue;
    }
    push(changes, await createEmbedded(actor, "ActiveEffect", [{
      name,
      transfer: false,
      flags: { [MODULE_ID]: { specialDuration: ["action"] } }
    }]));
  }
}

async function freeReaction(actors) {
  const { grantFreeReaction } = await import("../economy.mjs");
  for (const actor of actors) await grantFreeReaction(actor);
}

/** Write steps. Null when this step belongs to the main switch. */
export async function featureWrite(step, ctx, actors, label, scope = null) {
  const changes = [];
  switch (step.step) {
    case "grapple":
      await grapple(step, ctx, actors, changes);
      return changes;
    case "contest":
      await contest(step, ctx, actors, changes);
      return changes;
    case "control":
      await applyControl(step, ctx, actors, changes);
      return changes;
    case "mark":
      await markTargets(ctx, actors, changes);
      return changes;
    case "freeReaction":
      await freeReaction(actors.length ? actors : [ctx.actor].filter(Boolean));
      return changes;
    case "repeatSave":
      await repeatSave(step, actors, changes);
      return changes;
    case "endOnAction":
      await endOnAction(step, actors, changes);
      return changes;
    case "lingeringDisadvantage": {
      const attacker = scope?.trigger?.actor ?? null;
      const allyUuid = scope?.targetList?.[0] ?? ctx.tokenUuid ?? null;
      if (attacker && allyUuid) {
        push(changes, await setDocFlag(attacker, MODULE_ID, "protectionDisadvantage", allyUuid));
      }
      return changes;
    }
    case "moveZone": {
      const { moveZoneBy } = await import("../zones.mjs");
      const toward = actors[0] ? tokenForActor(actors[0]) : scope?.trigger;
      await moveZoneBy({ token: ctx.token, feet: step.feet, toward });
      return changes;
    }
    case "ignite": {
      const { igniteTerrain } = await import("../zones.mjs");
      for (const actor of (actors.length ? actors : [ctx.actor])) {
        const token = tokenForActor(actor) ?? ctx.token;
        if (token) await igniteTerrain(token);
      }
      return changes;
    }
    case "metamagic":
      await metamagic(step, ctx, changes);
      return changes;
    case "wildShape":
      await wildShape(step, ctx, changes);
      return changes;
    case "inspiration":
      await inspiration(step, ctx, changes);
      return changes;
    case "layOnHands":
      await layOnHands(step, ctx, actors, changes, label);
      return changes;
    case "recharge":
      await recharge(step, ctx, changes);
      return changes;
    case "split":
      await split(ctx, changes);
      return changes;
    case "aura":
      return copyAuraFromStep({ token: ctx.token, label, step });
    default:
      return null;
  }
}

export function readMetamagic(actor) {
  return actor?.getFlag?.(MODULE_ID, "metamagic") ?? null;
}

export async function clearMetamagic(actor) {
  if (!readMetamagic(actor)) return null;
  return setDocFlag(actor, MODULE_ID, "metamagic", null);
}

export function metamagicSave(actor, casterToken, target) {
  const option = actor?.getFlag?.(MODULE_ID, "metamagic");
  return {
    disadvantage: option === "heightened",
    autoSuccess: option === "careful" && isFriendly(casterToken, tokenForActor(target))
  };
}
