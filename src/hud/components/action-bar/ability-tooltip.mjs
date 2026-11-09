import { illusiveDnd } from "../../../i18n/index.mjs";
import { getTargetConfig } from "../../../application/ability.mjs";
import {
  formatAbilityDamage,
  formatAbilityHit,
  formatAbilityRange
} from "../../../application/ability-display.mjs";
import { checkAbilityRange } from "../../../application/targeting.mjs";
import { getActionBarToken } from "../../../application/reaction-context.mjs";

function stripHtml(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent?.trim() ?? "";
}

function getTextEditor() {
  return foundry.applications?.ux?.TextEditor?.implementation
    ?? globalThis.TextEditor
    ?? null;
}

/**
 * Resolve Foundry enrichers ([[/save]], [[/damage]], @UUID, etc.) into display HTML.
 * @param {string} raw
 * @param {object|null} relativeTo
 */
export async function enrichAbilityDescription(raw, relativeTo = null) {
  if (!raw) return "";
  try {
    const TextEditor = getTextEditor();
    if (!TextEditor?.enrichHTML) return stripHtml(raw);
    return await TextEditor.enrichHTML(raw, {
      async: true,
      relativeTo: relativeTo ?? null,
      secrets: Boolean(game.user?.isGM)
    });
  } catch {
    return stripHtml(raw);
  }
}

export async function buildAbilityTooltipModel(token, ability) {
  const actor = token?.actor;
  const item = ability.isStandard ? null : actor?.items?.get(ability.itemId);
  const activity = item && ability.activityId ? item.system.activities?.get(ability.activityId) : null;

  const rawDescription = activity?.description?.value ?? item?.system?.description?.value ?? "";
  const description = await enrichAbilityDescription(rawDescription, item ?? activity);
  const range = formatAbilityRange(item, activity);
  const damage = formatAbilityDamage(item, activity);
  const hit = formatAbilityHit(item, activity);
  const save = hit?.kind === "save" ? hit.text : null;

  let rangeStatus = null;
  if (token && item && ability.needsTarget && (game.user.targets?.size ?? 0) > 0) {
    const check = checkAbilityRange(token, item, activity);
    if (!check.inRange) {
      rangeStatus = check.reason === "noLOS" ? illusiveDnd.target("noLOS") : illusiveDnd.target("outOfRange");
    }
  }

  const target = getTargetConfig(item, activity);
  const targetLabel = target?.affects?.type ?? target?.type ?? null;
  const requiresTarget = Boolean(ability.needsTarget && !ability.hasTargets);
  const redundantTargetReasons = new Set([
    illusiveDnd.reason("selectTarget"),
    illusiveDnd.warning("needTarget"),
    illusiveDnd.actionBar("tipRequiresTarget")
  ].map((text) => String(text).trim().toLowerCase()).filter(Boolean));

  const otherReasons = String(ability.disabledReason ?? "")
    .split(/\s*[·|]\s*/)
    .map((part) => part.trim())
    .filter((part) => {
      if (!part) return false;
      if (!requiresTarget) return true;
      const lower = part.toLowerCase();
      if (redundantTargetReasons.has(lower)) return false;
      return !/\b(select|requires?|need)\b.*\btarget\b|\btarget\b.*\b(select|required|needed)\b/i.test(part);
    });

  return {
    name: ability.name,
    description,
    range,
    damage,
    save,
    target: targetLabel,
    rangeStatus,
    requiresTarget,
    statusReasons: otherReasons
  };
}

const ABILITY_BTN = "#illusive-dnd-action-bar .illusive-dnd-ability-btn";

let portal = null;
let pinnedBtn = null;
let hoverBtn = null;
let watchMove = false;
let tipGeneration = 0;

function ensurePortal() {
  if (portal) return portal;
  portal = document.createElement("div");
  portal.id = "illusive-dnd-ability-tooltip-portal";
  portal.className = "illusive-dnd-ability-tooltip-portal";
  portal.hidden = true;
  document.body.appendChild(portal);
  return portal;
}

function setMoveWatch(on) {
  if (on === watchMove) return;
  watchMove = on;
  if (on) document.addEventListener("pointermove", onAbilityPointerMove, true);
  else document.removeEventListener("pointermove", onAbilityPointerMove, true);
}

function hidePortal() {
  tipGeneration += 1;
  setMoveWatch(false);
  if (!portal) return;
  portal.hidden = true;
  portal.innerHTML = "";
  hoverBtn = null;
}

function abilityBtnFromNode(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) {
    node = node?.parentElement ?? null;
  }
  return node?.closest?.(ABILITY_BTN) ?? null;
}

function onAbilityPointerMove(event) {
  if (pinnedBtn) return;
  if (!portal || portal.hidden) {
    setMoveWatch(false);
    return;
  }
  const under = document.elementFromPoint(event.clientX, event.clientY);
  if (abilityBtnFromNode(under) || under?.closest?.("#illusive-dnd-ability-tooltip-portal")) return;
  hidePortal();
}

function positionPortal(btn) {
  if (!portal || portal.hidden) return;
  const rect = btn.getBoundingClientRect();
  const tipRect = portal.getBoundingClientRect();
  const margin = 8;
  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));
  let top = rect.top - tipRect.height - margin;
  if (top < margin) top = rect.bottom + margin;
  portal.style.left = `${left}px`;
  portal.style.top = `${top}px`;
}

