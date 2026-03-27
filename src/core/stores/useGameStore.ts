import { create } from "zustand";

import type {
  TowerType,
  GameStatus,
  ActiveEffect,
  TowerConfig,
  EnemyType,
  EnemyConfig,
  EnemyUpgradeId,
  EnemyUpgradeConfig,
  Tower,
} from "../types/game";
import { GameConfigData } from "../../core/gameConfig";

type GameStoreState = {
  enemyHealthLoss: number;
  health: number;
  activeEffects: ActiveEffect[];
  selectedTowerType: TowerType | null;
  selectedTower: Tower | null;

  tileSize: number;
  pathWidth: number;
  pathYOffset: number;
  towerBaseRadius: number;
  towerHeight: number;
  towerSellPriceMultiplier: number;
  waveDelay: number;
  enemyTypes: Record<EnemyType, EnemyConfig> | null;
  towerTypes: Record<TowerType, TowerConfig> | null;
  enemyUpgrades: Record<EnemyUpgradeId, EnemyUpgradeConfig> | null;
  projectileSize: number;

  isGameConfigLoaded: boolean;
  gameStatus: GameStatus;
  previousStatus: GameStatus | null;
  debug: boolean;
  showAudioSettings: boolean;
  denyPulse: Partial<Record<TowerType, number>>;
};

type GameStoreActions = {
  setShowAudioSettings: (show: boolean) => void;
  initializeGameState: (config: GameConfigData) => void;
  loseHealth: (amount: number) => void;
  setActiveEffects: (
    effects: ActiveEffect[] | ((prev: ActiveEffect[]) => ActiveEffect[])
  ) => void;
  setGameStatus: (status: GameStore["gameStatus"]) => void;
  setPreviousStatus: (status: GameStore["previousStatus"]) => void;
  setSelectedTowerType: (type: TowerType | null) => void;
  setSelectedTower: (tower: Tower | null) => void;
  setDebug: (debug: boolean) => void;
  resetGameState: () => void;
  incrementDenyPulse: (towerType: TowerType) => void;
};

type GameStore = GameStoreState & GameStoreActions;

const DEFAULT_STATE: GameStoreState = {
  enemyTypes: null,
  towerTypes: null,
  enemyUpgrades: null,
  activeEffects: [],
  selectedTowerType: null,
  selectedTower: null,
  health: 0,

  isGameConfigLoaded: false,
  previousStatus: null,
  gameStatus: "menu",
  debug: false,
  showAudioSettings: false,
  denyPulse: {},
  enemyHealthLoss: 0,
  tileSize: 0,
  towerBaseRadius: 0,
  towerHeight: 0,
  towerSellPriceMultiplier: 0,
  waveDelay: 0,
  pathWidth: 0,
  pathYOffset: 0,
  projectileSize: 0,
};

export const useGameStore = create<GameStore>((set) => ({
  ...DEFAULT_STATE,

  initializeGameState: (config: GameConfigData) => {
    const {
      startingHealth,
      tileSize,
      enemyHealthLoss,
      towerBaseRadius,
      towerHeight,
      towerSellPriceMultiplier,
      waveDelay,
      enemyTypes,
      towerTypes,
      enemyUpgrades,
      pathWidth,
      pathYOffset,
      projectileSize,
    } = config;

    set({
      health: startingHealth,
      tileSize,
      towerBaseRadius,
      enemyHealthLoss,
      towerHeight,
      towerSellPriceMultiplier,
      waveDelay,
      enemyTypes: enemyTypes as Record<EnemyType, EnemyConfig>,
      towerTypes: towerTypes as Record<TowerType, TowerConfig>,
      enemyUpgrades: enemyUpgrades as Record<
        EnemyUpgradeId,
        EnemyUpgradeConfig
      >,
      pathWidth,
      pathYOffset,
      projectileSize,
      isGameConfigLoaded: true,
    });
  },

  setShowAudioSettings: (show: boolean) => {
    set({ showAudioSettings: show });
  },

  loseHealth: (amount: number) => {
    set((state) => {
      const newHealth = Math.max(0, state.health - amount);
      if (newHealth === 0) {
        return { health: newHealth, gameStatus: "gameOver" as GameStatus };
      }
      return { health: newHealth };
    });
  },

  setActiveEffects: (effects) => {
    set((state) => ({
      activeEffects:
        typeof effects === "function" ? effects(state.activeEffects) : effects,
    }));
  },

  setGameStatus: (status) => {
    set({ gameStatus: status });
  },

  setPreviousStatus: (status) => {
    set({ previousStatus: status });
  },

  setSelectedTowerType: (type) => {
    set({ selectedTowerType: type });
  },

  setSelectedTower: (tower) => {
    set({ selectedTower: tower });
  },

  setDebug: (debug) => {
    set({ debug });
  },

  incrementDenyPulse: (towerType) => {
    set((state) => ({
      denyPulse: {
        ...state.denyPulse,
        [towerType]: (state.denyPulse[towerType] ?? 0) + 1,
      },
    }));
  },

  resetGameState: () => {
    set({
      ...DEFAULT_STATE,
    });
  },
}));

export const debugSelector = (state: GameStore) => state.debug;
export const showAudioSettingsSelector = (state: GameStore) =>
  state.showAudioSettings;
export const setShowAudioSettingsSelector = (state: GameStore) =>
  state.setShowAudioSettings;
export const tileSizeSelector = (state: GameStore) => state.tileSize;
export const enemyTypesSelector = (state: GameStore) => state.enemyTypes;
export const pathWidthSelector = (state: GameStore) => state.pathWidth;
export const pathYOffsetSelector = (state: GameStore) => state.pathYOffset;
export const towerTypesSelector = (state: GameStore) => state.towerTypes;
export const projectileSizeSelector = (state: GameStore) =>
  state.projectileSize;
export const waveDelaySelector = (state: GameStore) => state.waveDelay;
export const enemyUpgradesSelector = (state: GameStore) => state.enemyUpgrades;
export const initializeGameStateSelector = (state: GameStore) =>
  state.initializeGameState;
export const denyPulseSelector = (state: GameStore) => state.denyPulse;
export const incrementDenyPulseSelector = (state: GameStore) =>
  state.incrementDenyPulse;
