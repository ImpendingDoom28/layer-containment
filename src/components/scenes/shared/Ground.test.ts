import { describe, expect, it } from "vitest";

import {
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  SphereGeometry,
  Vector3,
} from "three";

import { cutSphereAtCanyon } from "./Ground";
import { getPlanetRadius } from "../../../utils/planetSurfaceMapping";

const GRID = 16;
const TILE = 1;
const RADIUS = getPlanetRadius(GRID, TILE);
const SEGMENTS = 100;

// The basin cap for the test (the same span as Level 4's cap).
const CAP = { minX: -5, maxX: 5, minZ: -3, maxZ: 3 };

const source = new SphereGeometry(RADIUS, SEGMENTS, SEGMENTS);
const cut = cutSphereAtCanyon(
  source,
  CAP.minX,
  CAP.maxX,
  CAP.minZ,
  CAP.maxZ
);

const inCap = (x: number, z: number) =>
  x >= CAP.minX && x <= CAP.maxX && z >= CAP.minZ && z <= CAP.maxZ;

// Local (sphere-space) surface height directly above (x, z).
const surfaceY = (x: number, z: number): number =>
  Math.sqrt(RADIUS * RADIUS - x * x - z * z);

const raycastFromAbove = (x: number, z: number): number | null => {
  const mesh = new Mesh(cut, new MeshBasicMaterial());
  const raycaster = new Raycaster();
  const origin = new Vector3(x, surfaceY(x, z) + 1, z);
  const dir = new Vector3(0, -1, 0);
  raycaster.set(origin, dir);
  const hits = raycaster.intersectObject(mesh);
  return hits.length > 0 ? hits[0].distance : null;
};

describe("cutSphereAtCanyon", () => {
  it("keeps every index in range and normals finite", () => {
    const position = cut.getAttribute("position");
    const normal = cut.getAttribute("normal");
    const index = cut.getIndex()!;
    for (let i = 0; i < index.count; i++) {
      expect(index.getX(i)).toBeLessThan(position.count);
    }
    for (let i = 0; i < normal.count; i++) {
      expect(Number.isFinite(normal.getY(i))).toBe(true);
    }
  });

  it("cuts the ground away over the basin (the hole)", () => {
    for (const [x, z] of [
      [0, 0],
      [2, 0],
      [-2, 0],
      [0, 1],
      [0, -1],
      [3, 2],
    ] as Array<[number, number]>) {
      // A ray from just above the surface finds no ground within 4 units —
      // the only thing below is the far side of the planet (~2*R away).
      const dist = raycastFromAbove(x, z);
      expect(dist === null || dist > 4).toBe(true);
    }
  });

  it("keeps the ground over the surrounding land", () => {
    for (const [x, z] of [
      [7, 0],
      [-7, 0],
      [0, 5],
      [0, -5],
      [6.5, 2.5],
      [-6.5, -2.5],
    ] as Array<[number, number]>) {
      // The ground is exactly at the surface: a ray from 1 unit above hits
      // at distance ~1.
      const dist = raycastFromAbove(x, z);
      expect(dist).not.toBeNull();
      expect(dist!).toBeLessThan(1.5);
    }
  });

  it("preserves every non-fan triangle and the fan's outside parts", () => {
    const sourceIndex = source.getIndex()!;
    const firstTriangleEnd = SEGMENTS * 3;
    const index = cut.getIndex()!;
    const nonFanCount = sourceIndex.count - firstTriangleEnd;

    // Every original triangle after the fan is preserved verbatim, in order.
    for (let i = 0; i < nonFanCount; i++) {
      expect(index.getX(i)).toBe(sourceIndex.getX(firstTriangleEnd + i));
    }

    // Each original fan triangle (pole inside the cap, both ring vertices
    // outside) contributes at least one, and at most one per outside region
    // (four), retained fan triangle.
    const position = source.getAttribute("position");
    const fanTriangles = SEGMENTS;
    let retained = (index.count - nonFanCount) / 3;
    let expectedMin = 0;
    for (let t = 0; t < fanTriangles; t++) {
      const ids = [
        sourceIndex.getX(firstTriangleEnd + t * 3),
        sourceIndex.getX(firstTriangleEnd + t * 3 + 1),
        sourceIndex.getX(firstTriangleEnd + t * 3 + 2),
      ];
      const inside = ids.filter((v) => {
        const x = position.getX(v);
        const z = position.getZ(v);
        return inCap(x, z);
      }).length;
      if (inside < 3) expectedMin += 1; // not wholly inside the cap
    }
    expect(expectedMin).toBe(fanTriangles);
    expect(retained).toBeGreaterThanOrEqual(expectedMin);
    expect(retained).toBeLessThanOrEqual(expectedMin * 4);
  });
});
