/**
 * Melee knock-out choice when damage drops a creature to 0 HP.
 * PHB-style: only offered for melee; ranged/spells leave dying as the system does.
 */

import { MODULE_ID } from "../constants.mjs";
import { debugLog, DEBUG_CHANNELS } from "../foundry/debug.mjs";
import { illusiveDndLocalize } from "../i18n/index.mjs";
import { updateDoc, toggleActorStatus, setDocFlag } from "../foundry/write-gateway.mjs";

function readHp(actor) {
  return Number(actor?.system?.attributes?.hp?.value) || 0;
}

/**
 * @param {Actor} actor
 * @returns {Promise<{ knockedOut: boolean, effectUuids: string[], priorDeath: object|null }|null>}
 */
export async function maybeOfferKnockOut(actor, { melee = false, name = null } = {}) {
  if (!melee || !actor) return null;
  const hp = readHp(actor);
  if (hp > 0) return null;

  const DialogV2 = foundry?.applications?.api?.DialogV2;
  if (!DialogV2?.wait) return null;

  const label = name ?? actor.name ?? "Creature";
  const title = illusiveDndLocalize("knockout.title");
  const hint = illusiveDndLocalize("knockout.hint").replace("{name}", label);

  let choice = "dying";
  try {
    choice = await DialogV2.wait({
      window: { title },
      content: `<p>${hint}</p>`,
      rejectClose: false,
      modal: true,
      buttons: [
        {
          action: "dying",
          label: illusiveDndLocalize("knockout.leaveDying"),
          callback: () => "dying"
        },
        {
          action: "knockout",
          label: illusiveDndLocalize("knockout.knockOut"),
          default: true,
          callback: () => "knockout"
        }
      ]
    }) ?? "dying";
  } catch {
    choice = "dying";
  }

  debugLog(DEBUG_CHANNELS.COMBAT, "knockout.choice", {
    actorUuid: actor.uuid,
    choice,
    hp
  });

  if (choice !== "knockout") return { knockedOut: false, effectUuids: [], priorDeath: null };

  return applyKnockOutStable(actor);
}

/**
 * Unconscious + stable at 0 HP; clear death-save counters.
 */
export async function applyKnockOutStable(actor) {
  if (!actor) return { knockedOut: false, effectUuids: [], priorDeath: null };

  const priorDeath = foundry.utils.duplicate(actor.system?.attributes?.death ?? {});
  const effectUuids = [];

  await updateDoc(actor, {
    "system.attributes.hp.value": 0,
    "system.attributes.death.success": 0,
    "system.attributes.death.failure": 0
  });

  if (typeof actor.toggleStatusEffect === "function") {
    for (const statusId of ["unconscious", "stable"]) {
      if (actor.statuses?.has?.(statusId)) continue;
      const made = await toggleActorStatus(actor, statusId, { active: true });
      effectUuids.push(...(made.effectUuids ?? []));
    }
  }

  if (typeof actor.setFlag === "function") await setDocFlag(actor, MODULE_ID, "stable", true);

  // Collect effect uuids if toggleStatusEffect didn't return docs.
  if (!effectUuids.length) {
    for (const effect of actor.effects ?? []) {
      if (effect.statuses?.has?.("unconscious") || effect.statuses?.has?.("stable")) {
        if (effect.uuid) effectUuids.push(effect.uuid);
      }
    }
  }

  return {
    knockedOut: true,
    effectUuids: effectUuids.filter(Boolean),
    priorDeath
  };
}
