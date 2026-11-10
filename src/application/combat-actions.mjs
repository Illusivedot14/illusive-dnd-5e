import { illusiveDnd } from "../i18n/index.mjs";
import { deleteDocs } from "../foundry/write-gateway.mjs";
import { rollAsOwner } from "./dice.mjs";

/** Drop concentration via dnd5e API when available. */
export async function endActorConcentration(actor) {
  if (!actor) return false;

  const owns = globalThis.game?.user?.isGM || actor.isOwner !== false;
  if (typeof actor.endConcentration === "function" && owns) {
    await actor.endConcentration();
    return true;
  }

  const effect = actor.concentration?.effects?.[0]
    ?? actor.effects?.find?.((entry) => entry.statuses?.has?.("concentrating"));
  if (effect) {
    const result = await deleteDocs([effect]);
    return Boolean(result.ok);
  }

  return false;
}

export function hasConcentration(actor) {
  return Boolean(
    actor?.concentration?.effects?.length
    || actor?.effects?.some?.((entry) => entry.statuses?.has?.("concentrating"))
  );
}

/**
 * After HP damage, report the concentration check. Returns { checked, dropped, dc, prompted? } or null.
 * dnd5e actors post their own concentration prompt from the HP update (Actor5e onUpdateHP), so
 * challenging again would duplicate it; only actors without that system path are rolled here.
 */
export async function challengeConcentrationAfterDamage(actor, damageTotal) {
  const amount = Math.max(0, Number(damageTotal) || 0);
  if (!actor || !(amount > 0) || !hasConcentration(actor)) return null;

  const dc = Number(actor.getConcentrationDC?.(amount)) || Math.max(10, Math.floor(amount / 2));
  if (typeof actor.challengeConcentration === "function") {
    return { checked: false, dropped: false, prompted: true, dc };
  }

  let total = null;
  try {
    if (typeof actor.rollSavingThrow === "function") {
      total = Number((await rollAsOwner(actor, "save", { ability: "con", target: dc }))?.total);
    } else if (typeof actor.rollAbilitySave === "function") {
      const roll = await actor.rollAbilitySave("con", { targetValue: dc, chatMessage: true });
      total = Number(roll?.total);
    }
  } catch {
    return { checked: false, dropped: false, dc };
  }

  if (!Number.isFinite(total)) return { checked: false, dropped: false, dc };
  if (total < dc) {
    await endActorConcentration(actor);
    return { checked: true, dropped: true, dc, total };
  }
  return { checked: true, dropped: false, dc, total };
}

export async function dropConcentrationFromHud(token) {
  const actor = token?.actor;
  if (!actor?.isOwner) {
    ui.notifications.warn(illusiveDnd.warning("noOwner"));
    return false;
  }

  if (!hasConcentration(actor)) return false;

  await endActorConcentration(actor);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor, token: token.document }),
    content: `<strong>${illusiveDnd.ui("dropConcentration")}</strong> — ${actor.name} stops concentrating.`
  });
  return true;
}
