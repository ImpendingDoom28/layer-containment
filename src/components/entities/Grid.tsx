import {
  FC,
  Dispatch,
  memo,
  SetStateAction,
  useCallback,
  useMemo,
} from "react";

import { Tile } from "./Tile";
import type { TileData } from "../../core/types/utils";
import {
  gridOffsetSelector,
  gridSizeSelector,
  pathWaypointsSelector,
  useLevelStore,
  watersSelector,
} from "../../core/stores/useLevelStore";
import {
  gameStatusSelector,
  pathWidthSelector,
  selectedTowerSelector,
  selectedTowerTypeToPlaceSelector,
  setSelectedTowerSelector,
  tileSizeSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import { isGridTileOnPath } from "../../utils/pathUtils";
import { TowerType } from "../../core/types/game";

type GridProps = {
  hoveredTile: TileData | null;
  setHoveredTile: Dispatch<SetStateAction<TileData | null>>;
  placeTower: (gridX: number, gridZ: number, towerType: TowerType) => void;
  onTileHover?: (gridX: number, gridZ: number) => void;
  onTileHoverEnd?: () => void;
};

type GridTileData = {
  gridX: number;
  gridZ: number;
  isWater: boolean;
  isOnPath: boolean;
};

/**
 * The grid is static per level: water and path occupancy depend only on the
 * level data (path geometry, water bodies), never on towers or the
 * simulation. Subscribing here to the per-frame-mutated state (towers,
 * money, active effects via the parent) is what turned every tower shot and
 * enemy kill into a 4096-tile re-render; with only static subscriptions the
 * grid re-renders solely on hover / selection changes.
 */
export const Grid: FC<GridProps> = memo(
  ({ hoveredTile, setHoveredTile, placeTower }) => {
    const selectedTowerTypeToPlace = useGameStore(
      selectedTowerTypeToPlaceSelector
    );
    const gridSize = useLevelStore(gridSizeSelector);
    const waters = useLevelStore(watersSelector);
    const gridOffset = useLevelStore(gridOffsetSelector);
    const pathWaypoints = useLevelStore(pathWaypointsSelector);
    const gameStatus = useGameStore(gameStatusSelector);
    const selectedTower = useGameStore(selectedTowerSelector);
    const setSelectedTower = useGameStore(setSelectedTowerSelector);
    const tileSize = useGameStore(tileSizeSelector);
    const pathWidth = useGameStore(pathWidthSelector);

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

    const tiles = useMemo<GridTileData[]>(() => {
      const tileArray: GridTileData[] = [];
      for (let x = 0; x < gridSize; x++) {
        for (let z = 0; z < gridSize; z++) {
          const isWater = waters.some(
            (w) => w.gridX === x && w.gridZ === z
          );
          const isOnPath = isGridTileOnPath(
            x,
            z,
            gridOffset,
            tileSize,
            pathWaypoints,
            pathWidth
          );
          tileArray.push({ gridX: x, gridZ: z, isWater, isOnPath });
        }
      }
      return tileArray;
    }, [
      gridSize,
      waters,
      gridOffset,
      tileSize,
      pathWaypoints,
      pathWidth,
    ]);

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
        {tiles.map(({ gridX, gridZ, isWater, isOnPath }) => {
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
              isWater={isWater}
              isOnPath={isOnPath}
              isHovered={isHovered}
              canPlace={canPlace}
              onClick={() => onTileClick(gridX, gridZ)}
              onHover={handleTileHover}
              onHoverEnd={handleTileHoverEnd}
            />
          );
        })}
      </group>
    );
  }
);

Grid.displayName = "Grid";
