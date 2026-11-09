import { illusiveDnd } from "../../../i18n/index.mjs";
import {
  applyActorDamage,
  applyActorHealing,
  applyActorTempHP,
  applyDamageDeathRules,
  clearDefeatedAfterHeal,
  coerceHpAmount,
  snapshotHp
} from "../../../application/party-combat.mjs";
import { dismissFloatingHudChrome } from "../../lib/overlay-guard.mjs";
import { getActionBarToken } from "../../../application/reaction-context.mjs";
import { refreshHud } from "../../lib/render/core.mjs";
import { ILLUSIVE_DND_RENDER } from "../../lib/render/scopes.mjs";

let activeMenu = null;

function closePortraitHpMenu() {
  activeMenu?.remove();
  activeMenu = null;
}

/** Prefer the selected token's actor (unlinked NPCs), never the world prototype alone. */
function resolveActionBarActor() {
  return getActionBarToken()?.actor ?? null;
}

function canAdjustHp(actor) {
  return Boolean(actor && (game.user.isGM || actor.isOwner));
}

function focusInputAtEnd(input) {
  if (!input) return;
  input.focus();
  const len = String(input.value ?? "").length;
  try {
    input.setSelectionRange(len, len);
  } catch {
    /* unsupported input types */
  }
}

async function applyDamageAmount(actor, amount) {
  amount = coerceHpAmount(amount);
  if (amount == null) return;
  await applyActorDamage(actor, amount);
}

async function applyHealAmount(actor, amount) {
  amount = coerceHpAmount(amount);
  if (amount == null) return;
  await applyActorHealing(actor, amount);
}

async function applyTempHpAmount(actor, amount) {
  amount = coerceHpAmount(amount);
  if (amount == null) return false;

  const result = await applyActorTempHP(actor, amount);
  if (!result.ok && result.reason === "not-higher") {
    ui.notifications.warn(illusiveDnd.actionBar("hpTempNotHigher", { current: result.current }));
    return false;
  }
  return Boolean(result.ok);
}

const HP_MODE_META = {
  damage: {
    titleKey: "hpDamageTitle",
    labelKey: "hpDamage",
    icon: "fas fa-heart-crack"
  },
  heal: {
    titleKey: "hpHealTitle",
    labelKey: "hpHeal",
    icon: "fas fa-heart"
  },
  temp: {
    titleKey: "hpTempTitle",
    labelKey: "hpTemp",
    icon: "fas fa-shield-heart"
  }
};

async function promptHpAmount(actor, mode) {
  const hp = actor.system?.attributes?.hp;
  const current = Number(hp?.value) || 0;
  const temp = Number(hp?.temp) || 0;
  const max = Number(hp?.max) || 0;
  const meta = HP_MODE_META[mode] ?? HP_MODE_META.heal;
  const title = illusiveDnd.actionBar(meta.titleKey);
  const status = temp > 0
    ? illusiveDnd.actionBar("hpStatusWithTemp", { current, temp, max })
    : illusiveDnd.actionBar("hpStatus", { current, max });

  dismissFloatingHudChrome();

  const result = await foundry.applications.api.DialogV2.input({
    window: {
      title,
      icon: meta.icon
    },
    content: `
      <p class="illusive-dnd-hp-adjust-status">${status}</p>
      <div class="form-group illusive-dnd-hp-adjust-form">
        <label>${illusiveDnd.actionBar("hpAmount")}</label>
        <input type="text" name="amount" value="1" inputmode="numeric" pattern="[0-9]*" autocomplete="off" class="illusive-dnd-hp-amount-input">
      </div>
    `,
    render: (_event, html) => {
      requestAnimationFrame(() => {
        focusInputAtEnd(html.querySelector(".illusive-dnd-hp-amount-input"));
      });
    },
    ok: {
      label: illusiveDnd.actionBar(meta.labelKey),
      icon: meta.icon,
      callback: (_event, button) => {
        const form = button?.form;
        if (!form) return false;
        const amount = coerceHpAmount(new foundry.applications.ux.FormDataExtended(form).object.amount);
        if (amount == null) {
          ui.notifications.error(illusiveDnd.actionBar("hpAmountInvalid"));
          return false;
        }
        return amount;
      }
    }
  });

  return result ?? null;
}

async function runHpAdjust(actor, mode) {
  const amount = coerceHpAmount(await promptHpAmount(actor, mode));
  if (amount == null) return;

  const token = getActionBarToken();
  if (mode === "damage") {
    const before = snapshotHp(actor);
    await applyDamageAmount(actor, amount);
    await applyDamageDeathRules(actor, token, amount, before);
  } else if (mode === "heal") {
    await applyHealAmount(actor, amount);
    await clearDefeatedAfterHeal(actor, token);
  } else if (mode === "temp") await applyTempHpAmount(actor, amount);

  refreshHud(ILLUSIVE_DND_RENDER.ACTION_BAR);
  refreshHud(ILLUSIVE_DND_RENDER.PARTY);
  if (game.combat) refreshHud(ILLUSIVE_DND_RENDER.TURN);
}

function showPortraitHpMenu(event, actor) {
  closePortraitHpMenu();

  const menu = document.createElement("nav");
  menu.id = "illusive-dnd-portrait-hp-menu";
  menu.className = "illusive-dnd-status-context-menu";
  menu.setAttribute("role", "menu");

  const items = [
    {
      name: illusiveDnd.actionBar("hpDamage"),
      icon: '<i class="fas fa-heart-crack"></i>',
      callback: () => runHpAdjust(actor, "damage")
    },
    {
      name: illusiveDnd.actionBar("hpHeal"),
      icon: '<i class="fas fa-heart"></i>',
      callback: () => runHpAdjust(actor, "heal")
    },
    {
      name: illusiveDnd.actionBar("hpTemp"),
      icon: '<i class="fas fa-shield-heart"></i>',
      callback: () => runHpAdjust(actor, "temp")
    }
  ];

  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "illusive-dnd-status-context-item";
    button.setAttribute("role", "menuitem");
    button.innerHTML = `${item.icon}<span>${item.name}</span>`;
    button.addEventListener("click", async (clickEvent) => {
      clickEvent.stopPropagation();
      closePortraitHpMenu();
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
        if (!menu.contains(clickEvent.target)) closePortraitHpMenu();
      },
      { once: true }
    );
    document.addEventListener(
      "keydown",
      (keyEvent) => {
        if (keyEvent.key === "Escape") closePortraitHpMenu();
      },
      { once: true }
    );
  }, 0);
}

/** Right-click action-bar portrait → Damage / Heal / Temp HP. */
export function handlePortraitHpContextMenu(event) {
  const portrait = event.target.closest("#illusive-dnd-action-bar .illusive-dnd-mock-portrait-block");
  if (!portrait) return false;

  event.preventDefault();
  event.stopPropagation();

  const actor = resolveActionBarActor();
  if (!canAdjustHp(actor)) {
    ui.notifications.warn(illusiveDnd.warning("noOwner"));
    return true;
  }

  showPortraitHpMenu(event, actor);
  return true;
}

/** Exported for unit tests. */
export {
  applyDamageAmount,
  applyHealAmount,
  clearDefeatedAfterHeal,
  coerceHpAmount,
  resolveActionBarActor,
  snapshotHp
};
