import { useMemo } from "react";

import type { PathWaypoint } from "../../types/game";
import {
  computeTileOccupancyMasks,
  type TileOccupancyMasks,
} from "../../../utils/tileOccupancy";

export type TileOccupancyInputs = {
  gridSize: number;
  gridOffset: number;
  tileSize: number;
  pathWaypoints: PathWaypoint[][];
  pathWidth: number;
  waters: { gridX: number; gridZ: number }[];
};

/**
 * Per-tile path/water occupancy masks, computed once per level load and shared
 * by `Grid` and `PlanetTileDecorations` through their parents.
 *
 * The inputs are level data only — none of them mutate during play — so the
 * memo rebuilds only when a level (re)loads. Passing a stable object keeps
 * the `memo`-ized children from re-rendering on unrelated state changes. The
 * caller supplies the values (GameScene reads the level store; the level
 * editor supplies its draft) so the same masks work in both scenes.
 */
export const useTileOccupancyMasks = (
  inputs: TileOccupancyInputs
): TileOccupancyMasks => {
  const { gridSize, gridOffset, tileSize, pathWaypoints, pathWidth, waters } =
    inputs;
  return useMemo(
    () =>
      computeTileOccupancyMasks({
        gridSize,
        gridOffset,
        tileSize,
        pathWaypoints,
        pathWidth,
        waters,
      }),
    [gridSize, gridOffset, tileSize, pathWaypoints, pathWidth, waters]
  );
};
