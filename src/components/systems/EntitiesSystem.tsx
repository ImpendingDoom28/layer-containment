import { FC, memo, useCallback } from "react";

import { TowerSystem } from "./TowerSystem";
import { Building } from "../entities/Building";
import {
  buildingsSelector,
  hoveredTileSelector,
  tileBlockageSelector,
  towersSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import type { Tower as TowerInstance, Tower } from "../../core/types/game";
import { getTilePlacementState } from "../../utils/tilePlacement";
import { EffectSystem } from "./EffectSystem";
import {
  selectedTowerTypeToPlaceSelector,
  setSelectedTowerSelector,
  setSelectedTowerTypeToPlaceSelector,
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

    const buildings = useLevelStore(buildingsSelector);
    const towers = useLevelStore(towersSelector);
    const hoveredTile = useLevelStore(hoveredTileSelector);
    const tileBlockage = useLevelStore(tileBlockageSelector);

    // Static blockage is precomputed per level load; only the tower check is
    // dynamic, so this is an O(1) mask read plus a small tower scan.
    const hoveredTilePlacementState = hoveredTile
      ? getTilePlacementState({
          gridX: hoveredTile.gridX,
          gridZ: hoveredTile.gridZ,
          blockage: tileBlockage,
          towers,
        })
      : null;

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
