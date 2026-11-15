import { create } from "zustand";

import type {
  BossConfig,
  Building,
  CanyonConfig,
  EnemyType,
  PathWaypoint,
  Projectile,
  Tower,
  WaterBody,
  WaveConfig,
} from "../types/game";
import type { LevelConfigData } from "../configs/levelConfig";
import {
  getLevelGridOffset,
  withRecalculatedBuildingCoordinates,
  withRecalculatedWaterCoordinates,
} from "../../utils/levelEditor";
import { buildCanyonBridgePaths } from "../../utils/canyonBridges";
import { getUpgradeStacks } from "../../utils/upgradeStacks";
import { gameEvents } from "../../utils/eventEmitter";
import { GameEvent } from "../types/enums/events";
import { enemyActions } from "../ecs/actions/enemyActions";
import { splitRequest } from "../ecs/traits/split";
import { world } from "../ecs/world";
import type { TileData } from "../types/utils";
import { useGameStore } from "./useGameStore";

/**
 * A comet reveal in progress for a given run: `phase` `armed` hides the
 * scene's spawn portals (the comet is still in flight); `phase` `revealed`
 * means the comet has struck and the portals grow out of the scorch.
 * `revealedAt` is the simulation time of the first impact (set when the
 * phase flips to `revealed`); the wave system uses it to hold wave 1 until
 * the portals have settled on the ground.
 */
export type CometReveal = {
  run: number;
  phase: "armed" | "revealed";
  revealedAt?: number;
};

type LevelStoreState = {
  gridSize: number;
  waters: WaterBody[];
  canyons: CanyonConfig[];
  pathWaypoints: PathWaypoint[][];
  totalWaves: number;
  waveConfigs: WaveConfig[];
  /** Per-level boss definition (absent = no boss waves for this level). */
  boss: BossConfig | null;
  buildings: Building[];
  enemyWeights: Record<EnemyType, number> | null;
  money: number;

  enemiesKilled: number;
  currentWave: number;
  gridOffset: number;
  towers: Tower[];
  projectiles: Projectile[];
  isLevelConfigLoaded: boolean;
  /** Set when loading the level config failed; the UI shows an error with a retry. */
  levelLoadError: string | null;
  /** Bumped on retry to restart a failed level load. */
  levelLoadRetryToken: number;
  /**
   * The id of the level load currently in progress (a new run, a restart, or
   * the main menu loading its ambient level). Monotonic — it is never reset
   * by `resetLevelState` — so the scene's `CometStrike` orchestrator can tell
   * a fresh load from a stale one and every load gets a unique id (a restart
   * replays the comet reveal even on the same level).
   */
  levelEnterRun: number;
  /**
   * The in-flight (armed) or struck (revealed) comet for the current run, so
   * the scene's spawn portals know whether to hide (armed) or reveal. `null`
   * when no comet is active (rest). Keyed to the level's monotonic load id:
   * the scene's `CometStrike` orchestrator arms it on each load and `Path`
   * only applies a reveal whose `run` matches the level's id, so a stale
   * reveal left by a previous scene can never match a new scene's level and
   * no reset is needed on scene unmount. Also the recovery marker for the
   * mount-time catch-up (a scene that mounts after its level was already
   * loaded re-arms an in-flight or never-armed strike for the current run,
   * and never re-arms one that has completed).
   */
  cometReveal: CometReveal | null;
  hoveredTile: TileData | null;
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
  updateTower: (towerId: number, updates: Partial<Tower>) => void;
  removeProjectile: (projectileId: number) => void;
  resetLevelState: () => void;
  setHoveredTile: (tile: TileData | null) => void;
  setCometReveal: (reveal: CometReveal | null) => void;
  setLevelLoadError: (error: string | null) => void;
  retryLevelLoad: () => void;
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
  canyons: [],
  totalWaves: 0,
  enemyWeights: null,
  pathWaypoints: [],
  waveConfigs: [],
  boss: null,
  buildings: [],
  towers: [],
  projectiles: [],
  isLevelConfigLoaded: false,
  levelLoadError: null,
  levelLoadRetryToken: 0,
  levelEnterRun: 0,
  cometReveal: null,
  hoveredTile: null,
};

export const getMaxEntityId = (
  entities: ReadonlyArray<{ id: number }>
): number =>
  entities.reduce((currentMax, entity) => Math.max(currentMax, entity.id), 0);

