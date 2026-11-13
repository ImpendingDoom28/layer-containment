import { describe, expect, it } from "vitest";

import { BufferGeometry, Float32BufferAttribute } from "three";

import { buildSkirt } from "./CanyonBasin";
import {
  flatFieldToSphereSurface,
  getPlanetRadius,
} from "../../utils/planetSurfaceMapping";
import {
  CANON_BASIN_DEPTH,
  sampleBasinFloorY,
  type CanyonWorldBBox,
} from "../../utils/canyonBridges";

const RADIUS = getPlanetRadius(20, 1);

const BBOX: CanyonWorldBBox = {
  minX: -4,
  maxX: 4,
  minZ: -2,
  maxZ: 2,
};

const toGeometry = (
  part: { positions: number[]; indices: number[] }
): BufferGeometry => {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(part.positions, 3)
  );
  geometry.setIndex(part.indices);
  geometry.computeVertexNormals();
  return geometry;
};

describe("buildSkirt", () => {
  const { positions, indices } = buildSkirt(BBOX, RADIUS);
  const vertexCount = positions.length / 3;
  const columns = vertexCount / 2;

  it("builds a closed loop: every index references an existing vertex", () => {
    for (const i of indices) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(vertexCount);
    }
  });

  it("wraps the final quad back to the first column", () => {
    // The last quad is (a, b, d, a, d, c) with a/b on the final column and
    // c/d on the first column — the wall closes into a loop.
    const lastQuad = indices.slice(indices.length - 6);
    expect(lastQuad[0]).toBe(2 * (columns - 1)); // bottom of final column
    expect(lastQuad[1]).toBe(2 * (columns - 1) + 1); // top of final column
    expect(lastQuad).toContain(0); // bottom of first column
    expect(lastQuad).toContain(1); // top of first column
  });

  it("references every perimeter column as its own base", () => {
    // Each quad pushes (a, b, d, a, d, c); the two `a` entries (slots 0 and 3
    // of every 6) are the base column of the quad.
    const ownBases = indices
      .filter((_, i) => i % 6 === 0 || i % 6 === 3)
      .filter((v) => v % 2 === 0);
    expect(new Set(ownBases).size).toBe(columns);
    expect(columns).toBe(4 * 24);
  });

  it("produces finite, outward, vertical normals", () => {
    const geometry = toGeometry({ positions, indices });
    const normal = geometry.getAttribute("normal");
    for (let i = 0; i < normal.count; i++) {
      expect(Number.isFinite(normal.getX(i))).toBe(true);
      expect(Number.isFinite(normal.getY(i))).toBe(true);
      expect(Number.isFinite(normal.getZ(i))).toBe(true);
    }
    // Vertex 0 is the SW corner (minX, minZ): the outward direction is
    // away from the canyon center, i.e. into the (-x, -z) quadrant.
    expect(normal.getX(0)).toBeLessThan(0);
    expect(normal.getZ(0)).toBeLessThan(0);
    // The wall is vertical: its normals are horizontal.
    expect(Math.abs(normal.getY(0))).toBeLessThan(1e-6);
  });

  it("sits on the basin floor at full depth", () => {
    const surfaceY = flatFieldToSphereSurface(
      BBOX.minX,
      BBOX.minZ,
      RADIUS
    ).surfacePoint.y;
    const floorY = sampleBasinFloorY(BBOX.minX, BBOX.minZ, BBOX, RADIUS);
    // The perimeter sample is at the canyon edge, so the floor is at full
    // depth below the surface.
    expect(Math.abs(floorY - (surfaceY - CANON_BASIN_DEPTH))).toBeLessThan(1e-3);
    // The skirt's bottom vertex sits exactly on that floor.
    expect(Math.abs(positions[1] - floorY)).toBeLessThan(1e-9);
  });
});
