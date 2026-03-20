import { FC, useMemo } from "react";

import { TowerSystem } from "./TowerSystem";
import { Building } from "../entities/Building";
import { Enemy } from "../entities/Enemy";
import { useLevelSystem } from "../../core/hooks/useLevelSystem";
import {
  buildingsSelector,
  enemiesSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import type {
  Tower as TowerInstance,
  Enemy as EnemyInstance,
  Projectile as ProjectileInstance,
  TowerType,
  ActiveEffect,
} from "../../core/types/game";
import type { TileData } from "../../core/types/utils";
import type { TilePlacementState } from "../../utils/tilePlacement";
import { Effect } from "../entities/effects/Effect";
import { useInstancedProjectiles } from "../../core/hooks/useInstancedProjectiles";

type EntitiesSystemProps = {
  activeEffects: ActiveEffect[];
  onEffectComplete: (effectId: number) => void;
  onTowerClick: ((tower: TowerInstance) => void) | null;
  onEnemyReachEnd: ((enemyId: number) => void) | null;
  onEnemyUpdate:
    | ((enemyId: number, updates: Partial<EnemyInstance>) => void)
    | null;
  onProjectileHit: (
    projectile: ProjectileInstance,
    targetEnemy: EnemyInstance,
    currentTime: number
  ) => void;
  onProjectileRemove: (projectileId: number) => void;
  onSellTower: ((towerId: number) => void) | null;
  hoveredTile: TileData | null;
  selectedTower: TowerInstance | null;
  selectedTowerType: TowerType | null;
  onSpawnEffect: (position: [number, number, number], color: string) => void;
  onEndEffect: (position: [number, number, number], color: string) => void;
  shouldStopMovement: boolean;
};

export const EntitiesSystem: FC<EntitiesSystemProps> = ({
  onTowerClick,
  onEnemyReachEnd,
  onEnemyUpdate,
  onProjectileHit,
  onProjectileRemove,
  onSellTower,
  hoveredTile,
  selectedTower,
  selectedTowerType,
  onSpawnEffect,
  onEndEffect,
  onEffectComplete,
  activeEffects,
  shouldStopMovement,
}) => {
  const levelSystem = useLevelSystem();
  const buildings = useLevelStore(buildingsSelector);
  const enemies = useLevelStore(enemiesSelector);
  const { getTilePlacementState, updateTower } = levelSystem;

  const { InstancedProjectiles, fireProjectile } = useInstancedProjectiles({
    maxProjectiles: 500,
    maxBeams: 50,
    projectileSize: 0.1,
    enemies,
    onHit: onProjectileHit,
    onRemove: onProjectileRemove,
    isPaused: shouldStopMovement,
  });

  const enemiesToRender = useMemo(() => {
    return enemies.filter((enemy) => enemy.health > 0);
  }, [enemies]);

  const hoveredTilePlacementState = useMemo<TilePlacementState | null>(() => {
    if (!hoveredTile) return null;

    return getTilePlacementState(hoveredTile.gridX, hoveredTile.gridZ);
  }, [getTilePlacementState, hoveredTile]);

  return (
    <>
      {buildings.map((building) => (
        <Building key={building.id} building={building} />
      ))}

      {enemiesToRender.map((enemy) => (
        <Enemy
          key={enemy.id}
          enemy={enemy}
          onReachEnd={onEnemyReachEnd}
          onUpdate={onEnemyUpdate}
          onSpawnEffect={onSpawnEffect}
          onEndEffect={onEndEffect}
          shouldStopMovement={shouldStopMovement}
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
        selectedTowerType={selectedTowerType}
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
};
