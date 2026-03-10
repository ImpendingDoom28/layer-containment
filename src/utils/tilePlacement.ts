import type { Building, PathWaypoint, Tower } from "../core/types/game";

import { isGridTileOnPath } from "./pathUtils";

export type TilePlacementState = {
  isOccupiedByTower: boolean;
  isOccupiedByBuilding: boolean;
  isOnPath: boolean;
  isBlocked: boolean;
};

type GetTilePlacementStateParams = {
  gridX: number;
  gridZ: number;
  towers: Tower[];
  buildings: Building[];
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
    gridX,
    gridZ,
    gridOffset,
    tileSize,
    pathWaypoints,
    pathWidth
  );

  return {
    isOccupiedByTower,
    isOccupiedByBuilding,
    isOnPath,
    isBlocked: isOccupiedByTower || isOccupiedByBuilding || isOnPath,
  };
};
