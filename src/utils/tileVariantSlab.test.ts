import { describe, expect, it } from "vitest";

import { getWaterVariantSlabs, type WaterVariantSlabs } from "./tileVariantSlab";
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

  it("caches geometries per (variant, size)", () => {
    const a = getWaterVariantSlabs("half-s", TILE_SIZE, HALF_H);
    const b = getWaterVariantSlabs("half-s", TILE_SIZE, HALF_H);
    expect(a.water).toBe(b.water);
    expect(a.land).toBe(b.land);
  });
});
