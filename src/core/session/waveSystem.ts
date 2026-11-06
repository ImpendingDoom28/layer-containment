import type { World } from "koota";

import { gameEvents } from "../../utils/eventEmitter";
import {
  applyEnemyUpgradeCounts,
  buildWaveSpawnQueue,
} from "../../utils/waveEnemyCounts";
import { enemyActions } from "../ecs/actions/enemyActions";
import { spawnLevelEnemy } from "../ecs/spawnLevelEnemy";
import { useGameStore } from "../stores/useGameStore";
import { useLevelStore } from "../stores/useLevelStore";
import { useUpgradeStore } from "../stores/useUpgradeStore";
import { useWaveStore } from "../stores/useWaveStore";
import { GameEvent } from "../types/enums/events";
import type { EnemyType, EnemyUpgradeId } from "../types/game";
import type { SimulationFrame } from "./types";

type SpawnQueueItem = {
  type: EnemyType;
  delaySeconds: number;
  upgrades: EnemyUpgradeId[];
  pathIndex?: number;
};

export type WaveSystem = {
  startWave: () => void;
  tick: (frame: SimulationFrame) => void;
  getRemainingEnemiesInWave: () => number;
  reset: () => void;
};

type WaveSystemDependencies = {
  world: World;
  getNextEnemyId: () => number;
  winGame: () => void;
};

export const createWaveSystem = ({
  world,
  getNextEnemyId,
  winGame,
}: WaveSystemDependencies): WaveSystem => {
  let spawnQueue: SpawnQueueItem[] = [];
  let spawnQueueIndex = 0;
  let waveStartedAt: number | null = null;
  let waveStarted = false;
  let initializedWave = 0;

  const getRemainingEnemyCount = () =>
    enemyActions(world).getRemainingEnemyCount();

  const reset = () => {
    spawnQueue = [];
    spawnQueueIndex = 0;
    waveStartedAt = null;
    waveStarted = false;
    initializedWave = 0;
  };

  const initializeWave = (currentWave: number) => {
    initializedWave = currentWave;
    spawnQueue = [];
    spawnQueueIndex = 0;
    waveStartedAt = null;
    waveStarted = false;

    const { totalWaves, waveConfigs, pathWaypoints } = useLevelStore.getState();
    if (currentWave <= 0 || currentWave > totalWaves) return;

    const waveConfig = waveConfigs[currentWave - 1];
    if (!waveConfig) return;

    const waveUpgrades = [...useUpgradeStore.getState().levelEnemyUpgradeStack];
    const availableEnemyTypes = applyEnemyUpgradeCounts(
      waveConfig.enemies,
      waveUpgrades,
      useGameStore.getState().enemyUpgrades,
      waveConfig.totalEnemies
    ).groups;

    spawnQueue = buildWaveSpawnQueue(
      availableEnemyTypes,
      pathWaypoints.length
    ).map((item) => ({
      ...item,
      delaySeconds: item.delay / 1000,
      upgrades: waveUpgrades,
    }));
  };

  const syncWave = () => {
    const currentWave = useLevelStore.getState().currentWave;
    if (currentWave !== initializedWave) initializeWave(currentWave);
    return currentWave;
  };

  const startWave = () => {
    const { currentWave, totalWaves, pathWaypoints } = useLevelStore.getState();
    if (currentWave >= totalWaves) return;
    if (currentWave > 0) {
      // A wave that has started but not yet finished its completion delay must
      // not be replaced: doing so would reset `waveStarted` and skip the
      // upgrade gate / win that runs when the delay elapses.
      if (waveStarted) return;
      if (spawnQueueIndex < spawnQueue.length) return;
      if (getRemainingEnemyCount() > 0) return;
    }

    const nextWave = currentWave + 1;
    useWaveStore.getState().setNextWaveReady(false);
    useLevelStore.getState().setCurrentWave(nextWave);
    initializeWave(nextWave);

    const waypoint = pathWaypoints[0]?.[0];
    gameEvents.emit(GameEvent.WAVE_STARTED, {
      waveNumber: nextWave,
      worldPosition: waypoint
        ? { x: waypoint.x, y: waypoint.y, z: waypoint.z }
        : { x: 0, y: 0, z: 0 },
    });
  };

  const tick = (frame: SimulationFrame) => {
    if (!frame.canResolveGameplay) return;
    if (useGameStore.getState().gameStatus !== "playing") return;

    const currentWave = syncWave();
    const { totalWaves } = useLevelStore.getState();
    // A cleared wave is only "ready" for the next one once its completion
    // delay has run (i.e. `waveStarted` has been cleared). While the delay is
    // pending, the player must not be offered the next wave — starting it
    // would skip the upgrade gate / win above.
    const waveCleared =
      spawnQueueIndex >= spawnQueue.length &&
      getRemainingEnemyCount() === 0 &&
      !waveStarted;
    const nextWaveReady =
      currentWave === 0 || (currentWave < totalWaves && waveCleared);
    if (useWaveStore.getState().nextWaveReady !== nextWaveReady) {
      useWaveStore.getState().setNextWaveReady(nextWaveReady);
    }

    if (currentWave === 0 || currentWave > totalWaves) return;

    if (spawnQueueIndex >= spawnQueue.length) {
      if (waveStarted && getRemainingEnemyCount() === 0) {
        if (
          waveStartedAt !== null &&
          frame.simulationTimeSeconds - waveStartedAt > 0.3
        ) {
          waveStarted = false;
          if (currentWave < totalWaves) {
            const enemyUpgrades = useGameStore.getState().enemyUpgrades;
            if (enemyUpgrades && Object.keys(enemyUpgrades).length > 0) {
              useUpgradeStore
                .getState()
                .openEnemyUpgradeGate(
                  Object.keys(enemyUpgrades) as EnemyUpgradeId[]
                );
            }
          } else {
            winGame();
          }
        }
      }
      return;
    }

    if (waveStartedAt === null) {
      waveStartedAt = frame.simulationTimeSeconds;
      waveStarted = true;
    }

    const nextSpawn = spawnQueue[spawnQueueIndex];
    const timeSinceWaveStart = frame.simulationTimeSeconds - waveStartedAt;
    if (nextSpawn && timeSinceWaveStart >= nextSpawn.delaySeconds) {
      spawnLevelEnemy(
        world,
        getNextEnemyId,
        nextSpawn.type,
        nextSpawn.upgrades,
        nextSpawn.pathIndex
      );
      spawnQueueIndex += 1;
    }
  };

  const getRemainingEnemiesInWave = () => {
    const { currentWave, totalWaves } = useLevelStore.getState();
    if (currentWave === 0 || currentWave > totalWaves) return 0;
    return spawnQueue.length - spawnQueueIndex + getRemainingEnemyCount();
  };

  return { startWave, tick, getRemainingEnemiesInWave, reset };
};
