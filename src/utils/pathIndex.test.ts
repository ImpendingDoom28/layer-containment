import { describe, expect, it } from "vitest";

import { getPositionAlongPath } from "./pathUtils";
import {
  createPathIndex,
  getPositionAlongPathIndexed,
} from "./pathIndex";

const makeWaypoints = (points: Array<[number, number]>): Array<{ x: number; y: number; z: number }> =>
  points.map(([x, z], i) => ({ x, y: i === 0 ? 0 : (i % 2) * 0.5, z }));

describe("path index (precomputed lookup)", () => {
  it("matches the linear-scan getPositionAlongPath for random progress", () => {
    const points: Array<[number, number]> = [];
    let x = 0;
    let z = 0;
    for (let i = 0; i < 60; i += 1) {
      points.push([x, z]);
      // serpentine-ish: alternate direction with random lengths
      const len = 1 + Math.random() * 8;
      if (i % 2 === 0) x += len;
      else x -= len;
      z += 2;
    }
    const waypoints = makeWaypoints(points);
    const index = createPathIndex(waypoints);

    const random = (n: number) => {
      // deterministic pseudo-random
      n = (n * 1664525 + 1013904223) % 4294967296;
      return n / 4294967296;
    };
    let seed = 7;

    for (let i = 0; i < 2000; i += 1) {
      seed = (seed * 48271) % 2147483647;
      const progress = (seed % 10000) / 10000;
      const a = getPositionAlongPath(progress, waypoints);
      const b = getPositionAlongPathIndexed(index, progress);
      expect(Math.abs(a.x - b.x)).toBeLessThan(1e-9);
      expect(Math.abs(a.y - b.y)).toBeLessThan(1e-9);
      expect(Math.abs(a.z - b.z)).toBeLessThan(1e-9);
    }
  });

  it("handles edge progress values (0 and 1)", () => {
    const waypoints = makeWaypoints([[0, 0], [3, 0], [3, 4], [0, 4]]);
    const index = createPathIndex(waypoints);

    const a0 = getPositionAlongPath(0, waypoints);
    const b0 = getPositionAlongPathIndexed(index, 0);
    expect(b0).toEqual({ ...a0 });

    const a1 = getPositionAlongPath(1, waypoints);
    const b1 = getPositionAlongPathIndexed(index, 1);
    expect(b1).toEqual({ ...a1 });
  });

  it("handles single-waypoint paths", () => {
    const waypoints = makeWaypoints([[5, 2]]);
    const index = createPathIndex(waypoints);
    expect(getPositionAlongPathIndexed(index, 0.5)).toEqual({ x: 5, y: 0, z: 2 });
  });

  it("is faster than the linear scan", () => {
    const points: Array<[number, number]> = [];
    let x = 0;
    let z = 0;
    for (let i = 0; i < 2080; i += 1) {
      points.push([x, z]);
      x += 0.5;
      if (i % 4 === 3) z += 1;
    }
    const waypoints = makeWaypoints(points);
    const index = createPathIndex(waypoints);

    const N = 200_000;
    const t0 = performance.now();
    for (let i = 0; i < N; i += 1) {
      getPositionAlongPath((i % 10000) / 10000, waypoints);
    }
    const tLinear = performance.now() - t0;

    const t1 = performance.now();
    for (let i = 0; i < N; i += 1) {
      getPositionAlongPathIndexed(index, (i % 10000) / 10000);
    }
    const tIndexed = performance.now() - t1;

    console.log(`linear: ${tLinear.toFixed(1)}ms, indexed: ${tIndexed.toFixed(1)}ms, speedup: ${(tLinear / tIndexed).toFixed(1)}x`);
    expect(tIndexed).toBeLessThan(tLinear);
  });
});