function renderPortal(model) {
  const status = [];
  const seen = new Set();
  const pushStatus = (text) => {
    const key = String(text).trim().toLowerCase();
    if (!key || seen.has(key)) return;
    if (seen.has("requires target") && /\bselect a target\b/i.test(text)) return;
    if (seen.has("select a target") && /\brequires target\b/i.test(text)) return;
    seen.add(key);
    status.push(`<p class="illusive-dnd-ability-tip-require">${foundry.utils.escapeHTML(text)}</p>`);
  };

  if (model.requiresTarget) pushStatus(illusiveDnd.actionBar("tipRequiresTarget"));
  for (const reason of model.statusReasons ?? []) pushStatus(reason);

  const lines = [];
  if (model.damage) lines.push(`<p><strong>${illusiveDnd.actionBar("tipDamage")}</strong> ${foundry.utils.escapeHTML(model.damage)}</p>`);
  if (model.save) lines.push(`<p><strong>${illusiveDnd.actionBar("tipSave")}</strong> ${foundry.utils.escapeHTML(model.save)}</p>`);
  if (model.range) lines.push(`<p><strong>${illusiveDnd.actionBar("tipRange")}</strong> ${foundry.utils.escapeHTML(model.range)}</p>`);
  if (model.target) lines.push(`<p><strong>${illusiveDnd.actionBar("tipTarget")}</strong> ${foundry.utils.escapeHTML(model.target)}</p>`);
  if (model.rangeStatus) lines.push(`<p class="illusive-dnd-ability-tip-warn">${foundry.utils.escapeHTML(model.rangeStatus)}</p>`);
  // Description is already enriched HTML from TextEditor — do not escape.
  if (model.description) lines.push(`<div class="illusive-dnd-ability-tip-desc">${model.description}</div>`);

  const node = ensurePortal();
  node.innerHTML = `<div class="illusive-dnd-ability-tip"><h4>${foundry.utils.escapeHTML(model.name)}</h4>${status.join("")}${lines.join("")}</div>`;
  node.hidden = false;
}

async function showForButton(btn) {
  const generation = ++tipGeneration;
  const tokenId = btn.closest("[data-token-id]")?.dataset.tokenId;
  const token = (tokenId && canvas?.tokens?.get(tokenId)) || getActionBarToken() || null;

  const ability = {
    itemId: btn.dataset.itemId,
    activityId: btn.dataset.activityId,
    isStandard: btn.dataset.standard === "true",
    section: btn.dataset.section,
    name: btn.dataset.abilityName ?? btn.getAttribute("aria-label"),
    needsTarget: btn.classList.contains("needs-target"),
    hasTargets: btn.classList.contains("has-target"),
    disabledReason: btn.dataset.disabledReason || null
  };

  let model;
  try {
    model = await buildAbilityTooltipModel(token, ability);
  } catch (_err) {
    model = {
      name: ability.name ?? "",
      description: "",
      range: null,
      damage: null,
      save: null,
      target: null,
      rangeStatus: null,
      requiresTarget: ability.needsTarget && !ability.hasTargets,
      statusReasons: ability.disabledReason
        ? String(ability.disabledReason).split(" · ").map((part) => part.trim()).filter(Boolean)
        : []
    };
  }

  if (generation !== tipGeneration) return;
  if (pinnedBtn !== btn && hoverBtn !== btn) return;

  renderPortal(model);
  if (!pinnedBtn) setMoveWatch(true);
  requestAnimationFrame(() => positionPortal(btn));
}

function setPinned(btn) {
  if (pinnedBtn === btn) {
    pinnedBtn?.classList.remove("is-tooltip-pinned");
    pinnedBtn = null;
    hidePortal();
    return;
  }
  pinnedBtn?.classList.remove("is-tooltip-pinned");
  pinnedBtn = btn;
  pinnedBtn.classList.add("is-tooltip-pinned");
  setMoveWatch(false);
  void showForButton(btn);
}

let bound = false;

export function bindAbilityTooltips(root, token) {
  if (!root) return;
  root.dataset.tokenId = token?.id ?? "";

  if (!bound) {
    bound = true;
    document.addEventListener("pointerover", (event) => {
      const btn = abilityBtnFromNode(event.target);
      if (!btn) return;
      if (btn.contains(event.relatedTarget)) return;
      hoverBtn = btn;
      if (pinnedBtn && pinnedBtn !== btn) return;
      void showForButton(btn);
    });
    document.addEventListener("pointerout", (event) => {
      const from = abilityBtnFromNode(event.target);
      if (!from) return;
      if (from.contains(event.relatedTarget)) return;
      const to = abilityBtnFromNode(event.relatedTarget);
      if (to) {
        hoverBtn = to;
        if (pinnedBtn && pinnedBtn !== to) return;
        void showForButton(to);
        return;
      }
      if (hoverBtn === from) hoverBtn = null;
      if (pinnedBtn) return;
      hidePortal();
    });
    document.addEventListener("click", (event) => {
      const btn = event.target.closest(ABILITY_BTN);
      if (!btn || event.button !== 0) return;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        event.stopPropagation();
        setPinned(btn);
      }
    }, true);
    document.addEventListener("pointerdown", (event) => {
      if (!portal || portal.hidden) return;
      if (event.target.closest(`#illusive-dnd-ability-tooltip-portal, ${ABILITY_BTN}`)) return;
      pinnedBtn?.classList.remove("is-tooltip-pinned");
      pinnedBtn = null;
      hidePortal();
    });
    window.addEventListener("resize", () => {
      const btn = pinnedBtn ?? hoverBtn;
      if (btn && portal && !portal.hidden) positionPortal(btn);
    });
    window.addEventListener("blur", () => {
      if (pinnedBtn) return;
      hidePortal();
    });
  }
}

export function unbindAbilityTooltips() {
  hidePortal();
  pinnedBtn = null;
  hoverBtn = null;
}
