import { MODULE_ID, MODULE_PATH, illusiveDndRenderTemplate } from "../../../constants.mjs";

async function saveRecentEvent(eventData) {
  let recentEvents = game.settings.get(MODULE_ID, "eventHistory") ?? [];
  recentEvents = recentEvents.filter(
    (entry) => entry.name !== eventData.name || entry.img !== eventData.img
  );
  recentEvents.unshift(eventData);
  await game.settings.set(MODULE_ID, "eventHistory", recentEvents.slice(0, 10));
}

async function createEventCombatant(combat, formData) {
  const name = formData.name?.trim();
  const img = formData.img?.trim();
  const initiative = formData.initiative;
  const duration = Number(formData.duration) || null;
  const hideDuration = Boolean(formData.hideDuration);

  if (!name || !img || (initiative !== 0 && !initiative && initiative !== "0")) {
    ui.notifications.error("Event requires a name, image, and initiative.");
    return false;
  }

  const initiativeValue = Number.isNumeric(initiative) ? Number(initiative) : initiative;

  await combat.createEmbeddedDocuments("Combatant", [
    {
      name,
      img,
      initiative: initiativeValue,
      hidden: formData.hidden || false,
      [`flags.${MODULE_ID}`]: {
        event: true,
        duration,
        hideDuration,
        roundCreated: combat.round ?? 1
      }
    }
  ]);

  await saveRecentEvent({
    name,
    img,
    initiative: initiativeValue,
    duration,
    hideDuration,
    hidden: formData.hidden || false
  });

  return true;
}

async function updateEventCombatant(combatant, formData) {
  const name = formData.name?.trim();
  const img = formData.img?.trim();
  const initiative = formData.initiative;
  const duration = Number(formData.duration) || null;
  const hideDuration = Boolean(formData.hideDuration);

  if (!name || !img || (initiative !== 0 && !initiative && initiative !== "0")) {
    ui.notifications.error("Event requires a name, image, and initiative.");
    return false;
  }

  const initiativeValue = Number.isNumeric(initiative) ? Number(initiative) : initiative;

  await combatant.update({
    name,
    img,
    initiative: initiativeValue,
    hidden: formData.hidden || false,
    [`flags.${MODULE_ID}.duration`]: duration,
    [`flags.${MODULE_ID}.hideDuration`]: hideDuration
  });

  return true;
}

function bindRecentEventButtons(dialog, recentEvents) {
  const form = dialog.element.querySelector("form");
  if (!form) return;

  dialog.element.querySelectorAll(".illusive-dnd-recent-event").forEach((button) => {
    button.addEventListener("click", () => {
      const event = recentEvents[button.dataset.index];
      if (!event) return;

      form.name.value = event.name ?? "";
      form.img.value = event.img ?? "";
      form.initiative.value = event.initiative ?? "";
      form.duration.value = event.duration ?? "";
      if (form.hideDuration) form.hideDuration.checked = event.hideDuration ?? false;
      form.hidden.checked = event.hidden ?? false;
    });
  });
}

export async function openAddEventDialog(combat) {
  return openEventDialog(combat, null);
}

export async function openEditEventDialog(combat, combatant) {
  return openEventDialog(combat, combatant);
}

async function openEventDialog(combat, existing) {
  const editing = Boolean(existing);
  const recentEvents = editing ? [] : (game.settings.get(MODULE_ID, "eventHistory") ?? []);
  const prefill = editing
    ? {
        name: existing.name ?? "",
        img: existing.img ?? "",
        initiative: existing.initiative ?? "",
        duration: existing.getFlag(MODULE_ID, "duration") ?? "",
        hideDuration: existing.getFlag(MODULE_ID, "hideDuration") === true,
        hidden: existing.hidden ?? false
      }
    : null;

  const inner = await illusiveDndRenderTemplate(`${MODULE_PATH}/src/hud/components/turn-tracker/add-event.hbs`, {
    recentEvents,
    prefill
  });
  const content = `<form class="illusive-dnd-add-event-form standard-form" autocomplete="off">${inner}</form>`;

  return new Promise((resolve) => {
    const dialog = new foundry.applications.api.DialogV2({
      window: { title: editing ? "Edit Combat Event" : "Add Combat Event", icon: "fas fa-globe" },
      content,
      buttons: [
        {
          action: "cancel",
          icon: "fas fa-times",
          label: "Cancel",
          callback: () => resolve(false)
        },
        {
          action: "submit",
          icon: editing ? "fas fa-save" : "fas fa-plus",
          label: editing ? "Save Event" : "Add Event",
          default: true,
          callback: async (_event, _button, dlg) => {
            const form = dlg.element.querySelector("form");
            const formData = new foundry.applications.ux.FormDataExtended(form).object;
            const done = editing
              ? await updateEventCombatant(existing, formData)
              : await createEventCombatant(combat, formData);
            resolve(done);
            return done;
          }
        }
      ],
      close: () => resolve(false)
    });

    dialog.render(true).then(() => {
      if (!editing) bindRecentEventButtons(dialog, recentEvents);
    });
  });
}

export async function expireEventCombatants(combat) {
  const toDelete = [];

  for (const combatant of combat.combatants) {
    const duration = combatant.getFlag(MODULE_ID, "duration");
    if (!duration) continue;

    const roundCreated = combatant.getFlag(MODULE_ID, "roundCreated");
    if (roundCreated === undefined || roundCreated === null) continue;

    const roundsElapsed = (combat.round ?? 1) - roundCreated;
    if (roundsElapsed >= duration) toDelete.push(combatant.id);
  }

  if (toDelete.length) {
    await combat.deleteEmbeddedDocuments("Combatant", toDelete);
  }
}
