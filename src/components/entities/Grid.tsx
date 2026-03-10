import { Dispatch, SetStateAction, useCallback, useMemo } from "react";

import { Tile } from "./Tile";
import type { TowerType } from "../../core/types/game";
import type { TileData } from "../../core/types/utils";
import { useLevelStore } from "../../core/stores/useLevelStore";
import { useLevelSystem } from "../../core/hooks/useLevelSystem";

type GridProps = {
  hoveredTile: TileData | null;
  setHoveredTile: Dispatch<SetStateAction<TileData | null>>;
  selectedTowerType: TowerType | null;
  onTileClick: (gridX: number, gridZ: number) => void;
  onTileHover?: (gridX: number, gridZ: number) => void;
  onTileHoverEnd?: () => void;
};

export const Grid: React.FC<GridProps> = ({
  hoveredTile,
  setHoveredTile,
  selectedTowerType,
  onTileClick,
}) => {
  const { gridSize } = useLevelStore();
  const { getTilePlacementState } = useLevelSystem();

  const tiles = useMemo<TileData[]>(() => {
    const tileArray: TileData[] = [];
    for (let x = 0; x < gridSize; x++) {
      for (let z = 0; z < gridSize; z++) {
        tileArray.push({ gridX: x, gridZ: z });
      }
    }
    return tileArray;
  }, [gridSize]);

  const canPlaceTower = useCallback(
    (isBlocked: boolean) => {
      if (!selectedTowerType) return false;
      if (isBlocked) return false;
      return true;
    },
    [selectedTowerType]
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
    <group>
      {tiles.map(({ gridX, gridZ }) => {
        const placementState = getTilePlacementState(gridX, gridZ);
        const canPlace = canPlaceTower(placementState.isBlocked);
        const isHovered =
          hoveredTile?.gridX === gridX &&
          hoveredTile?.gridZ === gridZ &&
          selectedTowerType !== null;

        return (
          <Tile
            key={`${gridX}-${gridZ}`}
            gridX={gridX}
            gridZ={gridZ}
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
};
