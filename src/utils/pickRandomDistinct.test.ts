import { describe, expect, it } from "vitest";

import { pickRandomDistinct } from "./pickRandomDistinct";

describe("pickRandomDistinct", () => {
  it("returns at most count items", () => {
    const pool = ["a", "b", "c", "d"] as const;
    const out = pickRandomDistinct(pool, 3);
    expect(out).toHaveLength(3);
  });

  it("returns at most pool length when count is larger", () => {
    const pool = ["a", "b"] as const;
    const out = pickRandomDistinct(pool, 10);
    expect(out).toHaveLength(2);
    expect(new Set(out).size).toBe(2);
  });

  it("returns distinct elements", () => {
    const pool = ["a", "b", "c", "d", "e"] as const;
    for (let i = 0; i < 50; i++) {
      const out = pickRandomDistinct(pool, 3);
      expect(new Set(out).size).toBe(out.length);
      for (const x of out) {
        expect(pool).toContain(x);
      }
    }
  });
});
