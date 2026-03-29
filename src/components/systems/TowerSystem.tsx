import { FC, memo, useMemo } from "react";
import { useFrame } from "@react-three/fiber";

import {
  findNearestEnemy,
  findFurthestEnemy,
  distance2D,
  findEnemiesInLine,
} from "../../utils/mathUtils";
import { computeChainAdditionalHits } from "../../core/chainLightning";
import { getEffectiveTowerCombatStats } from "../../core/relayBuffs";
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
  gridSizeSelector,
  towersSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import { tileToWorldCoordinate } from "../../utils/levelEditor";
import { GameEvent } from "../../core/types/enums/events";
import type { TilePlacementState } from "../../utils/tilePlacement";
import { getShouldStopMovement } from "../../core/getShouldStopMovement";

type TowerSystemProps = {
  fireProjectile: (
    projectile: Omit<ProjectileInstance, "id">
  ) => ProjectileInstance;
  updateTower: (towerId: number, updates: Partial<TowerInstance>) => void;
  selectedTower: TowerInstance | null;
  onTowerClick: ((tower: TowerInstance) => void) | null;
  onSellTower: ((towerId: number) => void) | null;
  hoveredTile: TileData | null;
  hoveredTilePlacementState: TilePlacementState | null;
  selectedTowerType: TowerType | null;
};

export const TowerSystem: FC<TowerSystemProps> = memo(
  ({
    fireProjectile,
    updateTower,
    selectedTower,
    onTowerClick,
    onSellTower,
    hoveredTile,
    selectedTowerType,
    hoveredTilePlacementState,
  }) => {
    const { towerTypes, tileSize, towerHeight } = useGameStore();
    const gridSize = useLevelStore(gridSizeSelector);
    const towers = useLevelStore(towersSelector);
    const enemies = useLevelStore(enemiesSelector);

    const combatStatsByTowerId = useMemo(() => {
      const map = new Map<number, { damage: number; range: number }>();
      if (!towerTypes) return map;
      for (const t of towers) {
        map.set(t.id, getEffectiveTowerCombatStats(t, towers, towerTypes));
      }
      return map;
    }, [towers, towerTypes]);

    const previewTower = useMemo(() => {
      if (!selectedTowerType || !hoveredTile) return null;

      const towerConfig = towerTypes?.[selectedTowerType];
      if (!towerConfig) return null;

      if (!hoveredTilePlacementState || hoveredTilePlacementState.isBlocked) {
        return null;
      }

      const worldX = tileToWorldCoordinate(
        hoveredTile.gridX,
        gridSize,
        tileSize
      );
      const worldZ = tileToWorldCoordinate(
        hoveredTile.gridZ,
        gridSize,
        tileSize
      );

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
      hoveredTilePlacementState,
      gridSize,
      tileSize,
    ]);

    useFrame((state) => {
      const { gameStatus, isPageVisible } = useGameStore.getState();
      if (getShouldStopMovement(gameStatus, isPageVisible)) return;
      if (gameStatus !== "playing" && gameStatus !== "menu") return;

      const currentTime = state.clock.elapsedTime;

      towers.forEach((tower) => {
        if (tower.type === "relay") return;

        const timeSinceLastFire = currentTime - tower.lastFireTime;
        if (timeSinceLastFire < tower.fireRate) return;

        const towerConfig = towerTypes?.[tower.type];
        if (!towerConfig) return;

        const eff = getEffectiveTowerCombatStats(
          tower,
          towers,
          towerTypes ?? {}
        );

        let target: Enemy | null = null;

        if (towerConfig.targeting === "furthest") {
          const enemiesInRange = enemies.filter((enemy) => {
            if (enemy.health <= 0) return false;
            const dist = distance2D(tower.x, tower.z, enemy.x, enemy.z);
            return dist <= eff.range;
          });
          target = findFurthestEnemy(enemiesInRange, tower.x, tower.z);
        } else {
          target = findNearestEnemy(enemies, tower.x, tower.z);
          if (
            target &&
            distance2D(tower.x, tower.z, target.x, target.z) > eff.range
          ) {
            target = null;
          }
        }

        if (!target) return;

        let pierceEnemyIds: number[] | undefined;
        let chainAdditionalHits:
          | Array<{ enemyId: number; damage: number }>
          | undefined;

        if (tower.type === "chain") {
          const maxHops = tower.maxChainHops ?? 3;
          const mult = tower.chainDamageMultiplierPerHop ?? 0.85;
          chainAdditionalHits = computeChainAdditionalHits(
            tower,
            enemies,
            target,
            eff.damage,
            eff.range,
            maxHops,
            mult
          );
        }

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
          startY:
            tower.type === "laser" ? towerHeight * 0.5 : towerHeight * 0.7,
          startZ: tower.z,
          damage: eff.damage,
          speed: tower.projectileSpeed,
          range: eff.range,
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
          chainAdditionalHits,
        };

        const fired = fireProjectile(projectileData);
        if (fired.id <= 0) return;

        const emitterY =
          tower.type === "laser" ? towerHeight * 0.5 : towerHeight * 0.7;
        gameEvents.emit(GameEvent.TOWER_FIRE, {
          towerId: tower.id,
          towerType: tower.type,
          worldPosition: {
            x: tower.x,
            y: emitterY,
            z: tower.z,
          },
        });

        updateTower(tower.id, { lastFireTime: currentTime });
      });
    });

    return (
      <>
        {towers.map((tower) => {
          const eff = combatStatsByTowerId.get(tower.id) ?? {
            damage: tower.damage,
            range: tower.range,
          };
          return (
            <Tower
              key={tower.id}
              tower={tower}
              effectiveRange={eff.range}
              isSelected={selectedTower?.id === tower.id}
              onClick={() => onTowerClick?.(tower)}
            />
          );
        })}

        {previewTower && towerTypes && (
          <Tower
            key="preview"
            tower={previewTower}
            effectiveRange={
              getEffectiveTowerCombatStats(
                previewTower,
                [...towers, previewTower],
                towerTypes
              ).range
            }
            isPreview={true}
            isInvalidPlacement={hoveredTilePlacementState?.isOnPath ?? false}
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
  }
);

TowerSystem.displayName = "TowerSystem";
