import { FC, useMemo } from "react";

import { TowerSystem } from "./TowerSystem";
import { Building } from "../entities/Building";
import { Enemy } from "../entities/Enemy";
import { useLevelSystem } from "../../core/hooks/useLevelSystem";
import {
  buildingsSelector,
  enemiesSelector,
  gridOffsetSelector,
  pathWaypointsSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import {
  pathWidthSelector,
  tileSizeSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import { isGridTileOnPath } from "../../utils/pathUtils";
import type {
  Tower as TowerInstance,
  Enemy as EnemyInstance,
  Projectile as ProjectileInstance,
  TowerType,
  ActiveEffect,
} from "../../core/types/game";
import type { TileData } from "../../core/types/utils";
import { Effect } from "../entities/Effect";
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
  const gridOffset = useLevelStore(gridOffsetSelector);
  const pathWaypoints = useLevelStore(pathWaypointsSelector);
  const tileSize = useGameStore(tileSizeSelector);
  const pathWidth = useGameStore(pathWidthSelector);
  const { updateTower, isTileOccupiedByBuilding, isTileOccupiedByTower } =
    levelSystem;

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

  const isOccupiedByTower = useMemo(() => {
    return isTileOccupiedByTower(
      hoveredTile?.gridX ?? 0,
      hoveredTile?.gridZ ?? 0
    );
  }, [isTileOccupiedByTower, hoveredTile]);

  const isOccupiedByBuilding = useMemo(() => {
    return isTileOccupiedByBuilding(
      hoveredTile?.gridX ?? 0,
      hoveredTile?.gridZ ?? 0
    );
  }, [isTileOccupiedByBuilding, hoveredTile]);

  const isHoveredTileOnPath = useMemo(() => {
    if (!hoveredTile) return false;
    return isGridTileOnPath(
      hoveredTile.gridX,
      hoveredTile.gridZ,
      gridOffset,
      tileSize,
      pathWaypoints,
      pathWidth
    );
  }, [hoveredTile, gridOffset, tileSize, pathWaypoints, pathWidth]);

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

      <InstancedProjectiles />

      <TowerSystem
        updateTower={updateTower}
        onSellTower={onSellTower}
        hoveredTile={hoveredTile}
        onTowerClick={onTowerClick}
        fireProjectile={fireProjectile}
        selectedTower={selectedTower}
        selectedTowerType={selectedTowerType}
        isOccupiedByBuilding={isOccupiedByBuilding}
        isOccupiedByTower={isOccupiedByTower}
        isHoveredTileOnPath={isHoveredTileOnPath}
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
