import { useCallback, useEffect, useLayoutEffect } from "react";
import { useActions } from "koota/react";

import { worldBaseActions } from "../ecs/actions/baseActions";
import { getShouldStopMovement } from "../getShouldStopMovement";
import {
  activeEffectsSelector,
  debugSelector,
  gameStatusSelector,
  initializeGameStateSelector,
  isGameConfigLoadedSelector,
  isPageVisibleSelector,
  previousStatusSelector,
  resetGameStateSelector,
  selectedTowerSelector,
  startNewRunSelector,
  setActiveEffectsSelector,
  setDebugSelector,
  setGameStatusSelector,
  setIsPageVisibleSelector,
  setPreviousStatusSelector,
  setSelectedTowerSelector,
  setShowSettingsSelector,
  useGameStore,
} from "../stores/useGameStore";
import { useEntityIds } from "../contexts/EntityIdContext";
import { loadGameConfig } from "../configs/gameConfig";
import { getCanPause } from "../getCanPause";
import {
  pauseWhenTabHiddenSelector,
  useSettingsStore,
} from "../stores/useSettingsStore";
import { nextWaveReadySelector, useWaveStore } from "../stores/useWaveStore";
import { gameEvents } from "../../utils/eventEmitter";
import { GameEvent } from "../types/enums/events";

export const useGameSystem = () => {
  const { spawnBase } = useActions(worldBaseActions);

  const activeEffects = useGameStore(activeEffectsSelector);
  const gameStatus = useGameStore(gameStatusSelector);
  const previousStatus = useGameStore(previousStatusSelector);
  const selectedTower = useGameStore(selectedTowerSelector);
  const debug = useGameStore(debugSelector);
  const isGameConfigLoaded = useGameStore(isGameConfigLoadedSelector);
  const isPageVisible = useGameStore(isPageVisibleSelector);
  const setActiveEffects = useGameStore(setActiveEffectsSelector);
  const setGameStatus = useGameStore(setGameStatusSelector);
  const setPreviousStatus = useGameStore(setPreviousStatusSelector);
  const setSelectedTower = useGameStore(setSelectedTowerSelector);
  const setDebug = useGameStore(setDebugSelector);
  const resetGameState = useGameStore(resetGameStateSelector);
  const startNewRun = useGameStore(startNewRunSelector);
  const initializeGameState = useGameStore(initializeGameStateSelector);
  const setIsPageVisible = useGameStore(setIsPageVisibleSelector);
  const setShowSettings = useGameStore(setShowSettingsSelector);

  const pauseWhenTabHidden = useSettingsStore(pauseWhenTabHiddenSelector);
  const nextWaveReady = useWaveStore(nextWaveReadySelector);

  const { getNextEffectId } = useEntityIds();

  useLayoutEffect(() => {
    const onVisibilityChange = () => {
      setIsPageVisible(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [setIsPageVisible]);

  const shouldDisableControls =
    gameStatus === "gameOver" ||
    gameStatus === "won" ||
    gameStatus === "gameMenu";
  const shouldStopMovement = getShouldStopMovement(
    gameStatus,
    shouldDisableControls,
    isPageVisible,
    pauseWhenTabHidden
  );

  // Load game config
  useEffect(() => {
    if (isGameConfigLoaded) return;

    const loadConfig = async () => {
      const config = await loadGameConfig();
      initializeGameState(config);
    };

    loadConfig();
  }, [isGameConfigLoaded, initializeGameState]);

  const winGame = useCallback(() => {
    setGameStatus("won");
    gameEvents.emit(GameEvent.GAME_WON, { gameWonType: "win" });
  }, [setGameStatus]);

  const canPause = getCanPause(gameStatus, nextWaveReady);

  const pauseGame = useCallback(() => {
    if (gameStatus === "playing" && !canPause) {
      // Pausing is disabled while waiting for the next wave.
      return;
    }
    if (gameStatus === "playing") {
      setGameStatus("paused");
      gameEvents.emit(GameEvent.GAME_PAUSED, { gamePausedType: "pause" });
    } else if (gameStatus === "paused") {
      setGameStatus("playing");
      gameEvents.emit(GameEvent.GAME_RESUMED, { gameResumedType: "resume" });
    }
  }, [setGameStatus, gameStatus, canPause]);

  const startGame = useCallback(async () => {
    startNewRun();
    const maxHealth = useGameStore.getState().startingHealth;
    spawnBase(maxHealth);
  }, [startNewRun, spawnBase]);

  const goToMainMenu = useCallback(() => {
    resetGameState();
    setGameStatus("menu");
  }, [resetGameState, setGameStatus]);

  const openGameMenu = useCallback(() => {
    setShowSettings(false);
    setPreviousStatus(gameStatus);
    setGameStatus("gameMenu");
  }, [gameStatus, setGameStatus, setPreviousStatus, setShowSettings]);

  const closeGameMenu = useCallback(() => {
    setGameStatus(previousStatus ?? "playing");
  }, [setGameStatus, previousStatus]);

  const toggleDebug = useCallback(() => {
    setDebug(!debug);
  }, [debug, setDebug]);

  // TODO: Move to effects system
  const onSpawnEffect = useCallback(
    (position: [number, number, number], color: string) => {
      const effectId = getNextEffectId();
      setActiveEffects((prev) => [
        ...prev,
        { id: effectId, position, color, type: "spawn" },
      ]);
    },
    [setActiveEffects, getNextEffectId]
  );

  const onEndEffect = useCallback(
    (position: [number, number, number], color: string) => {
      const effectId = getNextEffectId();
      setActiveEffects((prev) => [
        ...prev,
        { id: effectId, position, color, type: "end" },
      ]);
    },
    [setActiveEffects, getNextEffectId]
  );

  const onEffectComplete = useCallback(
    (effectId: number) => {
      setActiveEffects((prev) =>
        prev.filter((effect) => effect.id !== effectId)
      );
    },
    [setActiveEffects]
  );

  return {
    // State
    gameStatus,
    selectedTower,
    activeEffects,
    shouldDisableControls,
    shouldStopMovement,
    canPause,
    debug,
    isGameConfigLoaded,

    // Actions
    winGame,
    pauseGame,
    startGame,
    goToMainMenu,
    openGameMenu,
    closeGameMenu,
    setSelectedTower,
    setActiveEffects,
    toggleDebug,
    onSpawnEffect,
    onEndEffect,
    onEffectComplete,
  };
};

export type GameState = ReturnType<typeof useGameSystem>;
