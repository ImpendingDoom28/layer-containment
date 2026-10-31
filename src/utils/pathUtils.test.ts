import { describe, expect, it } from "vitest";

import type { PathWaypoint } from "../core/types/game";
import {
  getPathDirection,
  getPathLength,
  getPositionAlongPath,
} from "./pathUtils";

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
    const a = [
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 0, z: 12 },
    ];
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

describe("getPathDirection", () => {
  it("returns the segment direction for a straight path", () => {
    expect(getPathDirection(straight, 0)).toEqual({ x: 1, z: 0 });
    expect(getPathDirection(straight, 0.4)).toEqual({ x: 1, z: 0 });
    expect(getPathDirection(straight, 1)).toEqual({ x: 1, z: 0 });
  });

  it("returns the current segment direction of a cornered path", () => {
    // Corner at progress 3/7; legs are (3,0) and (0,4) long.
    expect(getPathDirection(cornered, 0)).toEqual({ x: 1, z: 0 });
    expect(getPathDirection(cornered, 0.2)).toEqual({ x: 1, z: 0 });
    expect(getPathDirection(cornered, 0.6)).toEqual({ x: 0, z: 1 });
    expect(getPathDirection(cornered, 1)).toEqual({ x: 0, z: 1 });
  });

  it("normalizes non-axis-aligned segments", () => {
    const path: PathWaypoint[] = [
      { x: 0, y: 0, z: 0 },
      { x: 3, y: 0, z: 4 },
    ];
    expect(getPathDirection(path, 0.5)).toEqual({ x: 0.6, z: 0.8 });
  });

  it("falls back to +x for degenerate paths and zero-length segments", () => {
    expect(getPathDirection([], 0.5)).toEqual({ x: 1, z: 0 });
    expect(getPathDirection([{ x: 0, y: 0, z: 0 }], 0.5)).toEqual({
      x: 1,
      z: 0,
    });
    const zeroSegment: PathWaypoint[] = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 0, z: 0 },
    ];
    expect(getPathDirection(zeroSegment, 0)).toEqual({ x: 1, z: 0 });
    expect(getPathDirection(zeroSegment, 0.5)).toEqual({ x: 1, z: 0 });
  });
});
