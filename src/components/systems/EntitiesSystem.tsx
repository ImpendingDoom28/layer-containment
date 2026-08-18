import { FC, memo, useCallback, useMemo } from "react";
import { useQuery } from "koota/react";

import { TowerSystem } from "./TowerSystem";
import { Building } from "../entities/Building";
import { Water } from "../entities/Water";
import { Enemy } from "../entities/Enemy";
import { useLevelSystem } from "../../core/hooks/useLevelSystem";
import {
  buildingsSelector,
  useLevelStore,
  watersSelector,
} from "../../core/stores/useLevelStore";
import type {
  Tower as TowerInstance,
  Projectile as ProjectileInstance,
  ActiveEffect,
  Tower,
} from "../../core/types/game";
import type { TileData } from "../../core/types/utils";
import type { TilePlacementState } from "../../utils/tilePlacement";
import { Effect } from "../entities/effects/Effect";
import { useInstancedProjectiles } from "../../core/hooks/useInstancedProjectiles";
import { MedicHealPulseSystem } from "./MedicHealPulseSystem";
import {
  selectedTowerTypeToPlaceSelector,
  setSelectedTowerSelector,
  setSelectedTowerTypeToPlaceSelector,
} from "../../core/stores/useGameStore";
import { useGameStore } from "../../core/stores/useGameStore";
import { IsEnemy } from "../../core/ecs/traits/enemy";

type EntitiesSystemProps = {
  activeEffects: ActiveEffect[];
  onEffectComplete: (effectId: number) => void;
  onEnemyReachEnd: ((enemyId: number) => void) | null;
  onProjectileHit: (
    projectile: ProjectileInstance,
    targetEnemy: import("../../core/types/game").Enemy,
    currentTime: number
  ) => void;
  onProjectileRemove: (projectileId: number) => void;
  onSellTower: ((towerId: number) => void) | null;
  hoveredTile: TileData | null;
  selectedTower: TowerInstance | null;
  onSpawnEffect: (position: [number, number, number], color: string) => void;
  onEndEffect: (position: [number, number, number], color: string) => void;
  shouldStopMovement: boolean;
};

export const EntitiesSystem: FC<EntitiesSystemProps> = memo(
  ({
    onEnemyReachEnd,
    onProjectileHit,
    onProjectileRemove,
    onSellTower,
    hoveredTile,
    selectedTower,
    onSpawnEffect,
    onEndEffect,
    onEffectComplete,
    activeEffects,
    shouldStopMovement,
  }) => {
    const enemyEntities = useQuery(IsEnemy);
    const selectedTowerTypeToPlace = useGameStore(
      selectedTowerTypeToPlaceSelector
    );
    const setSelectedTowerTypeToPlace = useGameStore(
      setSelectedTowerTypeToPlaceSelector
    );
    const setSelectedTower = useGameStore(setSelectedTowerSelector);
    const levelSystem = useLevelSystem();
    const buildings = useLevelStore(buildingsSelector);
    const waters = useLevelStore(watersSelector);
    const { getTilePlacementState, updateTower } = levelSystem;

    const { InstancedProjectiles, fireProjectile } = useInstancedProjectiles({
      maxProjectiles: 500,
      maxBeams: 50,
      projectileSize: 0.1,
      onHit: onProjectileHit,
      onRemove: onProjectileRemove,
    });

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
        <MedicHealPulseSystem shouldStopMovement={shouldStopMovement} />

        {buildings.map((building) => (
          <Building key={building.id} building={building} />
        ))}

        {waters.map((water) => (
          <Water key={water.id} water={water} />
        ))}

        {enemyEntities.map((entity) => (
          <Enemy
            key={entity}
            entity={entity}
            onReachEnd={onEnemyReachEnd}
            onSpawnEffect={onSpawnEffect}
            onEndEffect={onEndEffect}
          />
        ))}

        {InstancedProjectiles}

        <TowerSystem
          updateTower={updateTower}
          onSellTower={onSellTower}
          hoveredTile={hoveredTile}
          onTowerClick={onTowerClick}
          fireProjectile={fireProjectile}
          selectedTower={selectedTower}
          selectedTowerType={selectedTowerTypeToPlace}
          hoveredTilePlacementState={hoveredTilePlacementState}
        />

        {activeEffects.map((effect) => (
          <Effect
            key={effect.id}
            position={effect.position}
            color={effect.color}
            duration={effect.type === "spawn" ? 0.4 : 0.5}
            onComplete={() => onEffectComplete(effect.id)}
          />
        ))}
      </>
    );
  }
);

EntitiesSystem.displayName = "EntitiesSystem";
