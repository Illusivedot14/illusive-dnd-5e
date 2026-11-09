import { mountPanel, unmountPanel } from "../hud-mount.mjs";

/**
 * Build a HUD panel descriptor with the shared mount → paint → unmount lifecycle
 * that every panel repeated by hand: gate on an enable check, unmount when off,
 * otherwise ensure the root is mounted and hand it to the panel's own renderer.
 *
 * @param {object} config
 * @param {string} config.id                                     root element id
 * @param {string} config.mask                                    render-mask key gating this panel
 * @param {string} config.shell                                   HTML for the root element
 * @param {() => boolean} [config.enabled]                        should the panel be shown? (defaults to always)
 * @param {(root: HTMLElement) => void} [config.onMount]          one-time wiring, run only on first mount
 * @param {() => void} [config.onUnmount]                         cleanup when the panel is removed
 * @param {(root: HTMLElement, options?: object) => unknown} config.render   paint into the mounted root
 * @param {() => void} [config.position]                          reposition callback (layout passes / resize)
 * @returns {import("./registry.mjs").HudPanel}
 */
export function definePanel(config) {
  return {
    id: config.id,
    mask: config.mask,
    position: config.position,
    unmount() {
      config.onUnmount?.();
      unmountPanel(config.id);
    },
    async paint(options) {
      if (config.enabled && !config.enabled()) {
        unmountPanel(config.id);
        return;
      }

      const firstMount = !document.getElementById(config.id);
      const root = mountPanel(config.id, config.shell);
      if (!root) return;
      if (firstMount) config.onMount?.(root);

      await config.render(root, options);
    }
  };
}
