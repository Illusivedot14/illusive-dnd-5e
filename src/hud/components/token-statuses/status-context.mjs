import { MODULE_PATH, illusiveDndRenderTemplate } from "../../../constants.mjs";
import { getActionBarToken } from "../../../application/reaction-context.mjs";
import { buildRoundDurationUpdate, getRemainingRounds } from "../../../foundry/effect-data.mjs";
import { refreshHud } from "../../lib/render/core.mjs";
import { ILLUSIVE_DND_RENDER } from "../../lib/render/scopes.mjs";

let activeMenu = null;

function closeContextMenu() {
  activeMenu?.remove();
  activeMenu = null;
}

function refreshStatuses() {
  refreshHud(ILLUSIVE_DND_RENDER.EFFECTS);
}

export function canManageStatusEffect(effect, token) {
  if (!token?.actor) return false;
  if (game.user.isGM) return true;

  const actor = token.actor;
  if (!actor.isOwner) return false;
  if (!effect) return true;

  const effectActor = effect.actor ?? effect.parent;
  return effectActor === actor || effect.parent === actor;
}

function getCurrentRoundDuration(effect) {
  return getRemainingRounds(effect) ?? effect.system?.duration?.value ?? 1;
}

export async function openSetDurationDialog(effect) {
  const content = await illusiveDndRenderTemplate(`${MODULE_PATH}/src/hud/components/token-statuses/set-duration.hbs`, {
    effectName: effect.name,
    rounds: getCurrentRoundDuration(effect)
  });

  return new Promise((resolve) => {
    const dialog = new foundry.applications.api.DialogV2({
      window: { title: "Set Effect Duration", icon: "fas fa-clock" },
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
          icon: "fas fa-check",
          label: "Save",
          default: true,
          callback: async (_event, _button, dlg) => {
            const form = dlg.element.querySelector("form");
            const rounds = Number(new foundry.applications.ux.FormDataExtended(form).object.rounds);
            if (!Number.isFinite(rounds) || rounds < 1) {
              ui.notifications.error("Enter a duration of at least 1 round.");
              return false;
            }

            await effect.update(buildRoundDurationUpdate(rounds));
            refreshStatuses();
            resolve(true);
            return true;
          }
        }
      ],
      close: () => resolve(false)
    });

    dialog.render(true);
  });
}

export async function removeStatusEffect(effect, token, uuid, statusId = "") {
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Remove Effect" },
    content: `<p>Remove <strong>${effect?.name ?? "this effect"}</strong>?</p>`,
    defaultYes: false
  });
  if (!confirmed) return;

  if (effect?.delete) {
    await effect.delete();
  } else if (statusId) {
    await token.toggleEffect?.(statusId);
  } else if (uuid) {
    await token.toggleEffect?.(uuid);
  }

  refreshStatuses();
}

function showContextMenu(event, items) {
  closeContextMenu();

  const menu = document.createElement("nav");
  menu.id = "illusive-dnd-status-context-menu";
  menu.className = "illusive-dnd-status-context-menu";
  menu.setAttribute("role", "menu");

  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "illusive-dnd-status-context-item";
    button.setAttribute("role", "menuitem");
    button.innerHTML = `${item.icon}<span>${item.name}</span>`;
    button.addEventListener("click", async (clickEvent) => {
      clickEvent.stopPropagation();
      closeContextMenu();
      await item.callback();
    });
    menu.appendChild(button);
  }

  document.body.appendChild(menu);
  activeMenu = menu;

  const { clientX, clientY } = event;
  const margin = 8;
  const rect = menu.getBoundingClientRect();
  const left = Math.min(clientX, window.innerWidth - rect.width - margin);
  const top = Math.min(clientY, window.innerHeight - rect.height - margin);
  menu.style.left = `${Math.max(margin, left)}px`;
  menu.style.top = `${Math.max(margin, top)}px`;

  setTimeout(() => {
    document.addEventListener(
      "click",
      (clickEvent) => {
        if (!menu.contains(clickEvent.target)) closeContextMenu();
      },
      { once: true }
    );
    document.addEventListener("keydown", (keyEvent) => {
      if (keyEvent.key === "Escape") closeContextMenu();
    }, { once: true });
  }, 0);
}

export async function onStatusContextMenu(event) {
  const icon = event.target.closest("#illusive-dnd-token-statuses .illusive-dnd-status-icon");
  if (!icon) return;

  event.preventDefault();
  event.stopPropagation();

  const token = getActionBarToken();
  const uuid = icon.dataset.uuid;
  const statusId = icon.dataset.statusId || "";
  const effect = uuid && !uuid.startsWith("illusive-dnd-status:") ? await fromUuid(uuid) : null;

  if (!canManageStatusEffect(effect, token)) return;

  if (!effect) {
    showContextMenu(event, [
      {
        name: "Remove Effect",
        icon: '<i class="fas fa-trash"></i>',
        callback: () => removeStatusEffect(effect, token, uuid, statusId)
      }
    ]);
    return;
  }

  showContextMenu(event, [
    {
      name: "Set Duration",
      icon: '<i class="fas fa-clock"></i>',
      callback: () => openSetDurationDialog(effect)
    },
    {
      name: "Remove Effect",
      icon: '<i class="fas fa-trash"></i>',
      callback: () => removeStatusEffect(effect, token, uuid, statusId)
    }
  ]);
}

export function bindStatusContextMenu() {
  document.body.addEventListener("contextmenu", onStatusContextMenu);
}
