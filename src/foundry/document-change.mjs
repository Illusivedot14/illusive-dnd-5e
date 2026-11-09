/**
 * What a Foundry diff actually touches.
 * Callers use this to skip panels that cannot see the change.
 */

const TOKEN_MOVEMENT_KEYS = new Set([
  "x", "y", "elevation", "rotation", "width", "height", "depth",
  "shape", "level", "action", "movementAction", "_movementHistory"
]);

/** Dotted paths in a Foundry diff. Arrays stay as one path. */
export function changePaths(changes) {
  const paths = [];
  const walk = (value, prefix) => {
    if (!prefix && (value == null || typeof value !== "object")) return;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      if (prefix) paths.push(prefix);
      return;
    }
    const keys = Object.keys(value);
    if (!keys.length) {
      if (prefix) paths.push(prefix);
      return;
    }
    for (const key of keys) walk(value[key], prefix ? `${prefix}.${key}` : key);
  };
  walk(changes, "");
  return paths;
}

export function changeTouches(changes, prefix) {
  if (!changes || typeof changes !== "object") return true;
  const paths = changePaths(changes);
  if (!paths.length) return true;
  return paths.some((path) => path === prefix || path.startsWith(`${prefix}.`));
}

/** x/y, facing, size, and the recorded path. Not light, name, or flags. */
export function isTokenMovementChange(changes) {
  const keys = Object.keys(changes ?? {});
  return keys.length > 0 && keys.every((key) => TOKEN_MOVEMENT_KEYS.has(key));
}

function isOnlyActorPath(changes, prefix) {
  const paths = changePaths(changes);
  return paths.length > 0 && paths.every((path) => path === prefix || path.startsWith(`${prefix}.`));
}

/** Actor diff that only writes system.attributes.movement. */
export function isActorMovementChange(changes) {
  return isOnlyActorPath(changes, "system.attributes.movement");
}

/** Actor diff that only writes system.attributes.inspiration. */
export function isActorInspirationChange(changes) {
  return isOnlyActorPath(changes, "system.attributes.inspiration");
}

const ACTOR_FIELD_PREFIXES = [
  ["inspiration", "system.attributes.inspiration"],
  ["movement", "system.attributes.movement"],
  ["hp", "system.attributes.hp"],
  ["death", "system.attributes.death"],
  ["ac", "system.attributes.ac"],
  ["init", "system.attributes.init"],
  ["prof", "system.attributes.prof"],
  ["abilities", "system.abilities"],
  ["skills", "system.skills"],
  ["resources", "system.resources"],
  ["spells", "system.spells"],
  ["currency", "system.currency"]
];

function fieldForPath(path) {
  if (path === "name" || path === "img" || path === "prototypeToken" || path.startsWith("prototypeToken.")) {
    return "identity";
  }
  if (path === "flags" || path.startsWith("flags.")) {
    if (path.includes(".dashing")) return "movement";
    if (path.includes(".stable")) return "death";
    return "flags";
  }
  for (const [field, prefix] of ACTOR_FIELD_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}.`)) return field;
  }
  return "unknown";
}

/**
 * Named pieces of an actor diff.
 * `unknown` means the diff is empty or touches something no single control owns.
 * @param {object} changes
 * @returns {Set<string>}
 */
export function actorFields(changes) {
  const paths = changePaths(changes);
  const fields = new Set();
  if (!paths.length) {
    fields.add("unknown");
    return fields;
  }
  for (const path of paths) fields.add(fieldForPath(path));
  return fields;
}
