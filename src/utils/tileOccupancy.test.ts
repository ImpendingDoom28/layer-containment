import { describe, expect, it } from "vitest";

import type { WaterVariant } from "../core/types/game";
import {
  computeTileOccupancyMasks,
  waterVariantCode,
  WATER_VARIANTS,
} from "./tileOccupancy";

const GRID = 4;
const OFFSET = -(GRID / 2);

describe("waterVariantCode", () => {
  it("is the fixed index into WATER_VARIANTS", () => {
    expect(WATER_VARIANTS.length).toBe(9);
    expect(WATER_VARIANTS[0]).toBe("full");
    expect(waterVariantCode("full")).toBe(0);
    expect(waterVariantCode("half-n")).toBe(1);
    expect(waterVariantCode("corner-se")).toBe(7);
    expect(waterVariantCode("corner-sw")).toBe(8);
    for (const variant of WATER_VARIANTS) {
      expect(WATER_VARIANTS[waterVariantCode(variant)]).toBe(variant);
    }
  });
});

describe("computeTileOccupancyMasks waterVariant", () => {
  const make = (
    waters: { gridX: number; gridZ: number; variant?: WaterVariant }[]
  ) =>
    computeTileOccupancyMasks({
      gridSize: GRID,
      gridOffset: OFFSET,
      tileSize: 1,
      pathWaypoints: [],
      pathWidth: 1,
      waters,
      canyons: [],
    });

  it("marks a partial water tile as water and records its variant code", () => {
    const masks = make([{ gridX: 1, gridZ: 2, variant: "half-e" }]);
    const idx = 2 * GRID + 1;
    expect(masks.water[idx]).toBe(1);
    expect(masks.waterVariant[idx]).toBe(waterVariantCode("half-e"));
    // A neighbouring tile is neither water nor a variant.
    const other = 0 * GRID + 3;
    expect(masks.water[other]).toBe(0);
    expect(masks.waterVariant[other]).toBe(0);
  });

  it("defaults a water tile without an explicit variant to the full code (0)", () => {
    const masks = make([{ gridX: 3, gridZ: 3 }]);
    const idx = 3 * GRID + 3;
    expect(masks.water[idx]).toBe(1);
    expect(masks.waterVariant[idx]).toBe(0);
  });

  it("marks an explicit full-tile water as water with code 0", () => {
    const masks = make([{ gridX: 0, gridZ: 0, variant: "full" }]);
    expect(masks.water[0]).toBe(1);
    expect(masks.waterVariant[0]).toBe(0);
  });
});
