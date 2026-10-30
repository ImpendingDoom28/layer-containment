import { describe, expect, it } from "vitest";

import {
  getRayObstacleClipDistance,
  segmentCrossesObstacles,
  type LineOfSightObstacle,
} from "./mathUtils";

// A 2x2 square centered at the origin: x/z in [-1, 1].
const square: LineOfSightObstacle = {
  x: 0,
  z: 0,
  halfWidth: 1,
  halfDepth: 1,
};

// The same square shifted so it spans x in [1, 3].
const squareAtX1: LineOfSightObstacle = { ...square, x: 2 };

describe("segmentCrossesObstacles", () => {
  it("reports no crossing without obstacles", () => {
    expect(segmentCrossesObstacles(0, 0, 10, 0, [])).toBe(false);
  });

  it("crosses an obstacle in the middle of the segment", () => {
    expect(segmentCrossesObstacles(-5, 0, 5, 0, [square])).toBe(true);
  });

  it("does not cross when the segment passes beside the obstacle", () => {
    // z = 2 is outside the obstacle's z extent [-1, 1].
    expect(segmentCrossesObstacles(-5, 2, 5, 2, [square])).toBe(false);
  });

  it("does not cross when the segment stays on one side of the obstacle", () => {
    // Starts at x = 3 and moves further away: the x slab is never entered.
    expect(segmentCrossesObstacles(3, 0.5, 10, 0.5, [square])).toBe(false);
  });

  it("treats a degenerate segment as crossing nothing", () => {
    expect(segmentCrossesObstacles(0, 0, 0, 0, [square])).toBe(false);
  });

  it("a corner-grazing diagonal does not block (no interior crossing)", () => {
    // z = x touches the square only at its (1, 1) corner.
    expect(segmentCrossesObstacles(3, 3, 10, 10, [square])).toBe(false);
  });

  it("handles axis-aligned segments against slabs", () => {
    // z = 0 is inside the z slab, but the x range [2, 10] never enters
    // the x slab [-1, 1].
    expect(segmentCrossesObstacles(2, 0, 10, 0, [square])).toBe(false);
    // z = 5 is outside the z slab even though the x ranges overlap.
    expect(segmentCrossesObstacles(0, 5, 10, 5, [square])).toBe(false);
  });

  it("blocks when the segment crosses one obstacle among several it misses", () => {
    // Segment (0, 0) → (10, 0): the z-5 square (z in [4, 6]) is missed, the
    // square at (8, 0) is crossed. Either order must block.
    const offLine: LineOfSightObstacle = { x: 4, z: 5, halfWidth: 1, halfDepth: 1 };
    const onLine: LineOfSightObstacle = { x: 8, z: 0, halfWidth: 1, halfDepth: 1 };
    expect(segmentCrossesObstacles(0, 0, 10, 0, [offLine, onLine])).toBe(true);
    expect(segmentCrossesObstacles(0, 0, 10, 0, [onLine, offLine])).toBe(true);
  });

  it("does not block when the segment misses every obstacle", () => {
    const offA: LineOfSightObstacle = { x: 4, z: 5, halfWidth: 1, halfDepth: 1 };
    const offB: LineOfSightObstacle = { x: 8, z: 5, halfWidth: 1, halfDepth: 1 };
    expect(segmentCrossesObstacles(0, 0, 10, 0, [offA, offB])).toBe(false);
  });
});

describe("getRayObstacleClipDistance", () => {
  it("returns Infinity when the ray misses all obstacles", () => {
    expect(getRayObstacleClipDistance(0, 5, 1, 0, [square])).toBe(Infinity);
  });

  it("returns the entry distance into the obstacle", () => {
    // Ray from (0, 0) along +x enters squareAtX1 (x in [1, 3]) at x = 1.
    expect(getRayObstacleClipDistance(0, 0, 1, 0, [squareAtX1])).toBe(1);
  });

  it("returns the closest of several obstacles", () => {
    const far = { x: 10, z: 0, halfWidth: 1, halfDepth: 1 };
    expect(getRayObstacleClipDistance(0, 0, 1, 0, [far, squareAtX1])).toBe(1);
  });

  it("clips at the origin when it starts inside the obstacle", () => {
    expect(getRayObstacleClipDistance(0, 0, 1, 0, [square])).toBe(0);
  });
});
