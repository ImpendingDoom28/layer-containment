import { create } from "zustand";

import type {
  Building,
  Enemy,
  EnemyType,
  PathWaypoint,
  Projectile,
  Tower,
  WaterBody,
  WaveConfig,
} from "../types/game";
import type { LevelConfigData } from "../../core/levelConfig";
import { getCssColorValue } from "../../components/ui/lib/cssUtils";
import {
  getLevelGridOffset,
  withRecalculatedBuildingCoordinates,
  withRecalculatedWaterCoordinates,
} from "../../utils/levelEditor";
import { getUpgradeIndicatorColors } from "../../utils/enemyUpgradeVisuals";
import { enemyActions } from "../ecs/actions/enemyActions";
import { world } from "../ecs/world";
import { useGameStore } from "./useGameStore";

type LevelStoreState = {
  gridSize: number;
  waters: WaterBody[];
  pathWaypoints: PathWaypoint[][];
  totalWaves: number;
  waveConfigs: WaveConfig[];
  buildings: Building[];
  enemyWeights: Record<EnemyType, number> | null;
  money: number;

  enemiesKilled: number;
  currentWave: number;
  gridOffset: number;
  towers: Tower[];
  projectiles: Projectile[];
  isLevelConfigLoaded: boolean;
};

type LevelStoreActions = {
  addMoney: (amount: number) => void;
  spendMoney: (amount: number) => void;
  incrementEnemiesKilled: () => void;
  setGridSize: (gridSize: number, tileSize: number) => void;
  setPathWaypoints: (pathWaypoints: PathWaypoint[][]) => void;
  setCurrentWave: (wave: number | ((prev: number) => number)) => void;
  setTotalWaves: (totalWaves: number) => void;
  setWaveConfigs: (waveConfigs: WaveConfig[]) => void;
  setBuildings: (buildings: Building[]) => void;
  setTowers: (towers: Tower[] | ((prev: Tower[]) => Tower[])) => void;
  setProjectiles: (
    projectiles: Projectile[] | ((prev: Projectile[]) => Projectile[])
  ) => void;
  removeProjectile: (projectileId: number) => void;
  resetLevelState: () => void;
  initializeLevelState: (levelData: LevelConfigData, tileSize: number) => void;
};

type LevelStore = LevelStoreState & LevelStoreActions;

const DEFAULT_STATE: LevelStoreState = {
  money: 0,
  enemiesKilled: 0,
  currentWave: 0,
  gridOffset: 0,
  gridSize: 0,
  waters: [],
  totalWaves: 0,
  enemyWeights: null,
  pathWaypoints: [],
  waveConfigs: [],
  buildings: [],
  towers: [],
  projectiles: [],
  isLevelConfigLoaded: false,
};

const buildLevelConfigEnemies = (
  levelData: LevelConfigData,
  enemyTypes: NonNullable<
    ReturnType<typeof useGameStore.getState>["enemyTypes"]
  >,
  enemyUpgrades: NonNullable<
    ReturnType<typeof useGameStore.getState>["enemyUpgrades"]
  >
): Enemy[] =>
  levelData.enemies.map((enemy) => ({
    ...enemyTypes[enemy.type],
    ...enemy,
    pathIndex: enemy.pathIndex ?? 0,
    maxHealth: enemy.health,
    slowUntil: 0,
    slowMultiplier: 1,
    upgradeIndicatorColors:
      enemy.upgradeIndicatorColors ??
      getUpgradeIndicatorColors(
        enemy.upgrades,
        enemyUpgrades,
        getCssColorValue("scene-white")
      ),
  }));

