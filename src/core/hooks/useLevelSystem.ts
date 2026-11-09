import { useCallback } from "react";
import { useActions, useWorld } from "koota/react";

import {
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
  canyonsSelector,
  currentWaveSelector,
  enemiesKilledSelector,
  gridOffsetSelector,
  gridSizeSelector,
  isLevelConfigLoadedSelector,
  moneySelector,
  pathWaypointsSelector,
  resetLevelStateSelector,
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
import { useWaveStore } from "../stores/useWaveStore";
import {
  Enemy,
  EnemyType,
  EnemyUpgradeId,
  Projectile,
  Tower,
  TowerType,
} from "../types/game";
import { tileToWorldCoordinate } from "../../utils/levelEditor";
import { getTilePlacementState as getSharedTilePlacementState } from "../../utils/tilePlacement";
import { useEntityIds } from "../contexts/EntityIdContext";
import { gameEvents } from "../../utils/eventEmitter";
import { GameEvent } from "../types/enums/events";
import { getTowerPlacementDenyReason } from "../utils/towerPlacementDenyReason";
import { towerShopRowElementId } from "../utils/towerShopRowElementId";
import { statsActions } from "../ecs/actions/statsActions";
import { spawnLevelEnemy } from "../ecs/spawnLevelEnemy";

export const useLevelSystem = () => {
  const buildings = useLevelStore(buildingsSelector);
  const waters = useLevelStore(watersSelector);
  const canyons = useLevelStore(canyonsSelector);
  const gridOffset = useLevelStore(gridOffsetSelector);
  const gridSize = useLevelStore(gridSizeSelector);
  const setTowers = useLevelStore(setTowersSelector);
  const resetLevelState = useLevelStore(resetLevelStateSelector);
  const towers = useLevelStore(towersSelector);
  const setProjectiles = useLevelStore(setProjectilesSelector);
  const pathWaypoints = useLevelStore(pathWaypointsSelector);
  const currentWave = useLevelStore(currentWaveSelector);
  const money = useLevelStore(moneySelector);
  const enemiesKilled = useLevelStore(enemiesKilledSelector);
  const spendMoney = useLevelStore(spendMoneySelector);
  const addMoney = useLevelStore(addMoneySelector);
  const isLevelConfigLoaded = useLevelStore(isLevelConfigLoadedSelector);

  const towerTypes = useGameStore(towerTypesSelector);
  const tileSize = useGameStore(tileSizeSelector);
  const setSelectedTower = useGameStore(setSelectedTowerSelector);
  const setSelectedTowerTypeToPlace = useGameStore(
    setSelectedTowerTypeToPlaceSelector
  );
  const towerSellPriceMultiplier = useGameStore(
    towerSellPriceMultiplierSelector
  );
  const pathWidth = useGameStore(pathWidthSelector);
  const towerHeight = useGameStore(towerHeightSelector);
  const resetLevelEnemyUpgrades = useUpgradeStore(
    resetLevelEnemyUpgradesSelector
  );

  const world = useWorld();
  const { recordTowerPurchase } = useActions(statsActions);

  const { getNextTowerId, getNextEnemyId, getNextProjectileId } =
    useEntityIds();

  const getTilePlacementState = useCallback(
    (gridX: number, gridZ: number) => {
      return getSharedTilePlacementState({
        gridX,
        gridZ,
        towers,
        buildings,
        waters,
        canyons,
        gridOffset,
        tileSize,
        pathWaypoints,
        pathWidth,
      });
    },
    [
      towers,
      buildings,
      waters,
      canyons,
      gridOffset,
      tileSize,
      pathWaypoints,
      pathWidth,
    ]
  );

  const placeTower = useCallback(
    (gridX: number, gridZ: number, towerType: TowerType): boolean => {
      const towerConfig = towerTypes?.[towerType];
      if (!towerConfig) return false;

      const placementState = getTilePlacementState(gridX, gridZ);
      const denyReason = getTowerPlacementDenyReason(
        useLevelStore.getState().money >= towerConfig.cost,
        placementState
      );
      if (denyReason) {
        gameEvents.emit(GameEvent.UI_ACTION_DENIED, {
          reason: denyReason,
          towerType,
          elementId: towerShopRowElementId(towerType),
        });
        return false;
      }

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
      recordTowerPurchase(towerType, towerConfig.cost);
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
      getTilePlacementState,
      gridSize,
      tileSize,
      getNextTowerId,
      setTowers,
      spendMoney,
      recordTowerPurchase,
      setSelectedTowerTypeToPlace,
      towerHeight,
    ]
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

  const addEnemy = useCallback(
    (
      enemyType: EnemyType,
      applyUpgrades: EnemyUpgradeId[] = [],
      forcedPathIndex?: number
    ): Enemy | null =>
      spawnLevelEnemy(
        world,
        getNextEnemyId,
        enemyType,
        applyUpgrades,
        forcedPathIndex
      ),
    [world, getNextEnemyId]
  );

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
    useWaveStore.getState().setNextWaveReady(true);
  }, [
    resetLevelState,
    getNextTowerId,
    getNextEnemyId,
    getNextProjectileId,
    resetLevelEnemyUpgrades,
  ]);

  return {
    placeTower,
    removeTower,
    sellTower,

    addEnemy,

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
