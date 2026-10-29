import type { World } from "koota";

/**
 * Generic per-world record registry (object pooling): one record per key is
 * created on first appearance and re-copied in place on every refresh, so
 * hot per-frame consumers (tower targeting, projectile homing) allocate
 * nothing in steady state.
 *
 * One registry per `World` (held in a `WeakMap` so a destroyed world's
 * registry is garbage-collected with it): refreshing a world only mutates
 * that world's registry, so two worlds sharing keys cannot clobber each
 * other (e.g. `world` / `testWorld` / `editorWorld`).
 *
 * Callers only supply the shape: which query to refresh from, how to extract
 * the key from a row, how to create a record, and how to re-copy it. Records
 * hold live references, not frozen snapshots — consume them within a single
 * system pass.
 */
export const createWorldRegistry = <Key, Entry, Row>(options: {
  /** Query to refresh the registry from; its `readEach` row is `Row`. */
  query: (world: World) => { readEach: (fn: (row: Row) => void) => void };
  /** Stable key identifying a record across refreshes (e.g. entity id). */
  key: (row: Row) => Key;
  /** Builds a record from a row (called once per key, on first appearance). */
  create: (row: Row) => Entry;
  /** Re-copies a record from a row in place (called on every refresh). */
  update: (entry: Entry, row: Row) => void;
}): {
  /**
   * Rebuilds the world's registry from the query: records for new keys are
   * created, existing ones are re-copied in place, and gone keys are deleted.
   * Returns the registry; consume it within your own system pass.
   */
  refresh: (world: World) => Map<Key, Entry>;
  /**
   * Refreshes and returns the records (optionally filtered) in a list that is
   * reused across calls, so the steady state allocates no list. Consume the
   * list within your own system pass.
   */
  collect: (world: World, filter?: (entry: Entry) => boolean) => Entry[];
} => {
  const registries = new WeakMap<World, Map<Key, Entry>>();
  const list: Entry[] = [];

  const refresh = (world: World): Map<Key, Entry> => {
    let registry = registries.get(world);
    if (!registry) {
      registry = new Map();
      registries.set(world, registry);
    }
    const seenKeys = new Set<Key>();
    options.query(world).readEach((row) => {
      const key = options.key(row);
      seenKeys.add(key);
      const existing = registry.get(key);
      if (existing) {
        options.update(existing, row);
      } else {
        registry.set(key, options.create(row));
      }
    });
    for (const key of registry.keys()) {
      if (!seenKeys.has(key)) registry.delete(key);
    }
    return registry;
  };

  const collect = (
    world: World,
    filter?: (entry: Entry) => boolean
  ): Entry[] => {
    list.length = 0;
    for (const entry of refresh(world).values()) {
      if (!filter || filter(entry)) list.push(entry);
    }
    return list;
  };

  return { refresh, collect };
};
