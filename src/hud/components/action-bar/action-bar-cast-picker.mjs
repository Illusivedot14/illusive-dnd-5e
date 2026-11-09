import { illusiveDnd } from "../../../i18n/index.mjs";

function availableCastLevels(actor, item, activity) {
  if (activity?.requiresSpellSlot === false) return null;

  const baseLevel = Number(activity?.spell?.level ?? item?.system?.level ?? 0) || 0;
  // Cantrips / level-0 never consume slots — never prompt for a slot.
  if (baseLevel <= 0) return null;

  // Innate / at-will / ritual casts don't spend prepared slots.
  const method = String(item?.system?.method ?? item?.system?.preparation?.mode ?? "").toLowerCase();
  if (method === "innate" || method === "atwill" || method === "ritual") return null;

  const slots = actor?.system?.spells ?? {};
  const levels = [];

  for (let level = Math.max(1, baseLevel); level <= 9; level++) {
    const key = `spell${level}`;
    if ((slots[key]?.value ?? 0) > 0) levels.push(level);
  }

  // Pact casters: treat the pact slot level as the available cast level when
  // no prepared slots are listed (or in addition for multiclass).
  const pact = slots.pact;
  const pactMax = Number(pact?.max) || 0;
  const pactValue = Number(pact?.value) || 0;
  const pactLevel = Number(pact?.level) || 0;
  if (pactMax > 0 && pactValue > 0 && pactLevel >= Math.max(1, baseLevel) && !levels.includes(pactLevel)) {
    levels.push(pactLevel);
    levels.sort((a, b) => a - b);
  }

  return levels.length > 1 ? levels : null;
}

/**
 * @returns {Promise<{ cancelled: boolean, level: number|null }>}
 */
export async function pickCastSlotLevel(actor, item, activity) {
  const levels = availableCastLevels(actor, item, activity);
  if (!levels) return { cancelled: false, level: null };

  const buttons = levels.map((level) => ({
    action: `slot-${level}`,
    label: illusiveDnd.actionBar("slotLevel", { level }),
    icon: "fas fa-wand-sparkles",
    callback: () => level
  }));

  buttons.push({
    action: "cancel",
    label: illusiveDnd.ui("cancel"),
    // DialogV2 uses `(await callback()) ?? action` — returning null falls through to "cancel"
    // and was treated as a spell level. Return false so wait resolves to a real cancel.
    icon: "fas fa-times",
    callback: () => false
  });

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: illusiveDnd.actionBar("castSlotTitle", { name: item.name }) },
    content: `<p>${illusiveDnd.actionBar("castSlotPrompt")}</p>`,
    buttons,
    default: `slot-${levels[0]}`
  });

  // Dismiss → null; Cancel button → false (or legacy "cancel" action id).
  if (result == null || result === false || result === "cancel" || typeof result !== "number") {
    return { cancelled: true, level: null };
  }
  return { cancelled: false, level: result };
}
