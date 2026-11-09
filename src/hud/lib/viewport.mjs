/** Layout viewport for HUD positioning. */
export function getUiViewportSize() {
  return {
    w: window.innerWidth || document.documentElement.clientWidth || 0,
    h: window.innerHeight || document.documentElement.clientHeight || 0
  };
}

/** DOMRect in layout space (identity when UI is not rotated). */
export function screenRectToUiLocal(rect) {
  const left = rect.left;
  const right = rect.right;
  const top = rect.top;
  const bottom = rect.bottom;
  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
    center: (left + right) / 2
  };
}

/** getBoundingClientRect remapped into layout space. */
export function getUiLocalRect(el) {
  if (!(el instanceof Element)) return null;
  return screenRectToUiLocal(el.getBoundingClientRect());
}

export function prefersReducedMotion() {
  return typeof matchMedia === "function"
    && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Wait for a transform transition, or time out. Used by all three HUD minimize sliders. */
export function waitForCssMotion(el, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      el.removeEventListener("transitionend", onEnd);
      clearTimeout(timer);
      resolve();
    };
    const onEnd = (event) => {
      if (event.target !== el) return;
      if (event.propertyName && event.propertyName !== "transform") return;
      finish();
    };
    el.addEventListener("transitionend", onEnd);
    const timer = setTimeout(finish, timeoutMs);
  });
}

export function lockMotionHeight(el, height) {
  el.style.overflow = "visible";
  el.style.height = `${height}px`;
  el.style.minHeight = `${height}px`;
  el.style.maxHeight = `${height}px`;
  el.style.visibility = "visible";
}

/** Lookup-or-create a body root. Copied in mobile-sheet / carousel / move / dice-roller. */
export function ensureDomRoot(id, { className, html, parent, before } = {}) {
  let root = document.getElementById(id);
  if (root) return root;
  root = document.createElement("div");
  root.id = id;
  if (className) root.className = className;
  if (html) root.innerHTML = html;
  const host = parent ?? document.body;
  if (before) host.insertBefore(root, before);
  else host.appendChild(root);
  return root;
}

export function setImportant(el, props) {
  for (const [name, value] of Object.entries(props)) {
    el.style.setProperty(name, value, "important");
  }
}

const MOTION_STYLE_PROPS = [
  "height", "min-height", "max-height", "transform", "overflow", "pointer-events", "visibility"
];

export function clearMotionStyles(el, extraProps = []) {
  for (const prop of [...MOTION_STYLE_PROPS, ...extraProps]) el.style.removeProperty(prop);
}

export function beginMotion(root, { motionClass, outClass, inClass }, direction) {
  root.classList.remove(motionClass, outClass, inClass);
  root.classList.add(motionClass);
  root.classList.add(direction === "out" ? outClass : inClass);
}

export function updateMinimizeControl(root, {
  buttonSelector,
  minimizedClass,
  iconMinimized,
  iconExpanded,
  expandLabel,
  minimizeLabel
}) {
  const button = root?.querySelector(buttonSelector);
  if (!button) return;
  const minimized = root.classList.contains(minimizedClass);
  const icon = button.querySelector("i");
  if (icon) icon.className = minimized ? iconMinimized : iconExpanded;
  const label = minimized ? expandLabel : minimizeLabel;
  button.setAttribute("aria-label", label);
  button.dataset.tooltip = label;
  button.setAttribute("aria-expanded", minimized ? "false" : "true");
}

export function applyMinimizedInstant(root, minimized, {
  minimizedClass,
  motionSelector,
  motionClasses = [],
  extraStyleProps = [],
  beforeToggle
} = {}) {
  root.classList.remove(...motionClasses);
  beforeToggle?.(root);
  const motion = motionSelector ? root.querySelector(motionSelector) : null;
  if (motion) clearMotionStyles(motion, extraStyleProps);
  root.classList.toggle(minimizedClass, minimized);
  if (motion) motion.setAttribute("aria-hidden", minimized ? "true" : "false");
}

export async function runMinimizeToggle(root, {
  animatingKey,
  isMinimized,
  syncFrame,
  animate,
  persist,
  apply
}) {
  if (!root) return;
  if (root.dataset[animatingKey] === "1") return;
  const nextMinimized = !isMinimized();
  root.dataset[animatingKey] = "1";
  try {
    if (nextMinimized) syncFrame?.(root);
    await animate(root, nextMinimized);
    await persist?.(nextMinimized);
  } finally {
    delete root.dataset[animatingKey];
    apply(root);
  }
}

export const SLIDER_STEPS = 1000;

export function scrollFromSlider(el, slider, { axis = "left", maxScroll } = {}) {
  const max = Number(slider.dataset.maxScroll) || maxScroll || 0;
  if (max <= 0) return 0;
  return (Number(slider.value) / SLIDER_STEPS) * max;
}

export function sliderFromScroll(el, slider, { axis = "left", maxScroll } = {}) {
  const max = Number(slider.dataset.maxScroll) || maxScroll || 0;
  if (max <= 0) return 0;
  const pos = axis === "top" ? el.scrollTop : el.scrollLeft;
  return Math.round((pos / max) * SLIDER_STEPS);
}
