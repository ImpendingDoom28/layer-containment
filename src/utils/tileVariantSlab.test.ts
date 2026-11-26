import { describe, expect, it } from "vitest";

import {
  getWaterVariantSlabs,
  topBoundaryVertices,
  waterFootprint,
  type WaterVariantSlabs,
} from "./tileVariantSlab";
import type { WaterVariant } from "../core/types/game";

const TILE_SIZE = 1;
const HALF_H = 0.05;
const A = TILE_SIZE / 2;

// Every partial variant.
const PARTIALS: Exclude<WaterVariant, "full">[] = [
  "half-n",
  "half-e",
  "half-s",
  "half-w",
  "corner-nw",
  "corner-ne",
  "corner-se",
  "corner-sw",
];

const allPositions = (slabs: WaterVariantSlabs): Float32Array[] => {
  const out: Float32Array[] = [];
  if (slabs.water) out.push(slabs.water.attributes["position"].array as Float32Array);
  if (slabs.land) out.push(slabs.land.attributes["position"].array as Float32Array);
  return out;
};

// Sum of the signed-area-free (absolute) areas of every top-face triangle
// (all three vertices at y ≈ +halfH) in the given geometry.
const topFaceArea = (positions: Float32Array, halfH: number): number => {
  let area = 0;
  for (let i = 0; i < positions.length; i += 9) {
    const y0 = positions[i + 1];
    const y1 = positions[i + 4];
    const y2 = positions[i + 7];
    if (
      Math.abs(y0 - halfH) > 1e-4 ||
      Math.abs(y1 - halfH) > 1e-4 ||
      Math.abs(y2 - halfH) > 1e-4
    ) {
      continue;
    }
    const ax = positions[i];
    const ay = positions[i + 2];
    const bx = positions[i + 3];
    const by = positions[i + 5];
    const cx = positions[i + 6];
    const cy = positions[i + 8];
    const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    area += Math.abs(cross) / 2;
  }
  return area;
};

