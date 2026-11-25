import type { PathWaypoint, WaterVariant } from "../core/types/game";
import { isGridTileOnPath } from "./pathUtils";

/**
 * Fixed order of water footprints; the array index is the `waterVariant` mask
 * code (0 = `full`, the plain full-tile water). Keeping one order here and in
 * `getWaterVariantSlabs`'s footprints means a mask code maps straight to the
 * matching geometry.
 */
export const WATER_VARIANTS: WaterVariant[] = [
  "full",
  "half-n",
  "half-e",
  "half-s",
  "half-w",
  "corner-nw",
  "corner-ne",
  "corner-se",
  "corner-sw",
];

export const waterVariantCode = (variant: WaterVariant): number =>
  WATER_VARIANTS.indexOf(variant);

/**
 * Per-tile path/water/canyon occupancy for a level, as flat bitmask arrays.
 *
 * `water`, `canyon`, and `onPath` are indexed by `gridZ * gridSize + gridX`
 * (1 = occupied, 0 = free). `waterVariant` stores each water tile's footprint
 * code (`WATER_VARIANTS` index; 0 = full), so `Tile` can draw partial
 * water/land slabs for the 9-tile scheme. Both `Grid` and
 * `PlanetTileDecorations` need exactly this information for every tile;
 * hoisting the computation to a single memo (see `useTileOccupancyMasks`)
 * lets them share one pass over the level data instead of each running their
 * own grid loop.
 */
export type TileOccupancyMasks = {
  gridSize: number;
  water: Uint8Array;
  waterVariant: Uint8Array;
  canyon: Uint8Array;
  onPath: Uint8Array;
};

export type TileOccupancyParams = {
  gridSize: number;
  gridOffset: number;
  tileSize: number;
  pathWaypoints: PathWaypoint[][];
  pathWidth: number;
  waters: { gridX: number; gridZ: number; variant?: WaterVariant }[];
  canyons: { gridX: number; gridZ: number }[];
};

/**
 * Build the occupancy masks once for a level.
 *
 * The path test is expensive per tile on first touch (O(waypoints * segments))
 * but is WeakMap-cached by `isGridTileOnPath` on the `pathWaypoints` array
 * identity, so a level reload (new array) rebuilds the cache and the masks
 * are computed once per level load, never per frame. Water uses a direct
 * index write (O(1) per body) instead of an O(waters) `Array.some` per tile.
 */
export const computeTileOccupancyMasks = (
  params: TileOccupancyParams
): TileOccupancyMasks => {
  const {
    gridSize,
    gridOffset,
    tileSize,
    pathWaypoints,
    pathWidth,
    waters,
    canyons,
  } = params;
  const size = gridSize * gridSize;
  const water = new Uint8Array(size);
  const waterVariant = new Uint8Array(size);
  const canyon = new Uint8Array(size);
  const onPath = new Uint8Array(size);

  for (const w of waters) {
    const idx = w.gridZ * gridSize + w.gridX;
    if (idx >= 0 && idx < size) {
      water[idx] = 1;
      waterVariant[idx] = waterVariantCode(w.variant ?? "full");
    }
  }

  for (const c of canyons) {
    const idx = c.gridZ * gridSize + c.gridX;
    if (idx >= 0 && idx < size) canyon[idx] = 1;
  }

  for (let gridX = 0; gridX < gridSize; gridX += 1) {
    for (let gridZ = 0; gridZ < gridSize; gridZ += 1) {
      if (
        isGridTileOnPath(
          pathWaypoints,
          gridX,
          gridZ,
          gridOffset,
          tileSize,
          pathWidth
        )
      ) {
        onPath[gridZ * gridSize + gridX] = 1;
      }
    }
  }

  return { gridSize, water, waterVariant, canyon, onPath };
};
