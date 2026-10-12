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
import { GameConfigData } from "../configs/gameConfig";
import { getIsDocumentVisible } from "../../utils/isDocumentVisible";

type GameStoreState = {
  enemyHealthLoss: number;
  startingHealth: number;
  activeEffects: ActiveEffect[];
  /**
   * The type of tower that is currently selected to place from the tower shop
   */
  selectedTowerTypeToPlace: TowerType | null;
  /**
   * The tower that is currently selected in the game (to view it's details)
   */
  selectedTower: Tower | null;

  tileSize: number;
  pathWidth: number;
  pathYOffset: number;
  towerBaseRadius: number;
  towerHeight: number;
  towerSellPriceMultiplier: number;
  enemyTypes: Record<EnemyType, EnemyConfig> | null;
  towerTypes: Record<TowerType, TowerConfig> | null;
  enemyUpgrades: Record<EnemyUpgradeId, EnemyUpgradeConfig> | null;
  projectileSize: number;

  isGameConfigLoaded: boolean;
  gameStatus: GameStatus;
  previousStatus: GameStatus | null;
  debug: boolean;
  showSettings: boolean;
  denyPulse: Partial<Record<TowerType, number>>;
  isPageVisible: boolean;
};

type GameStoreActions = {
  setShowSettings: (show: boolean) => void;
  initializeGameState: (config: GameConfigData) => void;
  setActiveEffects: (
    effects: ActiveEffect[] | ((prev: ActiveEffect[]) => ActiveEffect[])
  ) => void;
  setGameStatus: (status: GameStore["gameStatus"]) => void;
  setPreviousStatus: (status: GameStore["previousStatus"]) => void;
  setSelectedTowerTypeToPlace: (type: TowerType | null) => void;
  setSelectedTower: (tower: Tower | null) => void;
  setDebug: (debug: boolean) => void;
  resetGameState: () => void;
  startNewRun: () => void;
  incrementDenyPulse: (towerType: TowerType) => void;
  setIsPageVisible: (visible: boolean) => void;
};

type GameStore = GameStoreState & GameStoreActions;

const DEFAULT_STATE: GameStoreState = {
  enemyTypes: null,
  towerTypes: null,
  enemyUpgrades: null,
  activeEffects: [],
  selectedTowerTypeToPlace: null,
  selectedTower: null,
  startingHealth: 0,

  isGameConfigLoaded: false,
  previousStatus: null,
  gameStatus: "menu",
  debug: false,
  showSettings: false,
  denyPulse: {},
  enemyHealthLoss: 0,
  tileSize: 0,
  towerBaseRadius: 0,
  towerHeight: 0,
  towerSellPriceMultiplier: 0,
  pathWidth: 0,
  pathYOffset: 0,
  projectileSize: 0,
  isPageVisible: true,
};

export const useGameStore = create<GameStore>((set) => ({
  ...DEFAULT_STATE,
  isPageVisible: getIsDocumentVisible(),

  initializeGameState: (config: GameConfigData) => {
    const {
      startingHealth,
      tileSize,
      enemyHealthLoss,
      towerBaseRadius,
      towerHeight,
      towerSellPriceMultiplier,
      enemyTypes,
      towerTypes,
      enemyUpgrades,
      pathWidth,
      pathYOffset,
      projectileSize,
    } = config;

    set({
      startingHealth,
      tileSize,
      towerBaseRadius,
      enemyHealthLoss,
      towerHeight,
      towerSellPriceMultiplier,
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

  setShowSettings: (show: boolean) => {
    set({ showSettings: show });
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

  setSelectedTowerTypeToPlace: (type) => {
    set({ selectedTowerTypeToPlace: type });
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
      isPageVisible: getIsDocumentVisible(),
    });
  },

  startNewRun: () => {
    set({
      activeEffects: [],
      selectedTowerTypeToPlace: null,
      selectedTower: null,
      previousStatus: null,
      denyPulse: {},
      showSettings: false,
      gameStatus: "playing",
    });
  },

  setIsPageVisible: (visible: boolean) => {
    set({ isPageVisible: visible });
  },
}));

export const debugSelector = (state: GameStore) => state.debug;
export const showSettingsSelector = (state: GameStore) => state.showSettings;
export const setShowSettingsSelector = (state: GameStore) =>
  state.setShowSettings;
export const tileSizeSelector = (state: GameStore) => state.tileSize;
export const enemyTypesSelector = (state: GameStore) => state.enemyTypes;
export const pathWidthSelector = (state: GameStore) => state.pathWidth;
export const pathYOffsetSelector = (state: GameStore) => state.pathYOffset;
export const towerTypesSelector = (state: GameStore) => state.towerTypes;
export const projectileSizeSelector = (state: GameStore) =>
  state.projectileSize;
export const enemyUpgradesSelector = (state: GameStore) => state.enemyUpgrades;
export const initializeGameStateSelector = (state: GameStore) =>
  state.initializeGameState;
export const denyPulseSelector = (state: GameStore) => state.denyPulse;
export const incrementDenyPulseSelector = (state: GameStore) =>
  state.incrementDenyPulse;
export const isPageVisibleSelector = (state: GameStore) => state.isPageVisible;
export const selectedTowerTypeToPlaceSelector = (state: GameStore) =>
  state.selectedTowerTypeToPlace;
export const setSelectedTowerTypeToPlaceSelector = (state: GameStore) =>
  state.setSelectedTowerTypeToPlace;
export const selectedTowerSelector = (state: GameStore) => state.selectedTower;
export const setSelectedTowerSelector = (state: GameStore) =>
  state.setSelectedTower;
export const gameStatusSelector = (state: GameStore) => state.gameStatus;
export const previousStatusSelector = (state: GameStore) =>
  state.previousStatus;
export const activeEffectsSelector = (state: GameStore) => state.activeEffects;
export const isGameConfigLoadedSelector = (state: GameStore) =>
  state.isGameConfigLoaded;
export const towerHeightSelector = (state: GameStore) => state.towerHeight;
export const towerBaseRadiusSelector = (state: GameStore) =>
  state.towerBaseRadius;
export const towerSellPriceMultiplierSelector = (state: GameStore) =>
  state.towerSellPriceMultiplier;
export const setActiveEffectsSelector = (state: GameStore) =>
  state.setActiveEffects;
export const setGameStatusSelector = (state: GameStore) => state.setGameStatus;
export const setPreviousStatusSelector = (state: GameStore) =>
  state.setPreviousStatus;
export const setDebugSelector = (state: GameStore) => state.setDebug;
export const resetGameStateSelector = (state: GameStore) =>
  state.resetGameState;
export const startNewRunSelector = (state: GameStore) => state.startNewRun;
export const setIsPageVisibleSelector = (state: GameStore) =>
  state.setIsPageVisible;
