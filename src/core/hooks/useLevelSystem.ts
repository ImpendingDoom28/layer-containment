import { useCallback } from "react";
import { useGameStore } from "../stores/useGameStore";
import { useLevelStore } from "../stores/useLevelStore";
import { useAlmanacStore } from "../stores/useAlmanacStore";
import {
  Enemy,
  EnemyType,
  EnemyUpgradeId,
  Projectile,
  Tower,
  TowerType,
} from "../types/game";
import { getPositionAlongMultiplePaths } from "../../utils/pathUtils";
import { getCssColorValue } from "../../components/ui/lib/cssUtils";
import { getUpgradeIndicatorColors } from "../../utils/enemyUpgradeVisuals";
import { tileToWorldCoordinate } from "../../utils/levelEditor";
import { getTilePlacementState as getSharedTilePlacementState } from "../../utils/tilePlacement";
import { useNextId } from "./utils/useNextId";
import { gameEvents } from "../../utils/eventEmitter";
import { GameEvent } from "../types/enums/events";

export const useLevelSystem = () => {
  const {
    buildings,
    gridOffset,
    gridSize,
    setTowers,
    resetLevelState,
    towers,
    setEnemies,
    setProjectiles,
    pathWaypoints,
    currentWave,
    money,
    enemiesKilled,
    spendMoney,
    addMoney,
    isLevelConfigLoaded,
    incrementEnemiesKilled,
  } = useLevelStore();
  const {
    towerTypes,
    enemyTypes,
    tileSize,
    loseHealth,
    setSelectedTower,
    setSelectedTowerType,
    towerSellPriceMultiplier,
    pathWidth,
    gameStatus,
    enemyUpgrades,
    towerHeight,
  } = useGameStore();

  const getNextTowerId = useNextId();
  const getNextEnemyId = useNextId();
  const getNextProjectileId = useNextId();

  const calcPathIndex = useCallback(() => {
    return Math.floor(Math.random() * pathWaypoints.length);
  }, [pathWaypoints]);

  const getTilePlacementState = useCallback(
    (gridX: number, gridZ: number) => {
      return getSharedTilePlacementState({
        gridX,
        gridZ,
        towers,
        buildings,
        gridOffset,
        tileSize,
        pathWaypoints,
        pathWidth,
      });
    },
    [towers, buildings, gridOffset, tileSize, pathWaypoints, pathWidth]
  );

  // Towers
  const placeTower = useCallback(
    (gridX: number, gridZ: number, towerType: TowerType): boolean => {
      const towerConfig = towerTypes?.[towerType];
      if (!towerConfig) return false;

      // Check if can afford
      if (money < towerConfig.cost) return false;

      const placementState = getTilePlacementState(gridX, gridZ);
      if (placementState.isBlocked) return false;

      const worldX = tileToWorldCoordinate(gridX, gridSize, tileSize);
      const worldZ = tileToWorldCoordinate(gridZ, gridSize, tileSize);

      const newTower: Tower = {
        ...towerConfig,
        id: getNextTowerId(),
        type: towerType,
        gridX,
        gridZ,
        x: worldX,
        z: worldZ,
        lastFireTime: 0,
      };

      setTowers((prev) => [...prev, newTower]);

      spendMoney(towerConfig.cost);
      setSelectedTowerType(null);
      const emitterY =
        towerType === "laser" ? towerHeight * 0.5 : towerHeight * 0.7;
      gameEvents.emit(GameEvent.TOWER_PLACED, {
        towerId: newTower.id,
        towerType,
        gridX,
        gridZ,
        worldPosition: {
          x: worldX,
          y: emitterY,
          z: worldZ,
        },
      });
      return true;
    },
    [
      towerTypes,
      money,
      getTilePlacementState,
      gridSize,
      tileSize,
      getNextTowerId,
      setTowers,
      spendMoney,
      setSelectedTowerType,
      towerHeight,
    ]
  );

  const updateTower = useCallback(
    (towerId: number, updates: Partial<Tower>) => {
      setTowers((prev) =>
        prev.map((tower) =>
          tower.id === towerId ? { ...tower, ...updates } : tower
        )
      );
    },
    [setTowers]
  );

  const removeTower = useCallback(
    (towerId: number) => {
      setTowers((prev) => prev.filter((t) => t.id !== towerId));
      setSelectedTower(null);
    },
    [setTowers, setSelectedTower]
  );

  const sellTower = useCallback(
    (towerId: number) => {
      const tower = towers.find((t) => t.id === towerId);
      if (!tower) return;

      const sellPrice = Math.floor(tower.cost * towerSellPriceMultiplier);
      addMoney(sellPrice);
      removeTower(towerId);
      const emitterY =
        tower.type === "laser" ? towerHeight * 0.5 : towerHeight * 0.7;
      gameEvents.emit(GameEvent.TOWER_SOLD, {
        towerId,
        towerType: tower.type,
        worldPosition: {
          x: tower.x,
          y: emitterY,
          z: tower.z,
        },
      });
    },
    [addMoney, removeTower, towers, towerSellPriceMultiplier, towerHeight]
  );

  //Enemies
  const addEnemy = useCallback(
    (
      enemyType: EnemyType,
      applyUpgrades: EnemyUpgradeId[] = []
    ): Enemy | null => {
      const enemyConfig = enemyTypes?.[enemyType];
      if (!enemyConfig) return null;

      const pathIndex = calcPathIndex();
      const startPosition = getPositionAlongMultiplePaths(
        pathWaypoints,
        pathIndex,
        0
      );

      let health = enemyConfig.health;
      let speed = enemyConfig.speed;
      let reward = enemyConfig.reward;
      let regeneration: number | undefined;
      let slowResistance: number | undefined;

      for (const upgradeId of applyUpgrades) {
        const upgrade = enemyUpgrades?.[upgradeId];
        if (!upgrade) continue;

        if (upgrade.healthMultiplier) {
          health = Math.round(health * upgrade.healthMultiplier);
        }
        if (upgrade.speedMultiplier) {
          speed = speed * upgrade.speedMultiplier;
        }
        reward = Math.round(reward * upgrade.rewardMultiplier);

        if (upgrade.abilities?.regeneration) {
          regeneration = (regeneration ?? 0) + upgrade.abilities.regeneration;
        }
        if (upgrade.resistances?.slow) {
          slowResistance = Math.max(
            slowResistance ?? 0,
            upgrade.resistances.slow
          );
        }
      }

      const upgradeIndicatorColors = getUpgradeIndicatorColors(
        applyUpgrades,
        enemyUpgrades,
        getCssColorValue("scene-white")
      );

      const enemy: Enemy = {
        ...enemyConfig,
        id: getNextEnemyId(),
        type: enemyType,
        health,
        maxHealth: health,
        speed,
        reward,
        pathProgress: 0,
        pathIndex: pathIndex,
        slowUntil: 0,
        slowMultiplier: 1,
        x: startPosition.x,
        z: startPosition.z,
        upgrades: applyUpgrades,
        upgradeIndicatorColors,
        regeneration,
        slowResistance,
      };

      if (gameStatus === "playing") {
        // Mark enemy type as discovered in the almanac
        useAlmanacStore.getState().discoverEnemy(enemyType);
      }

      setEnemies((prev) => [...prev, enemy]);
      return enemy;
    },
    [
      enemyTypes,
      enemyUpgrades,
      calcPathIndex,
      pathWaypoints,
      getNextEnemyId,
      gameStatus,
      setEnemies,
    ]
  );

  const updateEnemy = useCallback(
    (enemyId: number, updates: Partial<Enemy>) => {
      const updateKeys = Object.keys(updates) as Array<keyof Enemy>;
      if (updateKeys.length === 0) return;

      setEnemies((prev) => {
        let foundEnemy: Enemy | null = null;
        let updatedEnemy: Enemy | null = null;
        let hasChanges = false;
        const nextEnemies: Enemy[] = [];

        for (const enemy of prev) {
          if (enemy.id !== enemyId) {
            nextEnemies.push(enemy);
            continue;
          }

          foundEnemy = enemy;

          const shouldUpdate = updateKeys.some(
            (key) => enemy[key] !== updates[key]
          );

          if (!shouldUpdate) {
            nextEnemies.push(enemy);
            continue;
          }

          hasChanges = true;
          updatedEnemy = {
            ...enemy,
            ...updates,
          };

          if (updatedEnemy.health > 0) {
            nextEnemies.push(updatedEnemy);
          }
        }

        if (!foundEnemy || !hasChanges || !updatedEnemy) {
          return prev;
        }

        if (updatedEnemy.health <= 0) {
          addMoney(updatedEnemy.reward);
          if (gameStatus !== "menu") {
            incrementEnemiesKilled();
          }
          gameEvents.emit(GameEvent.ENEMY_KILLED, {
            enemyId,
            enemyType: updatedEnemy.type,
            worldPosition: {
              x: updatedEnemy.x,
              y: updatedEnemy.size / 2,
              z: updatedEnemy.z,
            },
          });
          return nextEnemies;
        }

        return nextEnemies;
      });
    },
    [setEnemies, addMoney, incrementEnemiesKilled, gameStatus]
  );

  const removeEnemy = useCallback(
    (enemyId: number, reachedEnd: boolean = false) => {
      setEnemies((prev) => {
        const enemy = prev.find((e) => e.id === enemyId);
        if (!enemy) return prev;

        // If enemy reached end, lose health
        if (reachedEnd) {
          loseHealth(enemy.healthLoss);
          gameEvents.emit(GameEvent.ENEMY_REACHED_END, {
            enemyId,
            enemyType: enemy.type,
            worldPosition: {
              x: enemy.x,
              y: enemy.size / 2,
              z: enemy.z,
            },
          });
        } else {
          addMoney(enemy.reward);
          if (gameStatus !== "menu") {
            incrementEnemiesKilled();
          }
          gameEvents.emit(GameEvent.ENEMY_KILLED, {
            enemyId,
            enemyType: enemy.type,
            worldPosition: {
              x: enemy.x,
              y: enemy.size / 2,
              z: enemy.z,
            },
          });
        }

        return prev.filter((e) => e.id !== enemyId);
      });
    },
    [setEnemies, loseHealth, addMoney, incrementEnemiesKilled, gameStatus]
  );

  // Projectiles
  const addProjectile = useCallback(
    (projectile: Omit<Projectile, "id">): Projectile => {
      const newProjectile: Projectile = {
        ...projectile,
        id: getNextProjectileId(),
      };
      setProjectiles((prev) => [...prev, newProjectile]);
      return newProjectile;
    },
    [getNextProjectileId, setProjectiles]
  );

  const updateProjectile = useCallback(
    (projectileId: number, updates: Partial<Projectile>) => {
      setProjectiles((prev) =>
        prev.map((p) => (p.id === projectileId ? { ...p, ...updates } : p))
      );
    },
    [setProjectiles]
  );

  const resetState = useCallback(() => {
    resetLevelState();
    getNextTowerId(true);
    getNextEnemyId(true);
    getNextProjectileId(true);
  }, [resetLevelState, getNextTowerId, getNextEnemyId, getNextProjectileId]);

  return {
    placeTower,
    updateTower,
    removeTower,
    sellTower,

    addEnemy,
    updateEnemy,
    removeEnemy,

    addProjectile,
    updateProjectile,

    resetState,

    money,
    enemiesKilled,
    currentWave,
    isLevelConfigLoaded,
    getTilePlacementState,
  };
};

export type LevelSystem = ReturnType<typeof useLevelSystem>;
