import { gameEvents } from "../../utils/eventEmitter";
import { getPlanetRadius } from "../../utils/planetSurfaceMapping";
import type { PlayableLevelId } from "../../constants/playableLevels";
import {
  loadLevelConfigFile,
  type LevelConfigData,
} from "../configs/levelConfig";
import { worldBaseActions } from "../ecs/actions/baseActions";
import { enemyActions } from "../ecs/actions/enemyActions";
import { statsActions } from "../ecs/actions/statsActions";
import { runApplyEffectSystem } from "../ecs/systems/applyEffectSystem";
import { runDamageSystem } from "../ecs/systems/damageSystem";
import { runEnemyDeathSystem } from "../ecs/systems/enemyDeathSystem";
import { runEnemyMovementSystem } from "../ecs/systems/enemyMovementSystem";
import { runEnemySplitSystem } from "../ecs/systems/enemySplitSystem";
import { runBaseDefeatSystem } from "../ecs/systems/gameProcessSystem";
import { runMedicHealPulseSystem } from "../ecs/systems/medicHealPulseSystem";
import { runSlowSystem } from "../ecs/systems/slowSystem";
import { runStatsSystem } from "../ecs/systems/statsSystem";
import { isBase, requestBaseDefeat } from "../ecs/traits/base";
import { IsEffect, spawnEffectRequest } from "../ecs/traits/effect";
import { isDead } from "../ecs/traits/health";
import { IsStats, RunEnded } from "../ecs/traits/stats";
import { useGameStore } from "../stores/useGameStore";
import { useLevelStore } from "../stores/useLevelStore";
import { useUpgradeStore } from "../stores/useUpgradeStore";
import { useWaveStore } from "../stores/useWaveStore";
import { GameEvent } from "../types/enums/events";
import { runSimulationPipeline } from "./simulationPipeline";
import { createTowerCombatSystem } from "./towerCombatSystem";
import type {
  GameSessionController,
  GameSessionDependencies,
  GameSessionRuntime,
  SimulationFrame,
} from "./types";
import { createWaveSystem } from "./waveSystem";

const noop = () => undefined;

