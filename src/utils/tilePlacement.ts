import type {
  Building,
  PathWaypoint,
  Tower,
  WaterVariant,
} from "../core/types/game";
import {
  computeTileOccupancyMasks,
  type TileOccupancyMasks,
} from "./tileOccupancy";

export type TilePlacementState = {
  isOccupiedByTower: boolean;
  isOccupiedByBuilding: boolean;
  isOnPath: boolean;
  isWater: boolean;
  isCanyon: boolean;
  isBlocked: boolean;
};

/**
 * Precomputed static blockage for one level: the tiles permanently taken by
 * paths, water, canyons and buildings (none of which mutate during play).
 *
 * Each mask is a flat `Uint8Array` indexed by `gridZ * gridSize + gridX`, so a
 * per-tile placement check is an O(1) lookup instead of re-running the
 * expensive path intersection (and the `Array.some` scans) for every tile —
 * which is what `PlacementHighlightOverlay` used to do for the whole grid on
 * every render. The masks themselves are built once per level load
 * (`initializeLevelState`), sharing the `isGridTileOnPath` WeakMap cache the
 * scene's occupancy masks already rely on.
 */
export type TileBlockage = TileOccupancyMasks & {
  building: Uint8Array;
};

type TileBlockageInputs = {
  gridSize: number;
  gridOffset: number;
  tileSize: number;
  pathWaypoints: PathWaypoint[][];
  pathWidth: number;
  buildings: Building[];
  waters: { gridX: number; gridZ: number; variant?: WaterVariant }[];
  canyons: { gridX: number; gridZ: number }[];
};

export const createTileBlockage = (
  inputs: TileBlockageInputs
): TileBlockage => {
  const { gridSize, buildings, ...masksInputs } = inputs;
  const { water, waterVariant, canyon, onPath } = computeTileOccupancyMasks({
    ...masksInputs,
    gridSize,
  });

  const building = new Uint8Array(gridSize * gridSize);
  for (const b of buildings) {
    const idx = b.gridZ * gridSize + b.gridX;
    if (idx >= 0 && idx < building.length) building[idx] = 1;
  }

  return { gridSize, water, waterVariant, canyon, onPath, building };
};

type GetTilePlacementStateParams = {
  gridX: number;
  gridZ: number;
  blockage: TileBlockage | null;
  towers: Tower[];
};

/**
 * Placement state for a tile: the precomputed static blockage (paths, water,
 * canyons, buildings) plus the dynamic tower occupancy. Pure — the caller
 * supplies both, which keeps it trivially testable without a live store.
 */
export const getTilePlacementState = ({
  gridX,
  gridZ,
  blockage,
  towers,
}: GetTilePlacementStateParams): TilePlacementState => {
  const isOccupiedByTower = towers.some(
    (tower) => tower.gridX === gridX && tower.gridZ === gridZ
  );
  const isOccupiedByBuilding =
    blockage !== null && readMask(blockage.building, blockage, gridX, gridZ);
  const isOnPath =
    blockage !== null && readMask(blockage.onPath, blockage, gridX, gridZ);
  const isWater =
    blockage !== null && readMask(blockage.water, blockage, gridX, gridZ);
  const isCanyon =
    blockage !== null && readMask(blockage.canyon, blockage, gridX, gridZ);

  return {
    isOccupiedByTower,
    isOccupiedByBuilding,
    isOnPath,
    isWater,
    isCanyon,
    isBlocked:
      isOccupiedByTower ||
      isOccupiedByBuilding ||
      isOnPath ||
      isWater ||
      isCanyon,
  };
};

const readMask = (
  mask: Uint8Array,
  blockage: TileBlockage,
  gridX: number,
  gridZ: number
): boolean => {
  const idx = gridZ * blockage.gridSize + gridX;
  return idx >= 0 && idx < mask.length && mask[idx] === 1;
};
