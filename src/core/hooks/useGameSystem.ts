import { useCallback, useEffect, useLayoutEffect } from "react";
import { useActions } from "koota/react";

import { worldBaseActions } from "../ecs/actions/baseActions";
import { statsActions } from "../ecs/actions/statsActions";
import {
  getShouldStopMovement,
  shouldPauseForTabHidden,
} from "../getShouldStopMovement";
import {
  debugSelector,
  gameStatusSelector,
  initializeGameStateSelector,
  isGameConfigLoadedSelector,
  isPageVisibleSelector,
  previousStatusSelector,
  resetGameStateSelector,
  selectedTowerSelector,
  startNewRunSelector,
  setDebugSelector,
  setGameStatusSelector,
  setIsPageVisibleSelector,
  setPreviousStatusSelector,
  setSelectedTowerSelector,
  setShowSettingsSelector,
  useGameStore,
} from "../stores/useGameStore";
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
  const stats = useActions(statsActions);

  const gameStatus = useGameStore(gameStatusSelector);
  const previousStatus = useGameStore(previousStatusSelector);
  const selectedTower = useGameStore(selectedTowerSelector);
  const debug = useGameStore(debugSelector);
  const isGameConfigLoaded = useGameStore(isGameConfigLoadedSelector);
  const isPageVisible = useGameStore(isPageVisibleSelector);
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
  // The camera locks for the same states as the simulation, except paused —
  // while paused the frame is held but the player should still be able to
  // orbit and pan it to inspect the board.
  const shouldLockCamera =
    shouldDisableControls ||
    shouldPauseForTabHidden(isPageVisible, pauseWhenTabHidden);

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
    stats.startRunStats();
    const maxHealth = useGameStore.getState().startingHealth;
    spawnBase(maxHealth);
  }, [startNewRun, spawnBase, stats]);

  const goToMainMenu = useCallback(() => {
    stats.endRunStats();
    resetGameState();
    setGameStatus("menu");
  }, [resetGameState, setGameStatus, stats]);

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

  return {
    // State
    gameStatus,
    selectedTower,
    shouldDisableControls,
    shouldStopMovement,
    shouldLockCamera,
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
    toggleDebug,
  };
};

export type GameState = ReturnType<typeof useGameSystem>;
