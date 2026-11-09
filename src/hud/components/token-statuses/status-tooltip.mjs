const STATUS_ICON = "#illusive-dnd-token-statuses .illusive-dnd-status-icon";

let portal = null;
let pinnedIcon = null;
let hoverIcon = null;
let watchMove = false;

function ensurePortal() {
  if (portal) return portal;

  portal = document.createElement("div");
  portal.id = "illusive-dnd-status-tooltip-portal";
  portal.hidden = true;
  document.body.appendChild(portal);
  return portal;
}

function setMoveWatch(on) {
  if (on === watchMove) return;
  watchMove = on;
  if (on) document.addEventListener("pointermove", onStatusPointerMove, true);
  else document.removeEventListener("pointermove", onStatusPointerMove, true);
}

function hidePortal() {
  setMoveWatch(false);
  if (!portal) return;
  portal.hidden = true;
  portal.innerHTML = "";
  hoverIcon = null;
}

function statusIconFromNode(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) {
    node = node?.parentElement ?? null;
  }
  return node?.closest?.(STATUS_ICON) ?? null;
}

function onStatusPointerMove(event) {
  if (pinnedIcon) return;
  if (!portal || portal.hidden) {
    setMoveWatch(false);
    return;
  }
  const under = document.elementFromPoint(event.clientX, event.clientY);
  if (statusIconFromNode(under) || under?.closest?.("#illusive-dnd-status-tooltip-portal")) return;
  hidePortal();
}

function positionPortal(icon) {
  if (!portal || portal.hidden) return;

  const rect = icon.getBoundingClientRect();
  const tipRect = portal.getBoundingClientRect();
  const margin = 8;
  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));

  const panel = icon.closest("#illusive-dnd-token-statuses");
  const above = panel?.dataset.placement !== "topRight";
  let top = above ? rect.top - tipRect.height - margin : rect.bottom + margin;
  top = Math.max(margin, Math.min(top, window.innerHeight - tipRect.height - margin));

  portal.style.left = `${left}px`;
  portal.style.top = `${top}px`;
}

function showPortal(icon) {
  const source = icon.querySelector(".illusive-dnd-status-tooltip");
  if (!source) return;

  const node = ensurePortal();
  node.innerHTML = source.innerHTML;
  node.hidden = false;
  node.classList.toggle("illusive-dnd-tooltip-above", icon.closest("#illusive-dnd-token-statuses")?.dataset.placement !== "topRight");
  requestAnimationFrame(() => positionPortal(icon));
}

function setPinned(icon) {
  if (pinnedIcon === icon) {
    pinnedIcon?.classList.remove("is-tooltip-pinned");
    pinnedIcon = null;
    hidePortal();
    return;
  }

  pinnedIcon?.classList.remove("is-tooltip-pinned");
  pinnedIcon = icon;
  pinnedIcon.classList.add("is-tooltip-pinned");
  setMoveWatch(false);
  showPortal(icon);
}

function onIconEnter(icon) {
  hoverIcon = icon;
  if (pinnedIcon && pinnedIcon !== icon) return;
  showPortal(icon);
  if (!pinnedIcon) setMoveWatch(true);
}

function onIconLeave(icon) {
  if (hoverIcon === icon) hoverIcon = null;
  if (pinnedIcon) return;
  hidePortal();
}

function onIconClick(event) {
  const icon = event.target.closest("#illusive-dnd-token-statuses .illusive-dnd-status-icon");
  if (!icon) return;
  if (event.button !== 0) return;
  event.stopPropagation();
  setPinned(icon);
}

function onDocumentPointerDown(event) {
  if (!portal || portal.hidden) return;
  if (event.target.closest("#illusive-dnd-status-tooltip-portal, #illusive-dnd-token-statuses .illusive-dnd-status-icon")) return;
  pinnedIcon?.classList.remove("is-tooltip-pinned");
  pinnedIcon = null;
  hidePortal();
}

function onViewportChange() {
  const icon = pinnedIcon ?? hoverIcon;
  if (icon && portal && !portal.hidden) positionPortal(icon);
}

function onPointerOver(event) {
  const icon = statusIconFromNode(event.target);
  if (!icon || icon.contains(event.relatedTarget)) return;
  onIconEnter(icon);
}

function onPointerOut(event) {
  const from = statusIconFromNode(event.target);
  if (!from || from.contains(event.relatedTarget)) return;
  const to = statusIconFromNode(event.relatedTarget);
  if (to) {
    onIconEnter(to);
    return;
  }
  onIconLeave(from);
}

export function bindStatusTooltips() {
  ensurePortal();
  document.body.addEventListener("pointerover", onPointerOver);
  document.body.addEventListener("pointerout", onPointerOut);
  document.body.addEventListener("click", onIconClick);
  document.body.addEventListener("pointerdown", onDocumentPointerDown, true);
  window.addEventListener("resize", onViewportChange);
  window.addEventListener("scroll", onViewportChange, true);
  window.addEventListener("blur", () => {
    if (pinnedIcon) return;
    hidePortal();
  });
}

export function unpinStatusTooltip() {
  pinnedIcon?.classList.remove("is-tooltip-pinned");
  pinnedIcon = null;
  hidePortal();
}
