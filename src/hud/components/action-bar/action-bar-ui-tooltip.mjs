const SHOW_DELAY_MS = 60;
const HIDE_DELAY_MS = 40;
const TIP_SELECTOR = [
  "#illusive-dnd-action-bar [data-illusive-dnd-tip-title]",
  "#illusive-dnd-action-bar [data-illusive-dnd-tip-detail]",
  ".illusive-dnd-util-dropdown [data-illusive-dnd-tip-title]",
  ".illusive-dnd-util-dropdown [data-illusive-dnd-tip-detail]"
].join(", ");

let portal = null;
let hoverEl = null;
let pendingEl = null;
let showTimer = null;
let hideTimer = null;
let bound = false;
let watchMove = false;

function ensurePortal() {
  if (portal) return portal;
  portal = document.createElement("div");
  portal.id = "illusive-dnd-action-bar-ui-tooltip";
  portal.className = "illusive-dnd-action-bar-ui-tooltip";
  portal.hidden = true;
  document.body.appendChild(portal);
  return portal;
}

function clearTimers() {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  showTimer = null;
  hideTimer = null;
}

function tipFromNode(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) {
    node = node?.parentElement ?? null;
  }
  return node?.closest?.(TIP_SELECTOR) ?? null;
}

function hidePortal() {
  clearTimers();
  pendingEl = null;
  setMoveWatch(false);
  if (!portal) return;
  portal.hidden = true;
  portal.innerHTML = "";
  hoverEl = null;
}

function readTip(el) {
  const title = el.dataset.illusiveDndTipTitle?.trim() ?? "";
  const detail = el.dataset.illusiveDndTipDetail?.trim() ?? "";
  if (!title && !detail) return null;
  return { title, detail };
}

function positionPortal(anchor) {
  if (!portal || portal.hidden) return;

  const rect = anchor.getBoundingClientRect();
  const tipRect = portal.getBoundingClientRect();
  const margin = 8;
  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));

  let top = rect.top - tipRect.height - margin;
  if (top < margin) top = rect.bottom + margin;
  top = Math.max(margin, Math.min(top, window.innerHeight - tipRect.height - margin));

  portal.style.left = `${left}px`;
  portal.style.top = `${top}px`;
}

function formatTipDetailHtml(detail) {
  return String(detail)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const heading = line.startsWith("**");
      const text = foundry.utils.escapeHTML(heading ? line.slice(2).trim() : line);
      const cls = heading ? "illusive-dnd-ui-tip-detail-line illusive-dnd-ui-tip-detail-heading" : "illusive-dnd-ui-tip-detail-line";
      const tag = heading ? "strong" : "span";
      return `<${tag} class="${cls}">${text}</${tag}>`;
    })
    .join("");
}

function renderPortal(model) {
  const node = ensurePortal();
  const title = foundry.utils.escapeHTML(model.title);
  const detail = model.detail
    ? `<p class="illusive-dnd-ui-tip-detail">${formatTipDetailHtml(model.detail)}</p>`
    : "";

  node.innerHTML = `<div class="illusive-dnd-ui-tip-card">${title ? `<p class="illusive-dnd-ui-tip-title">${title}</p>` : ""}${detail}</div>`;
  node.hidden = false;
}

function setMoveWatch(on) {
  if (on === watchMove) return;
  watchMove = on;
  if (on) document.addEventListener("pointermove", onPointerMove, true);
  else document.removeEventListener("pointermove", onPointerMove, true);
}

function showForElement(el) {
  const model = readTip(el);
  if (!model) return;
  hoverEl = el;
  pendingEl = el;
  renderPortal(model);
  setMoveWatch(true);
  requestAnimationFrame(() => positionPortal(el));
}

function scheduleShow(el) {
  clearTimers();
  pendingEl = el;
  if (hoverEl === el && portal && !portal.hidden) return;
  const gap = hoverEl && hoverEl !== el ? HIDE_DELAY_MS : 0;
  showTimer = setTimeout(() => {
    showTimer = null;
    if (pendingEl !== el) return;
    showForElement(el);
  }, gap + SHOW_DELAY_MS);
}

function scheduleHide() {
  clearTimers();
  pendingEl = null;
  hideTimer = setTimeout(() => {
    hideTimer = null;
    hidePortal();
  }, HIDE_DELAY_MS);
}

function onPointerOver(event) {
  const el = tipFromNode(event.target);
  if (!el) return;
  if (el.classList.contains("is-dropdown-open")) return;
  if (el.contains(event.relatedTarget)) return;
  scheduleShow(el);
}

function onPointerOut(event) {
  const from = tipFromNode(event.target);
  if (!from) return;
  if (from.contains(event.relatedTarget)) return;

  const to = tipFromNode(event.relatedTarget);
  if (to) {
    // Crossing into another tip — switch without relying on hoverEl identity.
    scheduleShow(to);
    return;
  }

  // Left tip territory entirely (fast exits included).
  scheduleHide();
}

function onPointerMove(event) {
  if (!portal || portal.hidden) {
    setMoveWatch(false);
    return;
  }
  const under = document.elementFromPoint(event.clientX, event.clientY);
  if (tipFromNode(under) || under?.closest?.("#illusive-dnd-action-bar-ui-tooltip")) return;
  hidePortal();
}

function onPointerDown(event) {
  if (!portal || portal.hidden) return;
  if (event.target.closest?.(`#illusive-dnd-action-bar-ui-tooltip, ${TIP_SELECTOR}`)) return;
  hidePortal();
}

function onViewportChange() {
  if (hoverEl && portal && !portal.hidden) positionPortal(hoverEl);
}

export function bindActionBarUiTooltips() {
  ensurePortal();
  if (bound) return;
  bound = true;

  document.body.addEventListener("pointerover", onPointerOver);
  document.body.addEventListener("pointerout", onPointerOut);
  document.body.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("resize", onViewportChange);
  window.addEventListener("scroll", onViewportChange, true);
  window.addEventListener("blur", hidePortal);
}

export function hideActionBarUiTooltip() {
  hidePortal();
}
