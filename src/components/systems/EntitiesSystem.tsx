import { FC, memo, useCallback, useMemo } from "react";

import { TowerSystem } from "./TowerSystem";
import { Building } from "../entities/Building";
import {
  buildingsSelector,
  canyonsSelector,
  gridOffsetSelector,
  hoveredTileSelector,
  pathWaypointsSelector,
  towersSelector,
  useLevelStore,
  watersSelector,
} from "../../core/stores/useLevelStore";
import type { Tower as TowerInstance, Tower } from "../../core/types/game";
import type { TilePlacementState } from "../../utils/tilePlacement";
import { getTilePlacementState } from "../../utils/tilePlacement";
import { EffectSystem } from "./EffectSystem";
import {
  pathWidthSelector,
  selectedTowerTypeToPlaceSelector,
  setSelectedTowerSelector,
  setSelectedTowerTypeToPlaceSelector,
  tileSizeSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import { useGameSessionRuntime } from "./GameSessionSystem";
import { EnemySystem } from "./EnemySystem";

type EntitiesSystemProps = {
  onSellTower: ((towerId: number) => void) | null;
  selectedTower: TowerInstance | null;
  /**
   * Whether placed towers play the placement drop on mount (default: yes).
   * Off for scenes whose towers are already deployed (the main menu).
   */
  playPlacementFX?: boolean;
};

export const EntitiesSystem: FC<EntitiesSystemProps> = memo(
  ({ onSellTower, selectedTower, playPlacementFX }) => {
    const { InstancedProjectiles } = useGameSessionRuntime();
    const selectedTowerTypeToPlace = useGameStore(
      selectedTowerTypeToPlaceSelector
    );
    const setSelectedTowerTypeToPlace = useGameStore(
      setSelectedTowerTypeToPlaceSelector
    );
    const setSelectedTower = useGameStore(setSelectedTowerSelector);
    const tileSize = useGameStore(tileSizeSelector);
    const pathWidth = useGameStore(pathWidthSelector);

    const buildings = useLevelStore(buildingsSelector);
    const canyons = useLevelStore(canyonsSelector);
    const waters = useLevelStore(watersSelector);
    const towers = useLevelStore(towersSelector);
    const gridOffset = useLevelStore(gridOffsetSelector);
    const pathWaypoints = useLevelStore(pathWaypointsSelector);
    const hoveredTile = useLevelStore(hoveredTileSelector);

    const hoveredTilePlacementState = useMemo<TilePlacementState | null>(() => {
      if (!hoveredTile) return null;
      return getTilePlacementState({
        gridX: hoveredTile.gridX,
        gridZ: hoveredTile.gridZ,
        towers,
        buildings,
        waters,
        canyons,
        gridOffset,
        tileSize,
        pathWaypoints,
        pathWidth,
      });
    }, [
      hoveredTile?.gridX,
      hoveredTile?.gridZ,
      towers,
      buildings,
      waters,
      canyons,
      gridOffset,
      tileSize,
      pathWaypoints,
      pathWidth,
    ]);

    const onTowerClick = useCallback(
      (tower: Tower) => {
        if (selectedTower?.id === tower.id) {
          setSelectedTower(null);
        } else {
          setSelectedTower(tower);
          setSelectedTowerTypeToPlace(null);
        }
      },
      [selectedTower, setSelectedTower, setSelectedTowerTypeToPlace]
    );

    return (
      <>
        {buildings.map((building) => (
          <Building key={building.id} building={building} />
        ))}

        <EnemySystem />

        {InstancedProjectiles}

        <TowerSystem
          onSellTower={onSellTower}
          hoveredTile={hoveredTile}
          onTowerClick={onTowerClick}
          selectedTower={selectedTower}
          selectedTowerType={selectedTowerTypeToPlace}
          hoveredTilePlacementState={hoveredTilePlacementState}
          playPlacementFX={playPlacementFX}
        />

        <EffectSystem />
      </>
    );
  }
);

EntitiesSystem.displayName = "EntitiesSystem";