export const createGameSession = ({
  world,
  getNextTowerId,
  getNextEnemyId,
  ensureEnemyIdAtLeast,
  getNextProjectileId,
  loadLevel = loadLevelConfigFile,
}: GameSessionDependencies): GameSessionController => {
  let currentLevelId: PlayableLevelId | null = null;
  let loadGeneration = 0;
  let isRunStarting = false;
  let runtime: GameSessionRuntime = {
    fireProjectile: (projectile) => ({ ...projectile, id: -1 }),
    updateProjectiles: noop,
    clearProjectiles: noop,
  };

  const winGame = () => {
    useGameStore.getState().setGameStatus("won");
    statsActions(world).markRunEnded();
    gameEvents.emit(GameEvent.GAME_WON, { gameWonType: "win" });
  };
  const waves = createWaveSystem({ world, getNextEnemyId, winGame });
  const towerCombat = createTowerCombatSystem(world, (projectile) =>
    runtime.fireProjectile(projectile)
  );

  const clearRunState = () => {
    runtime.clearProjectiles();
    towerCombat.reset();
    waves.reset();
    useLevelStore.getState().resetLevelState();
    getNextTowerId(true);
    getNextEnemyId(true);
    getNextProjectileId(true);
    useUpgradeStore.getState().resetLevelEnemyUpgrades();
    useWaveStore.getState().setNextWaveReady(true);
    worldBaseActions(world).removeBase();

    for (const entity of world.query(IsEffect)) {
      entity.destroy();
    }
    for (const entity of world.query(spawnEffectRequest)) {
      entity.destroy();
    }
  };

  const startRun = async (levelId: PlayableLevelId): Promise<void> => {
    const generation = ++loadGeneration;
    const loadStarted = loadLevel(levelId);

    // Flip the run state before the level load settles. The scene (and its
    // camera) mounts on gameStatus "playing", so the camera's first frames run
    // against the reset level store, exactly like the in-scene level load did
    // before this refactor. Awaiting the load first would let the camera mount
    // against the already-populated store and change its framing.
    clearRunState();
    isRunStarting = true;
    useGameStore.getState().startNewRun();

    let levelData: LevelConfigData;
    try {
      levelData = await loadStarted;
    } catch (error) {
      if (generation !== loadGeneration) return;
      // The load failed after the scene was already mounted; fall back to the
      // menu instead of stranding the player in an empty game.
      isRunStarting = false;
      currentLevelId = null;
      statsActions(world).endRunStats();
      useGameStore.getState().resetGameState();
      useGameStore.getState().setGameStatus("menu");
      throw error;
    }
    if (generation !== loadGeneration) return;

    const { tileSize } = useGameStore.getState();
    if (tileSize <= 0) {
      isRunStarting = false;
      currentLevelId = null;
      useLevelStore.getState().resetLevelState();
      useGameStore.getState().resetGameState();
      useGameStore.getState().setGameStatus("menu");
      throw new Error("Cannot start a run before the game config is loaded.");
    }

    isRunStarting = false;
    currentLevelId = levelId;
    statsActions(world).startRunStats();
    useLevelStore.getState().initializeLevelState(levelData, tileSize);
    ensureEnemyIdAtLeast(
      levelData.enemies.reduce((maxId, enemy) => Math.max(maxId, enemy.id), 0) +
        1
    );
    worldBaseActions(world).spawnBase(levelData.startingHealth);
  };

  const restartRun = async (): Promise<void> => {
    if (!currentLevelId) return;
    await startRun(currentLevelId);
  };

  const endRun = () => {
    loadGeneration += 1;
    currentLevelId = null;
    isRunStarting = false;
    clearRunState();
    statsActions(world).endRunStats();
    useGameStore.getState().resetGameState();
    useGameStore.getState().setGameStatus("menu");
  };

  const dispose = () => {
    loadGeneration += 1;
    isRunStarting = false;
    currentLevelId = null;
  };

  const foldStats = () => {
    runStatsSystem(world);
    for (const entity of world.query(IsStats, RunEnded)) {
      entity.remove(RunEnded);
    }
  };

  const systems = {
    applySlow: (time: number) => runSlowSystem(world, time),
    applyEffects: () => runApplyEffectSystem(world),
    settleEnemyDeaths: () => runEnemyDeathSystem(world),
    splitEnemies: () => runEnemySplitSystem(world, getNextEnemyId),
    moveEnemies: (frame: SimulationFrame) => {
      const { pathWaypoints, gridSize } = useLevelStore.getState();
      const { tileSize } = useGameStore.getState();
      runEnemyMovementSystem(
        world,
        frame.deltaSeconds,
        frame.simulationTimeSeconds,
        {
          pathWaypoints,
          radius: getPlanetRadius(gridSize, tileSize),
          onEnemyReachEnd: (enemyId) =>
            enemyActions(world).removeEnemy(enemyId, true),
          canFinish: frame.canResolveGameplay,
        }
      );
    },
    healEnemies: (time: number) => runMedicHealPulseSystem(world, time),
    fireTowers: towerCombat.tick,
    updateProjectiles: (frame: SimulationFrame) =>
      runtime.updateProjectiles(frame),
    updateWaves: waves.tick,
    resolveBaseDefeat: () => runBaseDefeatSystem(world),
    applyDamage: () => runDamageSystem(world),
    requestBaseDefeat: () => {
      const base = world.queryFirst(isBase, isDead);
      if (base && !base.has(requestBaseDefeat)) base.add(requestBaseDefeat);
    },
    foldStats,
  };

  const tick = (frame: SimulationFrame) => {
    runSimulationPipeline(frame, systems);
  };

  const connectRuntime = (nextRuntime: GameSessionRuntime) => {
    runtime = nextRuntime;
    return () => {
      if (runtime === nextRuntime) {
        runtime = {
          fireProjectile: (projectile) => ({ ...projectile, id: -1 }),
          updateProjectiles: noop,
          clearProjectiles: noop,
        };
      }
    };
  };

  return {
    startRun,
    restartRun,
    endRun,
    tick,
    startWave: waves.startWave,
    getRemainingEnemiesInWave: waves.getRemainingEnemiesInWave,
    get isRunStarting() {
      return isRunStarting;
    },
    dispose,
    connectRuntime,
    registerTurretNode: towerCombat.registerTurretNode,
  };
};
