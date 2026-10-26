import { describe, expect, it } from "vitest";

import type { PathWaypoint } from "../core/types/game";
import { getPathLength, getPositionAlongPath } from "./pathUtils";

const straight: PathWaypoint[] = [
  { x: 0, y: 0, z: 0 },
  { x: 10, y: 0, z: 0 },
];

const cornered: PathWaypoint[] = [
  { x: 0, y: 0, z: 0 },
  { x: 3, y: 0, z: 0 },
  { x: 3, y: 0, z: 4 },
];

describe("getPathLength", () => {
  it("sums the segment lengths of a path", () => {
    expect(getPathLength(straight)).toBeCloseTo(10);
    expect(getPathLength(cornered)).toBeCloseTo(7);
  });

  it("returns 0 for a degenerate single-waypoint path", () => {
    expect(getPathLength([{ x: 0, y: 0, z: 0 }])).toBe(0);
  });

  it("is cached per path identity", () => {
    const a = [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 12 }];
    expect(getPathLength(a)).toBeCloseTo(13);
    // Same array identity -> cached result.
    expect(getPathLength(a)).toBeCloseTo(13);
  });
});

describe("getPositionAlongPath", () => {
  it("maps a progress fraction to a point on the path", () => {
    expect(getPositionAlongPath(0.5, straight)).toEqual({
      x: 5,
      y: 0,
      z: 0,
    });
  });
});
