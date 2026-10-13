import { FC, memo, useCallback, useMemo } from "react";
import { useQuery } from "koota/react";

import { TowerSystem } from "./TowerSystem";
import { Building } from "../entities/Building";
import { Water } from "../entities/Water";
import { Enemy } from "../entities/Enemy";
import {
  buildingsSelector,
  gridSizeSelector,
  gridOffsetSelector,
  pathWaypointsSelector,
  towersSelector,
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
import { getTilePlacementState as getSharedTilePlacementState } from "../../utils/tilePlacement";
import { Effect } from "../entities/effects/Effect";
import { useInstancedProjectiles } from "../../core/hooks/useInstancedProjectiles";
import { MedicHealPulseSystem } from "./MedicHealPulseSystem";
import { ApplySlowSystem } from "./ApplySlowSystem";
import { EnemyMovementSystem } from "./EnemyMovementSystem";
import {
  pathWidthSelector,
  selectedTowerTypeToPlaceSelector,
  setSelectedTowerSelector,
  setSelectedTowerTypeToPlaceSelector,
  tileSizeSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import { IsEnemy } from "../../core/ecs/traits/enemy";
import { useSimulationClock } from "../../core/hooks/useSimulationClock";

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
    const buildings = useLevelStore(buildingsSelector);
    const waters = useLevelStore(watersSelector);
    const towers = useLevelStore(towersSelector);
    const gridOffset = useLevelStore(gridOffsetSelector);
    const pathWaypoints = useLevelStore(pathWaypointsSelector);
    const tileSize = useGameStore(tileSizeSelector);
    const pathWidth = useGameStore(pathWidthSelector);
    const getSimulationTime = useSimulationClock(shouldStopMovement);

    // Built from stable level data (not `useLevelSystem`, which subscribes to
    // towers/money and would re-render this whole subtree on every shot/kill)
    // so it stays referentially stable while the level is unchanged.
    const getTilePlacementState = useCallback(
      (gridX: number, gridZ: number) => {
        return getSharedTilePlacementState({
          gridX,
          gridZ,
          towers,
          buildings,
          waters,
          gridOffset,
          tileSize,
          pathWaypoints,
          pathWidth,
        });
      },
      [towers, buildings, waters, gridOffset, tileSize, pathWaypoints, pathWidth]
    );

    const { InstancedProjectiles, fireProjectile } = useInstancedProjectiles({
      maxProjectiles: 500,
      maxBeams: 50,
      projectileSize: 0.1,
      getSimulationTime,
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
        <ApplySlowSystem
          shouldStopMovement={shouldStopMovement}
          getSimulationTime={getSimulationTime}
        />

        <EnemyMovementSystem
          shouldStopMovement={shouldStopMovement}
          getSimulationTime={getSimulationTime}
          onEnemyReachEnd={onEnemyReachEnd}
          onEndEffect={onEndEffect}
        />

        <MedicHealPulseSystem
          shouldStopMovement={shouldStopMovement}
          getSimulationTime={getSimulationTime}
        />

        {buildings.map((building) => (
          <Building key={building.id} building={building} />
        ))}

        {waters.map((water) => (
          <Water key={water.id} water={water} />
        ))}

        <group name="enemies">
          {enemyEntities.map((entity) => (
            <Enemy
              key={entity}
              entity={entity}
              getSimulationTime={getSimulationTime}
              shouldStopMovement={shouldStopMovement}
              onSpawnEffect={onSpawnEffect}
            />
          ))}
        </group>

        {InstancedProjectiles}

        <TowerSystem
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
