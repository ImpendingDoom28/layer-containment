import { useCallback } from "react";

import {
  enemyTypesSelector,
  enemyUpgradesSelector,
  gameStatusSelector,
  loseHealthSelector,
  pathWidthSelector,
  setSelectedTowerSelector,
  setSelectedTowerTypeToPlaceSelector,
  tileSizeSelector,
  towerHeightSelector,
  towerSellPriceMultiplierSelector,
  towerTypesSelector,
  useGameStore,
} from "../stores/useGameStore";
import {
  addMoneySelector,
  buildingsSelector,
  currentWaveSelector,
  enemiesKilledSelector,
  gridOffsetSelector,
  gridSizeSelector,
  incrementEnemiesKilledSelector,
  isLevelConfigLoadedSelector,
  moneySelector,
  pathWaypointsSelector,
  resetLevelStateSelector,
  setEnemiesSelector,
  setProjectilesSelector,
  setTowersSelector,
  spendMoneySelector,
  towersSelector,
  useLevelStore,
  watersSelector,
} from "../stores/useLevelStore";
import {
  resetLevelEnemyUpgradesSelector,
  useUpgradeStore,
} from "../stores/useUpgradeStore";
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
import {
  getStackTierForEnemy,
  getTieredUpgradeEffect,
  getUniqueUpgradeIdsInStackOrder,
} from "../../utils/enemyUpgradeTierEffects";
import { tileToWorldCoordinate } from "../../utils/levelEditor";
import { getTilePlacementState as getSharedTilePlacementState } from "../../utils/tilePlacement";
import { useEntityIds } from "../contexts/EntityIdContext";
import { gameEvents } from "../../utils/eventEmitter";
import { GameEvent } from "../types/enums/events";

export const useLevelSystem = () => {
  const buildings = useLevelStore(buildingsSelector);
  const waters = useLevelStore(watersSelector);
  const gridOffset = useLevelStore(gridOffsetSelector);
  const gridSize = useLevelStore(gridSizeSelector);
  const setTowers = useLevelStore(setTowersSelector);
  const resetLevelState = useLevelStore(resetLevelStateSelector);
  const towers = useLevelStore(towersSelector);
  const setEnemies = useLevelStore(setEnemiesSelector);
  const setProjectiles = useLevelStore(setProjectilesSelector);
  const pathWaypoints = useLevelStore(pathWaypointsSelector);
  const currentWave = useLevelStore(currentWaveSelector);
  const money = useLevelStore(moneySelector);
  const enemiesKilled = useLevelStore(enemiesKilledSelector);
  const spendMoney = useLevelStore(spendMoneySelector);
  const addMoney = useLevelStore(addMoneySelector);
  const isLevelConfigLoaded = useLevelStore(isLevelConfigLoadedSelector);
  const incrementEnemiesKilled = useLevelStore(incrementEnemiesKilledSelector);

  const towerTypes = useGameStore(towerTypesSelector);
  const enemyTypes = useGameStore(enemyTypesSelector);
  const tileSize = useGameStore(tileSizeSelector);
  const loseHealth = useGameStore(loseHealthSelector);
  const setSelectedTower = useGameStore(setSelectedTowerSelector);
  const setSelectedTowerTypeToPlace = useGameStore(
    setSelectedTowerTypeToPlaceSelector
  );
  const towerSellPriceMultiplier = useGameStore(
    towerSellPriceMultiplierSelector
  );
  const pathWidth = useGameStore(pathWidthSelector);
  const gameStatus = useGameStore(gameStatusSelector);
  const enemyUpgrades = useGameStore(enemyUpgradesSelector);
  const towerHeight = useGameStore(towerHeightSelector);
  const resetLevelEnemyUpgrades = useUpgradeStore(
    resetLevelEnemyUpgradesSelector
  );

  const { getNextTowerId, getNextEnemyId, getNextProjectileId } =
    useEntityIds();

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
        waters,
        gridOffset,
        tileSize,
        pathWaypoints,
        pathWidth,
      });
    },
    [towers, buildings, waters, gridOffset, tileSize, pathWaypoints, pathWidth]
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
      setSelectedTowerTypeToPlace(null);
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
      setSelectedTowerTypeToPlace,
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

      const uniqueUpgradeIds = getUniqueUpgradeIdsInStackOrder(applyUpgrades);
      for (const upgradeId of uniqueUpgradeIds) {
        const upgrade = enemyUpgrades?.[upgradeId];
        if (!upgrade) continue;

        const stackTier = getStackTierForEnemy(upgradeId, applyUpgrades);
        const effect = getTieredUpgradeEffect(upgrade, stackTier);

        if (effect.healthMultiplier) {
          health = Math.round(health * effect.healthMultiplier);
        }
        if (effect.speedMultiplier) {
          speed = speed * effect.speedMultiplier;
        }
        reward = Math.round(reward * effect.rewardMultiplier);

        if (effect.regeneration) {
          regeneration = (regeneration ?? 0) + effect.regeneration;
        }
        if (effect.slowResistance !== undefined) {
          slowResistance = Math.max(slowResistance ?? 0, effect.slowResistance);
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
        upgrades: uniqueUpgradeIds,
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
    resetLevelEnemyUpgrades();
  }, [
    resetLevelState,
    getNextTowerId,
    getNextEnemyId,
    getNextProjectileId,
    resetLevelEnemyUpgrades,
  ]);

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
