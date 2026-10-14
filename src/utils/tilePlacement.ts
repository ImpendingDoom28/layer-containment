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
  isBlocked: boolean;
};

type GetTilePlacementStateParams = {
  gridX: number;
  gridZ: number;
  towers: Tower[];
  buildings: Building[];
  waters: WaterBodyConfig[];
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

  return {
    isOccupiedByTower,
    isOccupiedByBuilding,
    isOnPath,
    isWater,
    isBlocked: isOccupiedByTower || isOccupiedByBuilding || isOnPath || isWater,
  };
};
