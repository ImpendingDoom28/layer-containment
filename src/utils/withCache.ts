/**
 * Wrap a pure function in a WeakMap cache.
 *
 * The first parameter is the cache key (matched by reference identity); the
 * remaining parameters (scalars such as numbers or strings) are joined into a
 * sub-key. Because the outer key is held in a WeakMap, the whole cached
 * subtree is garbage-collected once the key object (e.g. a level's
 * `pathWaypoints` array) is no longer referenced — no manual invalidation, and
 * a fresh key (e.g. a reloaded level) starts with an empty cache.
 *
 * The wrapped function must be deterministic for a given argument set.
 */
export const withCache = <
  Key extends object,
  Rest extends unknown[],
  Ret,
>(
  fn: (key: Key, ...rest: Rest) => Ret
): ((key: Key, ...rest: Rest) => Ret) => {
  const cache = new WeakMap<Key, Map<string, Ret>>();

  return (key: Key, ...rest: Rest): Ret => {
    const argKey = rest.join("|");
    let inner = cache.get(key);
    if (!inner) {
      inner = new Map<string, Ret>();
      cache.set(key, inner);
    }
    if (inner.has(argKey)) return inner.get(argKey) as Ret;

    const value = fn(key, ...rest);
    inner.set(argKey, value);
    return value;
  };
};
