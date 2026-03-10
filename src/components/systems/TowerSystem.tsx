import { FC, useMemo } from "react";
import { useFrame } from "@react-three/fiber";

import {
  findNearestEnemy,
  findFurthestEnemy,
  distance2D,
  findEnemiesInLine,
} from "../../utils/mathUtils";
import { gameEvents } from "../../utils/eventEmitter";
import type {
  Tower as TowerInstance,
  Enemy,
  Projectile as ProjectileInstance,
  TowerType,
} from "../../core/types/game";
import { Tower } from "../entities/Tower";
import { GUITowerInfoPanel } from "../gui/GUITowerInfoPanel";
import { TileData } from "../../core/types/utils";
import { useGameStore } from "../../core/stores/useGameStore";
import {
  enemiesSelector,
  towersSelector,
  gridOffsetSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import { GameEvent } from "../../core/types/enums/events";

type TowerSystemProps = {
  fireProjectile: (
    projectile: Omit<ProjectileInstance, "id">
  ) => ProjectileInstance;
  updateTower: (towerId: number, updates: Partial<TowerInstance>) => void;
  selectedTower: TowerInstance | null;
  onTowerClick: ((tower: TowerInstance) => void) | null;
  onSellTower: ((towerId: number) => void) | null;
  hoveredTile: TileData | null;
  isOccupiedByBuilding: boolean;
  isOccupiedByTower: boolean;
  isHoveredTileOnPath: boolean;
  selectedTowerType: TowerType | null;
};

export const TowerSystem: FC<TowerSystemProps> = ({
  fireProjectile,
  updateTower,
  selectedTower,
  onTowerClick,
  onSellTower,
  hoveredTile,
  selectedTowerType,
  isOccupiedByBuilding,
  isOccupiedByTower,
  isHoveredTileOnPath,
}) => {
  const { towerTypes, tileSize, towerHeight, gameStatus } = useGameStore();
  const gridOffset = useLevelStore(gridOffsetSelector);
  const towers = useLevelStore(towersSelector);
  const enemies = useLevelStore(enemiesSelector);

  const previewTower = useMemo(() => {
    if (!selectedTowerType || !hoveredTile) return null;

    const towerConfig = towerTypes?.[selectedTowerType];
    if (!towerConfig) return null;

    if (isOccupiedByTower || isOccupiedByBuilding) return null;

    const worldX = gridOffset + hoveredTile.gridX + tileSize / 2;
    const worldZ = gridOffset + hoveredTile.gridZ + tileSize / 2;

    const preview: TowerInstance = {
      ...towerConfig,
      id: -1,
      type: selectedTowerType,
      gridX: hoveredTile.gridX,
      gridZ: hoveredTile.gridZ,
      x: worldX,
      z: worldZ,
      lastFireTime: 0,
    };

    return preview;
  }, [
    selectedTowerType,
    hoveredTile,
    towerTypes,
    isOccupiedByTower,
    isOccupiedByBuilding,
    gridOffset,
    tileSize,
  ]);

  useFrame((state) => {
    if (gameStatus !== "playing" && gameStatus !== "menu") return;

    const currentTime = state.clock.elapsedTime;

    towers.forEach((tower) => {
      const timeSinceLastFire = currentTime - tower.lastFireTime;
      if (timeSinceLastFire < tower.fireRate) return;

      const towerConfig = towerTypes?.[tower.type];
      if (!towerConfig) return;

      let target: Enemy | null = null;

      if (towerConfig.targeting === "furthest") {
        const enemiesInRange = enemies.filter((enemy) => {
          if (enemy.health <= 0) return false;
          const dist = distance2D(tower.x, tower.z, enemy.x, enemy.z);
          return dist <= tower.range;
        });
        target = findFurthestEnemy(enemiesInRange, tower.x, tower.z);
      } else {
        target = findNearestEnemy(enemies, tower.x, tower.z);
        if (
          target &&
          distance2D(tower.x, tower.z, target.x, target.z) > tower.range
        ) {
          target = null;
        }
      }

      if (!target) return;

      let pierceEnemyIds: number[] | undefined;

      if (tower.type === "laser" && tower.maxPierce) {
        const dx = target.x - tower.x;
        const dz = target.z - tower.z;
        const distToTarget = Math.sqrt(dx * dx + dz * dz);

        if (distToTarget > 0) {
          const extendFactor = 1.5;
          const extendedX =
            tower.x + (dx / distToTarget) * distToTarget * extendFactor;
          const extendedZ =
            tower.z + (dz / distToTarget) * distToTarget * extendFactor;

          const enemiesInLine = findEnemiesInLine(
            enemies,
            tower.x,
            tower.z,
            extendedX,
            extendedZ,
            tower.maxPierce
          );

          if (enemiesInLine.length === 0) return;

          target = enemiesInLine[enemiesInLine.length - 1];
          pierceEnemyIds = enemiesInLine.map((e) => e.id);
        }
      }

      const projectileData: Omit<ProjectileInstance, "id"> = {
        towerId: tower.id,
        towerType: tower.type,
        startX: tower.x,
        startY: tower.type === "laser" ? towerHeight * 0.5 : towerHeight * 0.7,
        startZ: tower.z,
        damage: tower.damage,
        speed: tower.projectileSpeed,
        range: tower.range,
        color: tower.color,
        slowAmount: tower.slowAmount,
        slowDuration: tower.slowDuration,
        aoeRadius: tower.aoeRadius,
        maxPierce: tower.maxPierce,
        projectileType: tower.projectileType,
        targetX: target.x,
        targetY: target.size / 2,
        targetZ: target.z,
        targetId: target.id,
        pierceEnemyIds: pierceEnemyIds,
      };

      fireProjectile(projectileData);
      gameEvents.emit(GameEvent.TOWER_FIRE, {
        towerId: tower.id,
        towerType: tower.type,
      });

      updateTower(tower.id, { lastFireTime: currentTime });
    });
  });

  return (
    <>
      {towers.map((tower) => (
        <Tower
          key={tower.id}
          tower={tower}
          isSelected={selectedTower?.id === tower.id}
          onClick={() => onTowerClick?.(tower)}
        />
      ))}

      {previewTower && (
        <Tower
          key="preview"
          tower={previewTower}
          isPreview={true}
          isInvalidPlacement={isHoveredTileOnPath}
        />
      )}

      {selectedTower && (
        <GUITowerInfoPanel
          tower={selectedTower}
          onSell={() => onSellTower?.(selectedTower.id)}
        />
      )}
    </>
  );
};
