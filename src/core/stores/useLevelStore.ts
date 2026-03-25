import { create } from "zustand";

import type {
  Building,
  Enemy,
  EnemyType,
  PathWaypoint,
  Projectile,
  Tower,
  WaveConfig,
} from "../types/game";
import type { LevelConfigData } from "../../core/levelConfig";
import { getCssColorValue } from "../../components/ui/lib/cssUtils";
import {
  getLevelGridOffset,
  withRecalculatedBuildingCoordinates,
} from "../../utils/levelEditor";
import { getUpgradeIndicatorColors } from "../../utils/enemyUpgradeVisuals";
import { useGameStore } from "./useGameStore";

type LevelStoreState = {
  // From level config
  gridSize: number;
  pathWaypoints: PathWaypoint[][];
  totalWaves: number;
  waveConfigs: WaveConfig[];
  buildings: Building[];
  enemyWeights: Record<EnemyType, number> | null;
  money: number;

  // Calculated in game
  enemiesKilled: number;
  currentWave: number;
  gridOffset: number;
  towers: Tower[];
  enemies: Enemy[];
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
  setEnemies: (enemies: Enemy[] | ((prev: Enemy[]) => Enemy[])) => void;
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
  totalWaves: 0,
  enemyWeights: null,
  pathWaypoints: [],
  waveConfigs: [],
  buildings: [],
  towers: [],
  enemies: [],
  projectiles: [],
  isLevelConfigLoaded: false,
};

export const useLevelStore = create<LevelStore>((set) => ({
  ...DEFAULT_STATE,

  initializeLevelState: (levelData: LevelConfigData, tileSize: number) => {
    const towerTypes = useGameStore.getState().towerTypes;
    const enemyTypes = useGameStore.getState().enemyTypes;
    const enemyUpgrades = useGameStore.getState().enemyUpgrades;

    const gridOffset = getLevelGridOffset(levelData.gridSize, tileSize);

    // Only used if we have defined enemies in the level config
    const enemies = levelData.enemies.map((enemy) => {
      return {
        ...enemyTypes![enemy.type],
        ...enemy,
        pathIndex: enemy.pathIndex ?? 0,
        upgradeIndicatorColors:
          enemy.upgradeIndicatorColors ??
          getUpgradeIndicatorColors(
            enemy.upgrades,
            enemyUpgrades,
            getCssColorValue("scene-white")
          ),
      };
    });

    // Only used if we have defined towers in the level config
    const towers = levelData.towers.map((tower) => ({
      lastFireTime: 0,
      ...towerTypes![tower.type],
      ...tower,
    }));

    const buildings = levelData.buildings.map((building) =>
      withRecalculatedBuildingCoordinates(
        building,
        levelData.gridSize,
        tileSize
      )
    );

    set({
      money: levelData.startingMoney,
      enemiesKilled: 0,
      gridSize: levelData.gridSize,
      pathWaypoints: levelData.pathWaypoints,
      totalWaves: levelData.waveConfigs.length,
      waveConfigs: levelData.waveConfigs,
      buildings: buildings,
      towers: towers,
      enemies: enemies,
      projectiles: levelData.projectiles,
      enemyWeights: levelData.enemyWeights as Record<EnemyType, number>,
      gridOffset: gridOffset,
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

  setEnemies: (enemies) => {
    set((state) => ({
      enemies: typeof enemies === "function" ? enemies(state.enemies) : enemies,
    }));
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
    set({
      ...DEFAULT_STATE,
    });
  },
}));

export const gridOffsetSelector = (state: LevelStore) => state.gridOffset;
export const gridSizeSelector = (state: LevelStore) => state.gridSize;
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
export const enemiesSelector = (state: LevelStore) => state.enemies;
export const towersSelector = (state: LevelStore) => state.towers;
export const projectilesSelector = (state: LevelStore) => state.projectiles;
export const setCurrentWaveSelector = (state: LevelStore) =>
  state.setCurrentWave;
export const currentWaveSelector = (state: LevelStore) => state.currentWave;
