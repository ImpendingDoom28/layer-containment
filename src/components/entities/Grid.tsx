import { FC, memo, useCallback } from "react";

import type { TileOccupancyMasks } from "../../utils/tileOccupancy";
import type { CanyonWorldBBox } from "../../utils/canyonBridges";
import { Tile } from "./Tile";
import { CanyonTile } from "./CanyonTile";
import {
  gameStatusSelector,
  selectedTowerSelector,
  selectedTowerTypeToPlaceSelector,
  setSelectedTowerSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import { TowerType } from "../../core/types/game";

type GridProps = {
  placeTower: (gridX: number, gridZ: number, towerType: TowerType) => void;
  occupancy: TileOccupancyMasks;
  /** The canyon's world bbox (null when the level has no canyons); canyon
      tiles sit at the basin floor derived from it. */
  canyonBBox: CanyonWorldBBox | null;
};

/**
 * The grid is static per level: the water/path occupancy masks arrive from
 * the parent (computed once per level load) and none of the remaining
 * subscriptions mutate per frame, so the grid re-renders solely on hover /
 * selection changes, never on tower shots or enemy kills.
 */
export const Grid: FC<GridProps> = memo(({ placeTower, occupancy, canyonBBox }) => {
  const selectedTowerTypeToPlace = useGameStore(
    selectedTowerTypeToPlaceSelector
  );
  const gameStatus = useGameStore(gameStatusSelector);
  const selectedTower = useGameStore(selectedTowerSelector);
  const setSelectedTower = useGameStore(setSelectedTowerSelector);

  const onTileClick = useCallback(
    (gridX: number, gridZ: number) => {
      if (
        selectedTowerTypeToPlace &&
        (gameStatus === "playing" || gameStatus === "paused")
      ) {
        placeTower(gridX, gridZ, selectedTowerTypeToPlace);
      } else if (selectedTower) {
        setSelectedTower(null);
      }
    },
    [
      selectedTowerTypeToPlace,
      gameStatus,
      selectedTower,
      placeTower,
      setSelectedTower,
    ]
  );

  const canPlaceTower = useCallback(
    (isBlocked: boolean) => {
      if (!selectedTowerTypeToPlace) return false;
      if (isBlocked) return false;
      return true;
    },
    [selectedTowerTypeToPlace]
  );

  return (
    <group name="grid">
      {Array.from({ length: occupancy.gridSize }, (_, gridX) =>
        Array.from({ length: occupancy.gridSize }, (_, gridZ) => {
          const index = gridZ * occupancy.gridSize + gridX;
          const canPlace = canPlaceTower(false);

          if (occupancy.canyon[index] === 1) {
            // A canyon cell implies canyons exist, so the bbox is non-null.
            return (
              <CanyonTile
                key={`${gridX}-${gridZ}`}
                gridX={gridX}
                gridZ={gridZ}
                gridSize={occupancy.gridSize}
                canyonBBox={canyonBBox!}
                isWater={occupancy.water[index] === 1}
                onClick={() => onTileClick(gridX, gridZ)}
              />
            );
          }

          return (
            <Tile
              key={`${gridX}-${gridZ}`}
              gridX={gridX}
              gridZ={gridZ}
              isWater={occupancy.water[index] === 1}
              isOnPath={occupancy.onPath[index] === 1}
              canPlace={canPlace}
              onClick={() => onTileClick(gridX, gridZ)}
            />
          );
        })
      )}
    </group>
  );
});

Grid.displayName = "Grid";
