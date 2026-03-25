import { useCallback, useRef, useEffect } from "react";

import { useWaveStore } from "../stores/useWaveStore";
import type {
  EnemyType,
  EnemyUpgradeId,
  WaveEnemyGroup,
  GameStatus,
} from "../types/game";
import type { GameState } from "./useGameSystem";
import {
  totalWavesSelector,
  useLevelStore,
  waveConfigsSelector,
  enemiesSelector,
  setCurrentWaveSelector,
  currentWaveSelector,
  pathWaypointsSelector,
} from "../stores/useLevelStore";
import { useGameStore, waveDelaySelector } from "../stores/useGameStore";
import { useLevelSystem } from "./useLevelSystem";
import {
  selectedUpgradesSelector,
  useUpgradeStore,
} from "../stores/useUpgradeStore";
import { GameEvent } from "../types/enums/events";
import { gameEvents } from "../../utils/eventEmitter";

type SpawnQueueItem = {
  type: EnemyType;
  delay: number;
  upgrades: EnemyUpgradeId[];
};

/**
 * Selects an enemy type from available enemy groups using weighted random selection.
 * The weight is based on the remaining count of each enemy type.
 * @param availableEnemies Array of enemy groups with their remaining counts
 * @returns The selected enemy group, or null if no enemies are available
 */
const selectWeightedEnemy = (
  availableEnemies: WaveEnemyGroup[]
): WaveEnemyGroup | null => {
  if (availableEnemies.length === 0) return null;
  if (availableEnemies.length === 1) return availableEnemies[0];

  const totalWeight = availableEnemies.reduce(
    (sum, enemy) => sum + enemy.count,
    0
  );

  if (totalWeight === 0) return null;

  const random = Math.random() * totalWeight;

  let cumulativeWeight = 0;
  for (const enemy of availableEnemies) {
    cumulativeWeight += enemy.count;
    if (random < cumulativeWeight) {
      return enemy;
    }
  }

  return availableEnemies[availableEnemies.length - 1];
};