export const useLevelStore = create<LevelStore>((set) => ({
  ...DEFAULT_STATE,

  initializeLevelState: (levelData: LevelConfigData, tileSize: number) => {
    const towerTypes = useGameStore.getState().towerTypes;
    const enemyTypes = useGameStore.getState().enemyTypes;
    const enemyUpgrades = useGameStore.getState().enemyUpgrades;

    if (!towerTypes || !enemyTypes || !enemyUpgrades) return;

    const gridOffset = getLevelGridOffset(levelData.gridSize, tileSize);
    const actions = enemyActions(world);

    actions.clearAllEnemies();
    for (const enemy of buildLevelConfigEnemies(
      levelData,
      enemyTypes,
      enemyUpgrades
    )) {
      actions.spawnEnemy(enemy);
    }

    // Only used if we have defined towers in the level config
    const towers = levelData.towers.map((tower) => ({
      lastFireTime: 0,
      ...towerTypes[tower.type],
      ...tower,
    }));

    const buildings = levelData.buildings.map((building) =>
      withRecalculatedBuildingCoordinates(
        building,
        levelData.gridSize,
        tileSize
      )
    );

    const waters = levelData.waters.map((water) =>
      withRecalculatedWaterCoordinates(water, levelData.gridSize, tileSize)
    );

    set({
      money: levelData.startingMoney,
      enemiesKilled: 0,
      gridSize: levelData.gridSize,
      waters,
      pathWaypoints: levelData.pathWaypoints,
      totalWaves: levelData.waveConfigs.length,
      waveConfigs: levelData.waveConfigs,
      buildings,
      towers,
      projectiles: levelData.projectiles,
      enemyWeights: levelData.enemyWeights as Record<EnemyType, number>,
      gridOffset,
      isLevelConfigLoaded: true,
    });
  },

  addMoney: (amount: number) => {
    set((state) => ({ money: state.money + amount }));
  },

  incrementEnemiesKilled: () => {
    set((state) => ({ enemiesKilled: state.enemiesKilled + 1 }));
  },

  spendMoney: (amount: number) => {
    set((state) => {
      if (state.money >= amount) {
        return { money: state.money - amount };
      }
      return state;
    });
  },

  setGridSize: (gridSize, tileSize) => {
    set({
      gridSize,
      gridOffset: getLevelGridOffset(gridSize, tileSize),
    });
  },

  setPathWaypoints: (pathWaypoints) => {
    set({ pathWaypoints });
  },

  setTotalWaves: (totalWaves) => {
    set({ totalWaves });
  },

  setWaveConfigs: (waveConfigs) => {
    set({ waveConfigs });
  },

  setBuildings: (buildings) => {
    set({ buildings });
  },

  setTowers: (towers) => {
    set((state) => ({
      towers: typeof towers === "function" ? towers(state.towers) : towers,
    }));
  },

  setProjectiles: (projectiles) => {
    set((state) => ({
      projectiles:
        typeof projectiles === "function"
          ? projectiles(state.projectiles)
          : projectiles,
    }));
  },

  setCurrentWave: (wave) => {
    set((state) => ({
      currentWave: typeof wave === "function" ? wave(state.currentWave) : wave,
    }));
  },

  removeProjectile: (projectileId: number) => {
    set((state) => ({
      projectiles: state.projectiles.filter((p) => p.id !== projectileId),
    }));
  },

  resetLevelState: () => {
    enemyActions(world).clearAllEnemies();
    set({
      ...DEFAULT_STATE,
    });
  },
}));

export const gridOffsetSelector = (state: LevelStore) => state.gridOffset;
export const gridSizeSelector = (state: LevelStore) => state.gridSize;
export const watersSelector = (state: LevelStore) => state.waters;
export const pathWaypointsSelector = (state: LevelStore) => state.pathWaypoints;
export const totalWavesSelector = (state: LevelStore) => state.totalWaves;
export const waveConfigsSelector = (state: LevelStore) => state.waveConfigs;
export const buildingsSelector = (state: LevelStore) => state.buildings;
export const setGridSizeSelector = (state: LevelStore) => state.setGridSize;
export const setPathWaypointsSelector = (state: LevelStore) =>
  state.setPathWaypoints;
export const setTotalWavesSelector = (state: LevelStore) => state.setTotalWaves;
export const setWaveConfigsSelector = (state: LevelStore) =>
  state.setWaveConfigs;
export const setBuildingsSelector = (state: LevelStore) => state.setBuildings;
export const towersSelector = (state: LevelStore) => state.towers;
export const projectilesSelector = (state: LevelStore) => state.projectiles;
export const setCurrentWaveSelector = (state: LevelStore) =>
  state.setCurrentWave;
export const currentWaveSelector = (state: LevelStore) => state.currentWave;
export const moneySelector = (state: LevelStore) => state.money;
export const enemiesKilledSelector = (state: LevelStore) => state.enemiesKilled;
export const isLevelConfigLoadedSelector = (state: LevelStore) =>
  state.isLevelConfigLoaded;
export const spendMoneySelector = (state: LevelStore) => state.spendMoney;
export const addMoneySelector = (state: LevelStore) => state.addMoney;
export const incrementEnemiesKilledSelector = (state: LevelStore) =>
  state.incrementEnemiesKilled;
export const setTowersSelector = (state: LevelStore) => state.setTowers;
export const setProjectilesSelector = (state: LevelStore) =>
  state.setProjectiles;
export const resetLevelStateSelector = (state: LevelStore) =>
  state.resetLevelState;
