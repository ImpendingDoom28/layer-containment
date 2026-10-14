import {
  FC,
  Dispatch,
  memo,
  SetStateAction,
  useCallback,
} from "react";

import type { TileOccupancyMasks } from "../../utils/tileOccupancy";
import { Tile } from "./Tile";
import type { TileData } from "../../core/types/utils";
import {
  gameStatusSelector,
  selectedTowerSelector,
  selectedTowerTypeToPlaceSelector,
  setSelectedTowerSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import { TowerType } from "../../core/types/game";

type GridProps = {
  hoveredTile: TileData | null;
  setHoveredTile: Dispatch<SetStateAction<TileData | null>>;
  placeTower: (gridX: number, gridZ: number, towerType: TowerType) => void;
  onTileHover?: (gridX: number, gridZ: number) => void;
  onTileHoverEnd?: () => void;
  occupancy: TileOccupancyMasks;
};

/**
 * The grid is static per level: the water/path occupancy masks arrive from
 * the parent (computed once per level load) and none of the remaining
 * subscriptions mutate per frame, so the grid re-renders solely on hover /
 * selection changes, never on tower shots or enemy kills.
 */
export const Grid: FC<GridProps> = memo(
  ({ hoveredTile, setHoveredTile, placeTower, occupancy }) => {
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

    const handleTileHover = useCallback(
      (gridX: number, gridZ: number) => {
        setHoveredTile({ gridX, gridZ });
      },
      [setHoveredTile]
    );

    const handleTileHoverEnd = useCallback(() => {
      setHoveredTile(null);
    }, [setHoveredTile]);

    return (
      <group name="grid">
        {Array.from({ length: occupancy.gridSize }, (_, gridX) =>
          Array.from({ length: occupancy.gridSize }, (_, gridZ) => {
            const index = gridZ * occupancy.gridSize + gridX;
            const canPlace = canPlaceTower(false);
            const isHovered =
              hoveredTile?.gridX === gridX &&
              hoveredTile?.gridZ === gridZ &&
              selectedTowerTypeToPlace !== null;

            return (
              <Tile
                key={`${gridX}-${gridZ}`}
                gridX={gridX}
                gridZ={gridZ}
                isWater={occupancy.water[index] === 1}
                isOnPath={occupancy.onPath[index] === 1}
                isHovered={isHovered}
                canPlace={canPlace}
                onClick={() => onTileClick(gridX, gridZ)}
                onHover={handleTileHover}
                onHoverEnd={handleTileHoverEnd}
              />
            );
          })
        )}
      </group>
    );
  }
);

Grid.displayName = "Grid";
