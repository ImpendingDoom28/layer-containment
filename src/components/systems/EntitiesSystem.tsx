import { FC, memo, useCallback, useMemo } from "react";
import { useQuery } from "koota/react";

import { TowerSystem } from "./TowerSystem";
import { Building } from "../entities/Building";
import { Water } from "../entities/Water";
import { Enemy } from "../entities/Enemy";
import {
  buildingsSelector,
  gridOffsetSelector,
  pathWaypointsSelector,
  towersSelector,
  useLevelStore,
  watersSelector,
} from "../../core/stores/useLevelStore";
import type { Tower as TowerInstance, Tower } from "../../core/types/game";
import type { TileData } from "../../core/types/utils";
import type { TilePlacementState } from "../../utils/tilePlacement";
import { getTilePlacementState as getSharedTilePlacementState } from "../../utils/tilePlacement";
import { EffectSystem } from "./EffectSystem";
import {
  pathWidthSelector,
  selectedTowerTypeToPlaceSelector,
  setSelectedTowerSelector,
  setSelectedTowerTypeToPlaceSelector,
  tileSizeSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import { IsEnemy } from "../../core/ecs/traits/enemy";
import { useGameSessionRuntime } from "./GameSessionSystem";

type EntitiesSystemProps = {
  onSellTower: ((towerId: number) => void) | null;
  hoveredTile: TileData | null;
  selectedTower: TowerInstance | null;
};

export const EntitiesSystem: FC<EntitiesSystemProps> = memo(
  ({ onSellTower, hoveredTile, selectedTower }) => {
    const enemyEntities = useQuery(IsEnemy);
    const { InstancedProjectiles } = useGameSessionRuntime();
    const selectedTowerTypeToPlace = useGameStore(
      selectedTowerTypeToPlaceSelector
    );
    const setSelectedTowerTypeToPlace = useGameStore(
      setSelectedTowerTypeToPlaceSelector
    );
    const setSelectedTower = useGameStore(setSelectedTowerSelector);
    const buildings = useLevelStore(buildingsSelector);
    const waters = useLevelStore(watersSelector);
    const towers = useLevelStore(towersSelector);
    const gridOffset = useLevelStore(gridOffsetSelector);
    const pathWaypoints = useLevelStore(pathWaypointsSelector);
    const tileSize = useGameStore(tileSizeSelector);
    const pathWidth = useGameStore(pathWidthSelector);

    const getTilePlacementState = useCallback(
      (gridX: number, gridZ: number) =>
        getSharedTilePlacementState({
          gridX,
          gridZ,
          towers,
          buildings,
          waters,
          gridOffset,
          tileSize,
          pathWaypoints,
          pathWidth,
        }),
      [
        towers,
        buildings,
        waters,
        gridOffset,
        tileSize,
        pathWaypoints,
        pathWidth,
      ]
    );

    const hoveredTilePlacementState = useMemo<TilePlacementState | null>(() => {
      if (!hoveredTile) return null;
      return getTilePlacementState(hoveredTile.gridX, hoveredTile.gridZ);
    }, [getTilePlacementState, hoveredTile]);

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

        {waters.map((water) => (
          <Water key={water.id} water={water} />
        ))}

        <group name="enemies">
          {enemyEntities.map((entity) => (
            <Enemy key={entity} entity={entity} />
          ))}
        </group>

        {InstancedProjectiles}

        <TowerSystem
          onSellTower={onSellTower}
          hoveredTile={hoveredTile}
          onTowerClick={onTowerClick}
          selectedTower={selectedTower}
          selectedTowerType={selectedTowerTypeToPlace}
          hoveredTilePlacementState={hoveredTilePlacementState}
        />

        <EffectSystem />
      </>
    );
  }
);

EntitiesSystem.displayName = "EntitiesSystem";