export const useWaveSystem = (gameState: GameState) => {
  const { winGame, gameStatus } = gameState;
  const waveDelay = useGameStore(waveDelaySelector);

  const totalWaves = useLevelStore(totalWavesSelector);
  const waveConfigs = useLevelStore(waveConfigsSelector);
  const enemies = useLevelStore(enemiesSelector);
  const setCurrentWave = useLevelStore(setCurrentWaveSelector);
  const currentWave = useLevelStore(currentWaveSelector);
  const pathWaypoints = useLevelStore(pathWaypointsSelector);
  const { addEnemy } = useLevelSystem();

  const { timeUntilNextWave, setTimeUntilNextWave } = useWaveStore();
  const selectedUpgrades = useUpgradeStore(selectedUpgradesSelector);
  const clearUpgrades = useUpgradeStore((state) => state.clearUpgrades);

  const spawnQueueRef = useRef<SpawnQueueItem[]>([]);
  const spawnQueueIndexRef = useRef<number>(0);
  const lastSpawnTimeRef = useRef<number>(0);
  const waveStartedRef = useRef<boolean>(false);
  const lastInitializedWaveRef = useRef<number>(0);
  const totalPauseDurationRef = useRef<number>(0);
  const previousGameStatusRef = useRef<GameStatus>(gameStatus);
  const lastPlayingTimeRef = useRef<number>(0);
  const waveEndTimeRef = useRef<number>(0);
  const countdownPauseDurationRef = useRef<number>(0);
  const lastCountdownPlayingTimeRef = useRef<number>(0);
  const isCountingDownRef = useRef<boolean>(false);
  const timeUntilNextWaveRef = useRef<number | null>(null);

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
    isCountingDownRef.current = false;
    waveEndTimeRef.current = 0;
    countdownPauseDurationRef.current = 0;
    lastCountdownPlayingTimeRef.current = 0;
    timeUntilNextWaveRef.current = null;

    const waveUpgrades = [...selectedUpgrades];
    clearUpgrades();

    const currentWaveIndex = currentWave - 1;
    const waveConfig = waveConfigs[currentWaveIndex];
    if (!waveConfig) return;

    const availableEnemyTypes: WaveEnemyGroup[] = waveConfig.enemies.map(
      (enemy) => ({
        ...enemy,
        count: enemy.count,
      })
    );
    const spawnQueue: SpawnQueueItem[] = [];
    let remainingEnemyCount = 0;
    let cumulativeDelay = 0;

    for (const enemy of availableEnemyTypes) {
      remainingEnemyCount += enemy.count;
    }

    const totalEnemiesToQueue = Math.min(
      waveConfig.totalEnemies,
      remainingEnemyCount
    );

    for (
      let i = 0;
      i < totalEnemiesToQueue && remainingEnemyCount > 0;
      i++
    ) {
      const chosenEnemy = selectWeightedEnemy(availableEnemyTypes);
      if (!chosenEnemy) break;

      spawnQueue.push({
        type: chosenEnemy.type,
        delay: cumulativeDelay,
        upgrades: waveUpgrades,
      });

      cumulativeDelay += chosenEnemy.spawnInterval * 1000;
      chosenEnemy.count -= 1;
      remainingEnemyCount -= 1;
    }

    spawnQueueRef.current = spawnQueue;
    totalPauseDurationRef.current = 0;
  }, [currentWave, totalWaves, waveConfigs, selectedUpgrades, clearUpgrades]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeUntilNextWave(timeUntilNextWaveRef.current);
    }, 100);

    return () => clearInterval(interval);
  }, [setTimeUntilNextWave]);

  const startNextWave = useCallback(() => {
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
      return newWave;
    });
  }, [setCurrentWave, pathWaypoints]);

  const startFirstWave = useCallback(() => {
    if (currentWave === 0) {
      startNextWave();
    }
  }, [currentWave, startNextWave]);

  const startNextWaveEarly = useCallback(() => {
    if (
      isCountingDownRef.current &&
      currentWave > 0 &&
      currentWave < totalWaves
    ) {
      isCountingDownRef.current = false;
      waveEndTimeRef.current = 0;
      countdownPauseDurationRef.current = 0;
      lastCountdownPlayingTimeRef.current = 0;
      timeUntilNextWaveRef.current = null;
      startNextWave();
    }
  }, [currentWave, startNextWave, totalWaves]);

  const updateWaveSpawning = useCallback(
    (currentTime: number) => {
      const wasPaused =
        previousGameStatusRef.current === "paused" ||
        previousGameStatusRef.current === "gameMenu";
      const isPlaying = gameStatus === "playing";

      if (wasPaused && isPlaying && lastPlayingTimeRef.current > 0) {
        const pauseDuration = currentTime - lastPlayingTimeRef.current;
        totalPauseDurationRef.current += pauseDuration;
      }

      if (isCountingDownRef.current) {
        const wasCountdownPaused =
          previousGameStatusRef.current === "paused" ||
          previousGameStatusRef.current === "gameMenu";

        if (
          wasCountdownPaused &&
          isPlaying &&
          lastCountdownPlayingTimeRef.current > 0
        ) {
          const pauseDuration =
            currentTime - lastCountdownPlayingTimeRef.current;
          countdownPauseDurationRef.current += pauseDuration;
        }

        if (isPlaying) {
          lastCountdownPlayingTimeRef.current = currentTime;
        }

        if (currentWave > 0 && currentWave < totalWaves) {
          if (isPlaying) {
            const elapsedSinceWaveEnd =
              currentTime -
              waveEndTimeRef.current -
              countdownPauseDurationRef.current;
            const remaining = waveDelay - elapsedSinceWaveEnd;

            if (remaining <= 0) {
              isCountingDownRef.current = false;
              waveEndTimeRef.current = 0;
              countdownPauseDurationRef.current = 0;
              lastCountdownPlayingTimeRef.current = 0;
              timeUntilNextWaveRef.current = null;
              startNextWave();
              return;
            } else {
              timeUntilNextWaveRef.current = remaining;
            }
          } else {
            const elapsedSinceWaveEnd =
              lastCountdownPlayingTimeRef.current -
              waveEndTimeRef.current -
              countdownPauseDurationRef.current;
            const remaining = waveDelay - elapsedSinceWaveEnd;
            timeUntilNextWaveRef.current = remaining > 0 ? remaining : null;
          }
        } else {
          timeUntilNextWaveRef.current = null;
        }
      } else {
        timeUntilNextWaveRef.current = null;
      }

      previousGameStatusRef.current = gameStatus;

      if (gameStatus !== "playing") {
        return;
      }

      lastPlayingTimeRef.current = currentTime;

      if (currentWave === 0 || currentWave > totalWaves) return;

      if (spawnQueueIndexRef.current >= spawnQueueRef.current.length) {
        if (waveStartedRef.current && enemies.length === 0) {
          waveStartedRef.current = false;
          if (currentTime - lastSpawnTimeRef.current > 300) {
            if (currentWave < totalWaves) {
              isCountingDownRef.current = true;
              waveEndTimeRef.current = currentTime;
              countdownPauseDurationRef.current = 0;
              lastCountdownPlayingTimeRef.current = currentTime;
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
    [
      gameStatus,
      currentWave,
      totalWaves,
      waveDelay,
      startNextWave,
      enemies.length,
      winGame,
      addEnemy,
    ]
  );

  const getRemainingEnemiesInWave = useCallback((): number => {
    if (currentWave === 0 || currentWave > totalWaves) return 0;
    return (
      spawnQueueRef.current.length - spawnQueueIndexRef.current + enemies.length
    );
  }, [currentWave, enemies.length, totalWaves]);

  return {
    updateWaveSpawning,
    startFirstWave,
    getRemainingEnemiesInWave,
    timeUntilNextWave,
    startNextWaveEarly,
  };
};

export type WaveSystem = ReturnType<typeof useWaveSystem>;
