import { describe, expect, it } from "vitest";

import {
  BufferGeometry,
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

const raycastFromAbove = (
  geometry: BufferGeometry,
  x: number,
  z: number
): number | null => {
  const mesh = new Mesh(geometry, new MeshBasicMaterial());
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
      const dist = raycastFromAbove(cut, x, z);
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
      const dist = raycastFromAbove(cut, x, z);
      expect(dist).not.toBeNull();
      expect(dist!).toBeLessThan(1.5);
    }
  });

  it("preserves every non-fan triangle and the fan's outside parts", () => {
    const sourceIndex = source.getIndex()!;
    const firstTriangleEnd = SEGMENTS * 3;
    const index = cut.getIndex()!;
    const nonFanCount = sourceIndex.count - firstTriangleEnd;
    const total = index.count;

    // The output is in source order: the (clipped) fan first, then every
    // non-fan triangle. For this small cap no non-fan triangle reaches the
    // basin, so the tail block is exactly the source's non-fan triangles,
    // verbatim and in order.
    for (let i = 0; i < nonFanCount; i++) {
      expect(index.getX(total - nonFanCount + i)).toBe(
        sourceIndex.getX(firstTriangleEnd + i)
      );
    }

    // Each original fan triangle (pole inside the cap, both ring vertices
    // outside) contributes at least one, and at most one per outside region
    // (four), retained fan triangle.
    const position = source.getAttribute("position");
    const fanTriangles = SEGMENTS;
    const retained = (total - nonFanCount) / 3;
    let expectedMin = 0;
    for (let t = 0; t < fanTriangles; t++) {
      const ids = [
        sourceIndex.getX(t * 3),
        sourceIndex.getX(t * 3 + 1),
        sourceIndex.getX(t * 3 + 2),
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

describe("cutSphereAtCanyon — a basin reaching beyond the pole fan", () => {
  // A cap that extends to |x| = 35, well past the pole fan's first ring
  // (xz ≈ 20.4 at 100 segments). The part of the basin beyond the first ring
  // is covered only by triangles in the later rings — clipping just the fan
  // would leave ground over it (an overhang that hides the basin floor).
  const EDGE_CAP = { minX: -35, maxX: 35, minZ: -3, maxZ: 3 };
  const edgeCut = cutSphereAtCanyon(
    source,
    EDGE_CAP.minX,
    EDGE_CAP.maxX,
    EDGE_CAP.minZ,
    EDGE_CAP.maxZ
  );

  it("cuts the ground over the basin part beyond the first ring", () => {
    // (32, 0) is inside the basin but past the first ring — no ground there.
    const dist = raycastFromAbove(edgeCut, 32, 0);
    expect(dist === null || dist > 4).toBe(true);
    // (0, 0) (over the fan) is also cut.
    const center = raycastFromAbove(edgeCut, 0, 0);
    expect(center === null || center > 4).toBe(true);
  });

  it("keeps the ground on the surrounding land past the cut", () => {
    // (40, 0) is outside the basin (|x| > 35) — ground present.
    const dist = raycastFromAbove(edgeCut, 40, 0);
    expect(dist).not.toBeNull();
    expect(dist!).toBeLessThan(1.5);
    // (-30, 0) is inside the basin but on the -x side — also cut.
    const inner = raycastFromAbove(edgeCut, -30, 0);
    expect(inner === null || inner > 4).toBe(true);
  });

  it("never carves the far (south) pole even though its xz lies in the cap", () => {
    // The basin cap's xz rectangle (±35, ±3) also covers the opposite (south)
    // pole and the surrounding lower hemisphere. The board is only the
    // north-pole cap, so the far side must stay intact: a ray pointing up from
    // just below a lower-hemisphere point whose xz is inside the cap hits the
    // ground ~1 unit on. (Off-axis, to avoid the pole's convergent vertex.)
    const x = 10;
    const z = 0;
    const lowerY = -Math.sqrt(RADIUS * RADIUS - x * x - z * z);
    const mesh = new Mesh(edgeCut, new MeshBasicMaterial());
    const raycaster = new Raycaster();
    raycaster.set(new Vector3(x, lowerY - 1, z), new Vector3(0, 1, 0));
    const hits = raycaster.intersectObject(mesh);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].distance).toBeLessThan(1.5);
  });
});
