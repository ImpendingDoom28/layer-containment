import { useCallback, useRef, useEffect, useLayoutEffect } from "react";
import { useActions } from "koota/react";

import type {
  EnemyType,
  EnemyUpgradeId,
  GameStatus,
} from "../types/game";
import type { GameState } from "./useGameSystem";
import {
  totalWavesSelector,
  useLevelStore,
  waveConfigsSelector,
  setCurrentWaveSelector,
  currentWaveSelector,
  pathWaypointsSelector,
} from "../stores/useLevelStore";
import { useGameStore, isPageVisibleSelector } from "../stores/useGameStore";
import {
  useSettingsStore,
  pauseWhenTabHiddenSelector,
} from "../stores/useSettingsStore";
import { shouldPauseForTabHidden } from "../getShouldStopMovement";
import { useLevelSystem } from "./useLevelSystem";
import { useUpgradeStore } from "../stores/useUpgradeStore";
import { useWaveStore } from "../stores/useWaveStore";
import { GameEvent } from "../types/enums/events";
import { gameEvents } from "../../utils/eventEmitter";
import {
  applyEnemyUpgradeCounts,
  buildWaveSpawnQueue,
} from "../../utils/waveEnemyCounts";
import { enemyActions } from "../ecs/actions/enemyActions";

type SpawnQueueItem = {
  type: EnemyType;
  delay: number;
  upgrades: EnemyUpgradeId[];
};

