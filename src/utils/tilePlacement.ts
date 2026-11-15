import type {
  Building,
  PathWaypoint,
  Tower,
  WaterBodyConfig,
} from "../core/types/game";

import { isGridTileOnPath } from "./pathUtils";

export type TilePlacementState = {
  isOccupiedByTower: boolean;
  isOccupiedByBuilding: boolean;
  isOnPath: boolean;
  isWater: boolean;
  isCanyon: boolean;
  isBlocked: boolean;
};

type GetTilePlacementStateParams = {
  gridX: number;
  gridZ: number;
  towers: Tower[];
  buildings: Building[];
  waters: WaterBodyConfig[];
  canyons: { gridX: number; gridZ: number }[];
  gridOffset: number;
  tileSize: number;
  pathWaypoints: PathWaypoint[][];
  pathWidth: number;
};

export const getTilePlacementState = ({
  gridX,
  gridZ,
  towers,
  buildings,
  waters,
  canyons,
  gridOffset,
  tileSize,
  pathWaypoints,
  pathWidth,
}: GetTilePlacementStateParams): TilePlacementState => {
  const isOccupiedByTower = towers.some(
    (tower) => tower.gridX === gridX && tower.gridZ === gridZ
  );
  const isOccupiedByBuilding = buildings.some(
    (building) => building.gridX === gridX && building.gridZ === gridZ
  );
  const isOnPath = isGridTileOnPath(
    pathWaypoints,
    gridX,
    gridZ,
    gridOffset,
    tileSize,
    pathWidth
  );
  const isWater = waters.some((w) => w.gridX === gridX && w.gridZ === gridZ);
  const isCanyon = canyons.some(
    (c) => c.gridX === gridX && c.gridZ === gridZ
  );

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
