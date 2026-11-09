/**
 * Inspectable Foundry hook router — each route registered once with a plain name.
 */

const routes = [];
let started = false;

/**
 * @param {string} hook
 * @param {string} name  plain-language label
 * @param {(...args: unknown[]) => unknown} handler
 * @param {{ once?: boolean, gmOnly?: boolean }} [opts]
 */
export function route(hook, name, handler, opts = {}) {
  routes.push({ hook, name, gmOnly: Boolean(opts.gmOnly), once: Boolean(opts.once) });
  const wrap = (...args) => {
    try {
      if (opts.gmOnly && !(game.user?.isGM)) return;
      return handler(...args);
    } catch (err) {
      console.error(`illusive-dnd-5e | route "${name}" failed`, err);
    }
  };
  if (opts.once) Hooks.once(hook, wrap);
  else Hooks.on(hook, wrap);
}

export function listRoutes() {
  return routes.map((r) => ({ ...r }));
}

export function markRouterStarted() {
  started = true;
}

export function isRouterStarted() {
  return started;
}