describe("getWaterVariantSlabs", () => {
  it("returns no partial slabs for the full tile", () => {
    const slabs = getWaterVariantSlabs("full", TILE_SIZE, HALF_H);
    expect(slabs.water).toBeNull();
    expect(slabs.land).toBeNull();
  });

  it("yields both a water and a land slab for every partial variant", () => {
    for (const variant of PARTIALS) {
      const slabs = getWaterVariantSlabs(variant, TILE_SIZE, HALF_H);
      expect(slabs.water, `water slab for ${variant}`).not.toBeNull();
      expect(slabs.land, `land slab for ${variant}`).not.toBeNull();
    }
  });

  it("keeps every vertex inside the tile footprint and the slab height", () => {
    for (const variant of PARTIALS) {
      const slabs = getWaterVariantSlabs(variant, TILE_SIZE, HALF_H);
      for (const positions of allPositions(slabs)) {
        expect(positions.length % 3).toBe(0);
        for (let i = 0; i < positions.length; i += 3) {
          expect(Math.abs(positions[i])).toBeLessThanOrEqual(A + 1e-4); // x
          expect(Math.abs(positions[i + 2])).toBeLessThanOrEqual(A + 1e-4); // z
          expect(Math.abs(positions[i + 1])).toBeLessThanOrEqual(HALF_H + 1e-4); // y
        }
      }
    }
  });

  it("partitions the tile: water-top and land-top areas sum to the full tile area", () => {
    // The water and land footprints are complementary convex regions of the
    // square, so their subdivided/clipped top faces cover the tile exactly
    // once — the sum of their top-face triangle areas must equal tileSize^2.
    for (const variant of PARTIALS) {
      const slabs = getWaterVariantSlabs(variant, TILE_SIZE, HALF_H);
      const waterTop = topFaceArea(
        slabs.water!.attributes["position"].array as Float32Array,
        HALF_H
      );
      const landTop = topFaceArea(
        slabs.land!.attributes["position"].array as Float32Array,
        HALF_H
      );
      expect(waterTop + landTop, `partition for ${variant}`).toBeCloseTo(
        TILE_SIZE * TILE_SIZE,
        4
      );
    }
  });

  it("computes vertex normals for the slabs", () => {
    const slabs = getWaterVariantSlabs("half-n", TILE_SIZE, HALF_H);
    for (const geometry of [slabs.water!, slabs.land!]) {
      const normals = geometry.attributes["normal"];
      expect(normals).toBeDefined();
      // At least one non-degenerate normal.
      let nonZero = false;
      const arr = normals.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        const len = Math.hypot(arr[i], arr[i + 1], arr[i + 2]);
        if (len > 1e-6) nonZero = true;
      }
      expect(nonZero).toBe(true);
    }
  });

  it("places water on the inner side of every partial tile", () => {
    // Corrected 9-tile scheme: the water sits on the side facing the 3x3
    // group's center — edge tiles are water on the inner half (cut at the
    // tile midline) and corner tiles on the cut-off inner-corner triangle
    // (right angle at the inner corner, hypotenuse through the midpoints of
    // the two inner edges). Expected footprints in tile-local (u, v), CCW.
    const expected: Record<Exclude<WaterVariant, "full">, [number, number][]> = {
      "half-n": [
        [-A, -A],
        [A, -A],
        [A, 0],
        [-A, 0],
      ],
      "half-e": [
        [-A, -A],
        [0, -A],
        [0, A],
        [-A, A],
      ],
      "half-s": [
        [-A, 0],
        [A, 0],
        [A, A],
        [-A, A],
      ],
      "half-w": [
        [0, -A],
        [A, -A],
        [A, A],
        [0, A],
      ],
      "corner-nw": [
        [A, -A],
        [A, 0],
        [0, -A],
      ],
      "corner-ne": [
        [-A, -A],
        [0, -A],
        [-A, 0],
      ],
      "corner-se": [
        [-A, A],
        [-A, 0],
        [0, A],
      ],
      "corner-sw": [
        [A, A],
        [0, A],
        [A, 0],
      ],
    };
    const normalize = (pts: [number, number][]) =>
      [...pts]
        .map((p) => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6])
        .sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    for (const variant of PARTIALS) {
      expect(
        normalize(waterFootprint(variant, A)),
        `water footprint of ${variant}`
      ).toEqual(normalize(expected[variant]));
    }
  });

  it("forms one connected octagon across the 3x3 showcase", () => {
    // Lay the showcase out at its level_testing positions (tile size 1) and
    // check the union of all water regions is the designed octagon: every
    // octagon corner lies on the union's boundary and the dry outer corners
    // stay dry.
    const layout: Record<string, [number, number]> = {
      "corner-nw": [-1, 1],
      "half-n": [0, 1],
      "corner-ne": [1, 1],
      "half-w": [-1, 0],
      "half-e": [1, 0],
      "corner-sw": [-1, -1],
      "half-s": [0, -1],
      "corner-se": [1, -1],
    };
    const inPoly = (p: [number, number], poly: [number, number][]) => {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i];
        const [xj, yj] = poly[j];
        if (
          yi > p[1] !== yj > p[1] &&
          p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi
        ) {
          inside = !inside;
        }
      }
      return inside;
    };
    const waters = (Object.keys(layout) as Exclude<WaterVariant, "full">[]).map(
      (variant) => {
        const [cx, cy] = layout[variant];
        return waterFootprint(variant, A).map(
          ([u, v]) => [u + cx, v + cy] as [number, number]
        );
      }
    );
    const inUnion = (p: [number, number]) =>
      waters.some((w: [number, number][]) => inPoly(p, w));
    // A point on the union's boundary can sit exactly on a footprint edge,
    // so also accept a point nudged a hair toward the center.
    const inOrOnUnion = (p: [number, number]) =>
      inUnion(p) || inUnion([p[0] * 0.98, p[1] * 0.98]);

    // The octagon's 8 corners (axis-parallel sides at the edge midlines,
    // diagonals through the corner-tile edge midpoints).
    const octagonCorners: [number, number][] = [
      [-0.5, 1],
      [0.5, 1],
      [1, 0.5],
      [1, -0.5],
      [0.5, -1],
      [-0.5, -1],
      [-1, -0.5],
      [-1, 0.5],
    ];
    for (const p of octagonCorners) {
      expect(inOrOnUnion(p), `octagon corner ${p}`).toBe(true);
    }
    // A point inside the union (center of the north edge's water half).
    expect(inUnion([0, 0.75])).toBe(true);
    // The dry outer corners and the outer halves of the edge tiles.
    const dryPoints: [number, number][] = [
      [-1.25, 1.25],
      [1.25, 1.25],
      [1.25, -1.25],
      [-1.25, -1.25],
      [-1.25, 0],
      [1.25, 0],
      [0, 1.25],
      [0, -1.25],
    ];
    for (const p of dryPoints) {
      expect(inUnion(p), `dry point ${p}`).toBe(false);
    }
  });

  it("caches geometries per (variant, size)", () => {
    const a = getWaterVariantSlabs("half-s", TILE_SIZE, HALF_H);
    const b = getWaterVariantSlabs("half-s", TILE_SIZE, HALF_H);
    expect(a.water).toBe(b.water);
    expect(a.land).toBe(b.land);
  });

  it("splits the water slab side walls at the top face's boundary vertices", () => {
    // The water slab's side walls must share their top edge with the
    // subdivided top face (the shader displaces both), so for every variant
    // each footprint edge gets one wall segment per boundary vertex span:
    // sum over edges of (vertices - 1) == total boundary vertices - edges.
    for (const variant of PARTIALS) {
      const slabs = getWaterVariantSlabs(variant, TILE_SIZE, HALF_H);
      const positions =
        slabs.water!.attributes["position"].array as Float32Array;

      // A wall triangle spans both -halfH and +halfH (its two per-segment
      // triangles are (2 bottom, 1 top) and (1 bottom, 2 top)); the top face
      // sits entirely at +halfH and the bottom fan entirely at -halfH, so a
      // triangle touching both levels is a wall segment triangle.
      let wallTriangles = 0;
      for (let i = 0; i < positions.length; i += 9) {
        const ys = [positions[i + 1], positions[i + 4], positions[i + 7]];
        const bottom = ys.filter((y) => Math.abs(y + HALF_H) < 1e-4).length;
        const top = ys.filter((y) => Math.abs(y - HALF_H) < 1e-4).length;
        if (bottom + top === 3 && bottom >= 1 && top >= 1) wallTriangles += 1;
      }

      const footprint = waterFootprint(variant, A);
      const splits = topBoundaryVertices(footprint, TILE_SIZE);
      const expectedSegments = splits.reduce(
        (sum, edge) => sum + (edge.length - 1),
        0
      );
      expect(wallTriangles, `wall segments for ${variant}`).toBe(
        expectedSegments * 2
      );

      // And the split points must land on the footprint edge (on the grid
      // lines within the edge), so the wall's top edge follows the boundary.
      for (const edge of splits) {
        for (const p of edge) {
          expect(Math.abs(p[0])).toBeLessThanOrEqual(A + 1e-6);
          expect(Math.abs(p[1])).toBeLessThanOrEqual(A + 1e-6);
        }
      }
    }
  });
});
