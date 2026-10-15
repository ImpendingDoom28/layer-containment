import { describe, expect, it, vi } from "vitest";

import { createWorldRegistry } from "./worldRegistry";

type Row = [id: number, value: string];

/** Minimal world-shaped object: `query()` returns a `readEach` over rows. */
const makeWorld = (rows: Row[]) => ({
  query: () => ({
    readEach: (fn: (row: Row) => void) => {
      for (const row of rows) fn(row);
    },
  }),
});

/** Registry config: record is `{ id, value, copies }` — `copies` counts
 * how many times `update` re-copied the record in place. */
type Entry = { id: number; value: string; copies: number };

const createTestRegistry = () => {
  const create = vi.fn(([id, value]: Row) => ({ id, value, copies: 0 }));
  const update = vi.fn((entry: Entry, [id, value]: Row) => {
    entry.id = id;
    entry.value = value;
    entry.copies += 1;
  });
  const { refresh, collect } = createWorldRegistry<number, Entry, Row>({
    query: (world) => (world as ReturnType<typeof makeWorld>).query(),
    key: ([id]) => id,
    create,
    update,
  });
  return { refresh, collect, create, update };
};

describe("createWorldRegistry", () => {
  it("creates a record per key on first appearance, once only", () => {
    const { refresh, create } = createTestRegistry();
    const world = makeWorld([
      [1, "a"],
      [2, "b"],
    ]);

    const registry = refresh(world);

    expect(registry.size).toBe(2);
    expect(registry.get(1)?.value).toBe("a");
    expect(registry.get(2)?.value).toBe("b");
    expect(create).toHaveBeenCalledTimes(2);
    expect(registry.get(1)?.copies).toBe(0);
  });

  it("re-copies existing records in place on refresh (stable identity)", () => {
    const { refresh, create, update } = createTestRegistry();
    const rows: Row[] = [[1, "a"]];
    const world = makeWorld(rows);

    const r1 = refresh(world).get(1);
    rows[0] = [1, "b"]; // same key, new value
    const r2 = refresh(world).get(1);

    expect(r2).toBe(r1);
    expect(r2?.value).toBe("b");
    expect(r2?.copies).toBe(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("deletes records whose key disappeared", () => {
    const { refresh, create } = createTestRegistry();
    const rows: Row[] = [
      [1, "a"],
      [2, "b"],
    ];
    const world = makeWorld(rows);

    refresh(world);
    rows.splice(1, 1); // key 2 is gone
    const registry = refresh(world);

    expect(registry.size).toBe(1);
    expect(registry.has(2)).toBe(false);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("re-creates a record when a key reappears (id-reuse safety)", () => {
    const { refresh, create } = createTestRegistry();
    const rows: Row[] = [[1, "a"]];
    const world = makeWorld(rows);

    refresh(world);
    rows.length = 0;
    refresh(world);
    rows.push([1, "c"]); // same key, new value (mirrors id counter reset)
    const registry = refresh(world);

    expect(registry.get(1)?.value).toBe("c");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("keeps one registry per world (no cross-world clobbering)", () => {
    const { refresh } = createTestRegistry();
    const worldA = makeWorld([[1, "a"]]);
    const worldB = makeWorld([[1, "b"]]);

    const a = refresh(worldA);
    const b = refresh(worldB);

    expect(a.get(1)?.value).toBe("a");
    expect(b.get(1)?.value).toBe("b");
    expect(a).not.toBe(b);
  });

  it("collect reuses one list across calls and applies the filter", () => {
    const { collect } = createTestRegistry();
    const rows: Row[] = [
      [1, "alive"],
      [2, "dead"],
    ];
    const world = makeWorld(rows);
    const filter = (entry: { value: string }) => entry.value !== "dead";

    const first = collect(world, filter);
    const second = collect(world, filter);

    expect(first).toHaveLength(1);
    expect(first[0]?.value).toBe("alive");
    expect(second).toBe(first); // same reused list, no allocation
    expect(second[0]?.value).toBe("alive");
  });

  it("collect without a filter returns every entry", () => {
    const { collect } = createTestRegistry();
    const world = makeWorld([
      [1, "a"],
      [2, "b"],
    ]);

    expect(collect(world).map((e) => e.value)).toEqual(["a", "b"]);
  });
});