export const useLevelStore = create<LevelStore>((set) => ({
  ...DEFAULT_STATE,

  initializeLevelState: (levelData: LevelConfigData, tileSize: number) => {
    const towerTypes = useGameStore.getState().towerTypes;
    const enemyTypes = useGameStore.getState().enemyTypes;
    const enemyUpgrades = useGameStore.getState().enemyUpgrades;

    if (!towerTypes || !enemyTypes || !enemyUpgrades) return;

    const {
      gridSize,
      pathWaypoints: rawPathWaypoints,
      enemies,
      towers,
      buildings,
      waters,
      startingMoney,
      waveConfigs,
      boss,
      projectiles,
      enemyWeights,
    } = levelData;

    const gridOffset = getLevelGridOffset(gridSize, tileSize);
    // Bake a bridge elevation into any path that crosses a canyon. This is the
    // single point of change: enemies (position.y = waypoint.y), tower aiming
    // (targetPathPos.y), and the path strip render (yBase + pathYOffset) all
    // read these waypoints, so they all follow the bridge height automatically.
    const pathWaypoints = buildCanyonBridgePaths(
      rawPathWaypoints,
      levelData.canyons ?? [],
      gridSize,
      tileSize
    );
    const actions = enemyActions(world);

    actions.clearAllEnemies();

    // The waypoints must be in the store before any enemy spawns: spawnEnemy
    // derives each enemy's initial facing (the direction along the path) from
    // them.
    set({ pathWaypoints });

    const levelEnemies = enemies.map((enemy) => ({
      ...enemyTypes[enemy.type],
      ...enemy,
      pathIndex: enemy.pathIndex ?? 0,
      maxHealth: enemy.health,
      upgradeStacks: enemy.upgradeStacks ?? getUpgradeStacks(enemy.upgrades),
    }));
    for (const enemy of levelEnemies) {
      actions.spawnEnemy(enemy);
    }

    // Only used if we have defined towers in the level config
    const levelTowers = towers.map((tower) => ({
      lastFireTime: 0,
      ...towerTypes[tower.type],
      ...tower,
    }));

    const levelBuildings = buildings.map((building) =>
      withRecalculatedBuildingCoordinates(building, gridSize, tileSize)
    );

    const levelWaters = waters.map((water) =>
      withRecalculatedWaterCoordinates(water, levelData.gridSize, tileSize)
    );

    // A fresh level load gets a unique id (the monotonic counter) and raises
    // the `LEVEL_ENTERED` event so the scene's `CometStrike` orchestrator —
    // which is subscribed for the whole time the scene is mounted — plays its
    // one-shot load comet. The event carries the portals' flat-field
    // positions; the scene maps them onto the planet surface itself.
    // Each spawn portal is a path's first waypoint; a path with no waypoints
    // (the schema allows an empty inner array) has no portal, so skip it rather
    // than index at `[0]`.
    const portalPositions = pathWaypoints
      .filter((path) => path.length > 0)
      .map((path) => ({ x: path[0].x, z: path[0].z }));

    // A fresh level load gets a unique id (the monotonic counter) and raises
    // the `LEVEL_ENTERED` event so the scene's `CometStrike` orchestrator —
    // which is subscribed for the whole time the scene is mounted — plays its
    // one-shot load comet. The event carries the portals' flat-field
    // positions; the scene maps them onto the planet surface itself. A scene
    // that mounts *after* this load (the game flow) re-arms the strike on
    // mount from `cometReveal` (a `null` or other-run armed reveal) and skips
    // one that has already completed.
    set((state) => ({
      isLevelConfigLoaded: true,
      enemiesKilled: 0,
      money: startingMoney,
      gridOffset,
      gridSize,
      pathWaypoints,
      waveConfigs,
      projectiles,
      waters: levelWaters,
      canyons: levelData.canyons ?? [],
      buildings: levelBuildings,
      towers: levelTowers,
      totalWaves: waveConfigs.length,
      boss: boss ?? null,
      enemyWeights: enemyWeights as Record<EnemyType, number>,
      levelEnterRun: state.levelEnterRun + 1,
    }));

    gameEvents.emit(GameEvent.LEVEL_ENTERED, {
      run: useLevelStore.getState().levelEnterRun,
      portalPositions,
    });
  },

  addMoney: (amount: number) => {
    if (amount <= 0) return;
    const money = useLevelStore.getState().money + amount;
    set({ money });
    gameEvents.emit(GameEvent.MONEY_CHANGED, {
      amount: money,
      direction: "increase",
    });
  },

  incrementEnemiesKilled: () => {
    set((state) => ({ enemiesKilled: state.enemiesKilled + 1 }));
  },

  spendMoney: (amount: number) => {
    const current = useLevelStore.getState().money;
    if (current < amount || amount <= 0) return;
    const money = current - amount;
    set({ money });
    gameEvents.emit(GameEvent.MONEY_CHANGED, {
      amount: money,
      direction: "decrease",
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

  updateTower: (towerId, updates) => {
    set((state) => ({
      towers: state.towers.map((tower) =>
        tower.id === towerId ? { ...tower, ...updates } : tower
      ),
    }));
  },

  setCurrentWave: (wave) => {
    set((state) => ({
      currentWave: typeof wave === "function" ? wave(state.currentWave) : wave,
    }));
  },

  setHoveredTile: (tile) => {
    set({ hoveredTile: tile });
  },

  setCometReveal: (reveal) => {
    set({ cometReveal: reveal });
  },

  setLevelLoadError: (error) => {
    set({ levelLoadError: error });
  },

  retryLevelLoad: () => {
    // Clearing the error re-arms the level system's load effect (it skips
    // when `levelLoadError` is set); the token bump covers the edge case of
    // retrying while the previous attempt is still in flight.
    set((state) => ({
      levelLoadError: null,
      levelLoadRetryToken: state.levelLoadRetryToken + 1,
    }));
  },

  removeProjectile: (projectileId: number) => {
    set((state) => ({
      projectiles: state.projectiles.filter((p) => p.id !== projectileId),
    }));
  },

  resetLevelState: () => {
    enemyActions(world).clearAllEnemies();
    // A splitter killed moments before the reset leaves a pending splitRequest
    // behind; clear it so the new level does not spawn its children.
    for (const entity of world.query(splitRequest)) {
      if (entity.isAlive()) entity.destroy();
    }
    set((state) => ({
      ...DEFAULT_STATE,
      // Keep the load id monotonic across resets so every (re)load gets a
      // unique id and a restart replays the comet reveal even on the same
      // level. (`cometReveal` is already `null` in the default state, so any
      // in-flight reveal is cleared automatically — and its `run` no longer
      // matches the next load, so a stale armed reveal can never leak into it.)
      levelEnterRun: state.levelEnterRun,
    }));
  },
}));

export const gridOffsetSelector = (state: LevelStore) => state.gridOffset;
export const gridSizeSelector = (state: LevelStore) => state.gridSize;
export const watersSelector = (state: LevelStore) => state.waters;
export const canyonsSelector = (state: LevelStore) => state.canyons;
export const pathWaypointsSelector = (state: LevelStore) => state.pathWaypoints;
export const totalWavesSelector = (state: LevelStore) => state.totalWaves;
export const waveConfigsSelector = (state: LevelStore) => state.waveConfigs;
export const bossSelector = (state: LevelStore) => state.boss;
export const buildingsSelector = (state: LevelStore) => state.buildings;
export const initializeLevelStateSelector = (state: LevelStore) =>
  state.initializeLevelState;
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
export const levelLoadErrorSelector = (state: LevelStore) => state.levelLoadError;
export const levelLoadRetryTokenSelector = (state: LevelStore) =>
  state.levelLoadRetryToken;
export const setLevelLoadErrorSelector = (state: LevelStore) =>
  state.setLevelLoadError;
export const retryLevelLoadSelector = (state: LevelStore) => state.retryLevelLoad;
export const spendMoneySelector = (state: LevelStore) => state.spendMoney;
export const addMoneySelector = (state: LevelStore) => state.addMoney;
export const setTowersSelector = (state: LevelStore) => state.setTowers;
export const updateTowerSelector = (state: LevelStore) => state.updateTower;
export const resetLevelStateSelector = (state: LevelStore) =>
  state.resetLevelState;
export const hoveredTileSelector = (state: LevelStore) => state.hoveredTile;
export const setHoveredTileSelector = (state: LevelStore) =>
  state.setHoveredTile;
export const levelEnterRunSelector = (state: LevelStore) => state.levelEnterRun;
export const cometRevealSelector = (state: LevelStore) => state.cometReveal;
export const setCometRevealSelector = (state: LevelStore) => state.setCometReveal;
export const enemyWeightsSelector = (state: LevelStore) => state.enemyWeights;
