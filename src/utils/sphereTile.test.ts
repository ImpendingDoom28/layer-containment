import { describe, expect, it } from "vitest";
import { Vector3 } from "three";

import {
  flatFieldToSphereSurface,
  getPlanetRadius,
} from "./planetSurfaceMapping";
import { tileToWorldCoordinate } from "./levelEditor";
import { getSlabGeometry, getSphereTilePose } from "./sphereTile";

describe("getSphereTilePose", () => {
  // The pose contract: the slab centre sits `slabHalfHeight` above the
  // sphere surface along the surface normal, with the slab's local +Y aligned
  // to that normal.
  const expectPoseOnSurface = (gridX: number, gridZ: number) => {
    const gridSize = 20;
    const tileSize = 1;
    const slabHalfHeight = 0.25;
    const pose = getSphereTilePose(
      gridX,
      gridZ,
      gridSize,
      tileSize,
      slabHalfHeight
    );
    const radius = getPlanetRadius(gridSize, tileSize);
    const worldX = tileToWorldCoordinate(gridX, gridSize, tileSize);
    const worldZ = tileToWorldCoordinate(gridZ, gridSize, tileSize);
    const { surfacePoint, normal } = flatFieldToSphereSurface(
      worldX,
      worldZ,
      radius
    );
    const expected = surfacePoint
      .clone()
      .addScaledVector(normal, slabHalfHeight);
    expect(pose.position.distanceTo(expected)).toBeLessThan(1e-9);

    const up = new Vector3(0, 1, 0).applyQuaternion(pose.quaternion);
    expect(up.angleTo(normal)).toBeLessThan(1e-9);
  };

  it("lifts the center tile straight up from the surface", () => {
    expectPoseOnSurface(0, 0);
  });

  it("lifts an off-center tile along its local surface normal", () => {
    expectPoseOnSurface(3, 5);
  });
});

describe("getSlabGeometry", () => {
  it("shares one instance per (subdivided, size, height) triple", () => {
    const a = getSlabGeometry(1, 0.05, false);
    const b = getSlabGeometry(1, 0.05, false);
    expect(a).toBe(b);
    expect(getSlabGeometry(1, 0.05, true)).not.toBe(a);
    expect(getSlabGeometry(2, 0.05, false)).not.toBe(a);
    expect(getSlabGeometry(1, 0.1, false)).not.toBe(a);
  });

  it("keeps the top face at half the slab height", () => {
    const plain = getSlabGeometry(1, 0.05, false);
    plain.computeBoundingBox();
    // Float32 attribute precision, so the bounds carry a tiny epsilon.
    expect(plain.boundingBox?.max.y).toBeCloseTo(0.025, 6);
    expect(plain.boundingBox?.min.y).toBeCloseTo(-0.025, 6);

    // The subdivided top face is an 8x8 grid (the swell needs vertices); the
    // plain slab is a single-segment box — 24 vertices (4 per face,
    // non-indexed).
    const subdivided = getSlabGeometry(1, 0.05, true);
    expect(plain.attributes["position"].count).toBe(24);
    expect(subdivided.attributes["position"].count).toBeGreaterThan(100);
  });
});