export const useWaveSystem = (gameState: GameState) => {
  const { winGame, gameStatus: initialGameStatus } = gameState;
  const isPageVisible = useGameStore(isPageVisibleSelector);
  const pauseWhenTabHidden = useSettingsStore(pauseWhenTabHiddenSelector);
  const getLivingEnemyCount = useActions(enemyActions).getLivingEnemyCount;

  const totalWaves = useLevelStore(totalWavesSelector);
  const waveConfigs = useLevelStore(waveConfigsSelector);
  const setCurrentWave = useLevelStore(setCurrentWaveSelector);
  const currentWave = useLevelStore(currentWaveSelector);
  const pathWaypoints = useLevelStore(pathWaypointsSelector);
  const { addEnemy } = useLevelSystem();

  const spawnQueueRef = useRef<SpawnQueueItem[]>([]);
  const spawnQueueIndexRef = useRef<number>(0);
  const lastSpawnTimeRef = useRef<number>(0);
  const waveStartedRef = useRef<boolean>(false);
  const lastInitializedWaveRef = useRef<number>(0);
  const totalPauseDurationRef = useRef<number>(0);
  const previousGameStatusRef = useRef<GameStatus>(initialGameStatus);
  const lastPlayingTimeRef = useRef<number>(0);
  const previousIsPageVisibleRef = useRef(
    !shouldPauseForTabHidden(isPageVisible, pauseWhenTabHidden)
  );
  const prevIsPageVisibleForLayoutRef = useRef(
    shouldPauseForTabHidden(isPageVisible, pauseWhenTabHidden)
  );

  useLayoutEffect(() => {
    const isTabHiddenPaused = shouldPauseForTabHidden(
      isPageVisible,
      pauseWhenTabHidden
    );

    if (!isTabHiddenPaused && prevIsPageVisibleForLayoutRef.current) {
      previousIsPageVisibleRef.current = false;
    }
    prevIsPageVisibleForLayoutRef.current = isTabHiddenPaused;
  }, [isPageVisible, pauseWhenTabHidden]);

  useEffect(() => {
    if (currentWave === 0) {
      lastInitializedWaveRef.current = 0;
      return;
    }
    if (currentWave > totalWaves) {
      return;
    }

    if (lastInitializedWaveRef.current === currentWave) {
      return;
    }

    lastInitializedWaveRef.current = currentWave;
    waveStartedRef.current = false;
    spawnQueueRef.current = [];
    spawnQueueIndexRef.current = 0;
    lastSpawnTimeRef.current = 0;

    const waveUpgrades = [...useUpgradeStore.getState().levelEnemyUpgradeStack];

    const currentWaveIndex = currentWave - 1;
    const waveConfig = waveConfigs[currentWaveIndex];
    if (!waveConfig) return;

    // Reinforcements scales the per-group counts *and* the spawn cap, so a
    // cap-bound wave still grows with the upgrade; what remains is exactly the
    // groups the spawn queue will drain (in the same order).
    const enemyUpgrades = useGameStore.getState().enemyUpgrades;
    const availableEnemyTypes = applyEnemyUpgradeCounts(
      waveConfig.enemies,
      waveUpgrades,
      enemyUpgrades,
      waveConfig.totalEnemies
    ).groups;
    const spawnQueue: SpawnQueueItem[] = buildWaveSpawnQueue(
      availableEnemyTypes
    ).map((item) => ({ ...item, upgrades: waveUpgrades }));

    spawnQueueRef.current = spawnQueue;
    totalPauseDurationRef.current = 0;
  }, [currentWave, totalWaves, waveConfigs]);

  const startNextWave = useCallback(() => {
    const setNextWaveReady = useWaveStore.getState().setNextWaveReady;
    setCurrentWave((prev) => {
      const newWave = prev + 1;
      const wp = pathWaypoints[0]?.[0];
      const worldPosition = wp
        ? { x: wp.x, y: wp.y, z: wp.z }
        : { x: 0, y: 0, z: 0 };
      gameEvents.emit(GameEvent.WAVE_STARTED, {
        waveNumber: newWave,
        worldPosition,
      });
      setNextWaveReady(false);
      return newWave;
    });
  }, [setCurrentWave, pathWaypoints]);

  /**
   * Starts the next wave when the previous one has fully finished (spawn
   * queue exhausted and all enemies cleared). Waves never start
   * automatically: the player decides when they are ready.
   */
  const startWave = useCallback(() => {
    if (currentWave >= totalWaves) return;
    if (currentWave > 0) {
      if (spawnQueueIndexRef.current < spawnQueueRef.current.length) return;
      if (getLivingEnemyCount() > 0) return;
    }
    startNextWave();
  }, [currentWave, totalWaves, startNextWave, getLivingEnemyCount]);

  const updateWaveSpawning = useCallback(
    (currentTime: number) => {
      const { gameStatus, isPageVisible } = useGameStore.getState();
      const isTabHiddenPaused = shouldPauseForTabHidden(
        isPageVisible,
        useSettingsStore.getState().pauseWhenTabHidden
      );
      const wasSimulationActive =
        previousGameStatusRef.current === "playing" &&
        previousIsPageVisibleRef.current;
      const isSimulationActive = gameStatus === "playing" && !isTabHiddenPaused;

      if (
        !wasSimulationActive &&
        isSimulationActive &&
        lastPlayingTimeRef.current > 0
      ) {
        const pauseDuration = currentTime - lastPlayingTimeRef.current;
        totalPauseDurationRef.current += pauseDuration;
      }

      previousGameStatusRef.current = gameStatus;
      previousIsPageVisibleRef.current = !isTabHiddenPaused;

      if (gameStatus !== "playing" || isTabHiddenPaused) {
        return;
      }

      lastPlayingTimeRef.current = currentTime;

      const waveCleared =
        spawnQueueIndexRef.current >= spawnQueueRef.current.length &&
        getLivingEnemyCount() === 0;
      const nextWaveReady =
        currentWave === 0 || (currentWave < totalWaves && waveCleared);
      if (useWaveStore.getState().nextWaveReady !== nextWaveReady) {
        useWaveStore.getState().setNextWaveReady(nextWaveReady);
      }

      if (currentWave === 0 || currentWave > totalWaves) return;

      if (spawnQueueIndexRef.current >= spawnQueueRef.current.length) {
        if (waveStartedRef.current && getLivingEnemyCount() === 0) {
          waveStartedRef.current = false;
          if (currentTime - lastSpawnTimeRef.current > 300) {
            if (currentWave < totalWaves) {
              const enemyUpgrades = useGameStore.getState().enemyUpgrades;
              if (enemyUpgrades && Object.keys(enemyUpgrades).length > 0) {
                const ids = Object.keys(enemyUpgrades) as EnemyUpgradeId[];
                useUpgradeStore.getState().openEnemyUpgradeGate(ids);
              }
            } else {
              winGame();
            }
          }
        }
        return;
      }

      if (lastSpawnTimeRef.current === 0) {
        lastSpawnTimeRef.current = currentTime;
        waveStartedRef.current = true;
        totalPauseDurationRef.current = 0;
      }

      const nextSpawn = spawnQueueRef.current[spawnQueueIndexRef.current];
      const timeSinceWaveStart =
        currentTime - lastSpawnTimeRef.current - totalPauseDurationRef.current;

      if (nextSpawn && timeSinceWaveStart >= nextSpawn.delay) {
        addEnemy(nextSpawn.type, nextSpawn.upgrades);
        spawnQueueIndexRef.current += 1;
      }
    },
    [currentWave, totalWaves, winGame, addEnemy, getLivingEnemyCount]
  );

  const getRemainingEnemiesInWave = useCallback((): number => {
    if (currentWave === 0 || currentWave > totalWaves) return 0;
    return (
      spawnQueueRef.current.length -
      spawnQueueIndexRef.current +
      getLivingEnemyCount()
    );
  }, [currentWave, totalWaves, getLivingEnemyCount]);

  return {
    updateWaveSpawning,
    startWave,
    getRemainingEnemiesInWave,
  };
};

export type WaveSystem = ReturnType<typeof useWaveSystem>;
