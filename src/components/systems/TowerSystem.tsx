import { FC, memo, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useWorld } from "koota/react";

import {
  findNearestEnemy,
  findFurthestEnemy,
  distance2D,
  findEnemiesInLine,
  findEnemiesInRange,
} from "../../utils/mathUtils";
import { computeChainAdditionalHits } from "../../core/ecs/systems/chainLightningSystem";
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
import {
  tileSizeSelector,
  towerHeightSelector,
  towerTypesSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import {
  gridSizeSelector,
  isLevelConfigLoadedSelector,
  pathWaypointsSelector,
  towersSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import { getLivingEnemyList } from "../../core/ecs/selectors/enemySnapshots";
import { tileToWorldCoordinate } from "../../utils/levelEditor";
import {
  flatCombatPointToWorldPosition,
  getPlanetRadius,
} from "../../utils/planetSurfaceMapping";
import { getPositionAlongMultiplePaths } from "../../utils/pathUtils";
import { GameEvent } from "../../core/types/enums/events";
import type { TilePlacementState } from "../../utils/tilePlacement";
import { getShouldStopMovement } from "../../core/getShouldStopMovement";
import {
  pauseWhenTabHiddenSelector,
  useSettingsStore,
} from "../../core/stores/useSettingsStore";

type TowerSystemProps = {
  fireProjectile: (
    projectile: Omit<ProjectileInstance, "id">
  ) => ProjectileInstance;
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
    selectedTower,
    onTowerClick,
    onSellTower,
    hoveredTile,
    selectedTowerType,
    hoveredTilePlacementState,
  }) => {
    // Fire timing is a pure simulation concern, so it lives in a ref instead
    // of the zustand `towers` array: updating `lastFireTime` no longer
    // re-renders the 150-tower list and the O(towers^2) combat-stats memo on
    // every shot. The towers array reference still changes on place/sell, so
    // a shot after a placement naturally reads the fresh array.
    const fireTimesRef = useRef(new Map<number, number>());

    const towerTypes = useGameStore(towerTypesSelector);
    const tileSize = useGameStore(tileSizeSelector);
    const towerHeight = useGameStore(towerHeightSelector);

    const gridSize = useLevelStore(gridSizeSelector);
    const pathWaypoints = useLevelStore(pathWaypointsSelector);
    const towers = useLevelStore(towersSelector);
    const isLevelConfigLoaded = useLevelStore(isLevelConfigLoadedSelector);

    const towerIds = useMemo(
      () => new Set(towers.map((t) => t.id)),
      [towers]
    );

    // Tower ids are re-issued from 1 when a level (re)loads, so a reused id
    // would otherwise carry the previous level's fire timestamp. Clear the
    // ref when the level (re)loads; the per-frame prune below only drops ids
    // that no longer exist, which a reused id does not.
    useEffect(() => {
      if (isLevelConfigLoaded) {
        fireTimesRef.current.clear();
      }
    }, [isLevelConfigLoaded]);

    const pauseWhenTabHidden = useSettingsStore(pauseWhenTabHiddenSelector);

    const world = useWorld();

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
      const shouldDisableControls =
        gameStatus === "gameOver" ||
        gameStatus === "won" ||
        gameStatus === "gameMenu";
      if (
        getShouldStopMovement(
          gameStatus,
          shouldDisableControls,
          isPageVisible,
          pauseWhenTabHidden
        )
      )
        return;
      if (gameStatus !== "playing" && gameStatus !== "menu") return;

      const currentTime = state.clock.elapsedTime;
      const enemies = getLivingEnemyList(world);
      const fireTimes = fireTimesRef.current;
      // Prune entries for towers that no longer exist (sold / level restart)
      // so the map stays the size of the current level.
      for (const id of fireTimes.keys()) {
        if (!towerIds.has(id)) fireTimes.delete(id);
      }

      towers.forEach((tower) => {
        if (tower.type === "relay") return;

        const lastFireTime = fireTimes.get(tower.id) ?? 0;
        const timeSinceLastFire = currentTime - lastFireTime;
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
          const enemiesInRange = findEnemiesInRange(
            enemies,
            tower.x,
            tower.z,
            eff.range
          );
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
          Array<{ enemyId: number; damage: number }> | undefined;

        if (tower.type === "chain") {
          const maxHops = tower.maxChainHops ?? 3;
          const mult = tower.chainDamageMultiplierPerHop ?? 0.85;
          chainAdditionalHits = computeChainAdditionalHits(
            world,
            tower,
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

        const planetRadius = getPlanetRadius(gridSize, tileSize);
        const targetPathPos = getPositionAlongMultiplePaths(
          pathWaypoints,
          target.pathIndex,
          target.pathProgress
        );
        const emitterAlongNormal =
          tower.type === "laser" ? towerHeight * 0.5 : towerHeight * 0.7;
        const startWorld = flatCombatPointToWorldPosition(
          tower.x,
          tower.z,
          emitterAlongNormal,
          planetRadius
        );
        const targetWorld = flatCombatPointToWorldPosition(
          target.x,
          target.z,
          targetPathPos.y + target.size,
          planetRadius
        );

        const projectileData: Omit<ProjectileInstance, "id"> = {
          towerId: tower.id,
          towerType: tower.type,
          startX: startWorld.x,
          startY: startWorld.y,
          startZ: startWorld.z,
          damage: eff.damage,
          speed: tower.projectileSpeed,
          range: eff.range,
          color: tower.color,
          slowAmount: tower.slowAmount,
          slowDuration: tower.slowDuration,
          aoeRadius: tower.aoeRadius,
          maxPierce: tower.maxPierce,
          projectileType: tower.projectileType,
          targetX: targetWorld.x,
          targetY: targetWorld.y,
          targetZ: targetWorld.z,
          targetId: target.id,
          pierceEnemyIds: pierceEnemyIds,
          chainAdditionalHits,
        };

        const fired = fireProjectile(projectileData);
        if (fired.id <= 0) return;

        gameEvents.emit(GameEvent.TOWER_FIRE, {
          towerId: tower.id,
          towerType: tower.type,
          worldPosition: {
            x: startWorld.x,
            y: startWorld.y,
            z: startWorld.z,
          },
        });

        fireTimes.set(tower.id, currentTime);
      });
    });

    return (
      <>
        <group name="towers">
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
        </group>

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
