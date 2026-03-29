import { useCallback, useRef, useEffect, useLayoutEffect } from "react";

import { getShouldStopMovement } from "../getShouldStopMovement";
import { useGameStore } from "../stores/useGameStore";
import { useEntityIds } from "../contexts/EntityIdContext";
import { GameStatus } from "../types/game";
import { loadGameConfig } from "../gameConfig";
import { gameEvents } from "../../utils/eventEmitter";
import { GameEvent } from "../types/enums/events";

export const useGameSystem = () => {
  const {
    health,
    activeEffects,
    gameStatus,
    previousStatus,
    selectedTowerType,
    selectedTower,
    debug,
    isGameConfigLoaded,

    setActiveEffects,
    setGameStatus,
    setPreviousStatus,
    setSelectedTowerType,
    setSelectedTower,
    setDebug,
    resetGameState,
    initializeGameState,
    isPageVisible,
    setIsPageVisible,
  } = useGameStore();

  const { getNextEffectId } = useEntityIds();

  const previousGameStatusRef = useRef<GameStatus>(gameStatus);

  useLayoutEffect(() => {
    const onVisibilityChange = () => {
      setIsPageVisible(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [setIsPageVisible]);

  const shouldDisableControls =
    gameStatus === "gameOver" ||
    gameStatus === "won" ||
    gameStatus === "gameMenu";
  const shouldStopMovement = getShouldStopMovement(gameStatus, isPageVisible);

  // Load game config
  useEffect(() => {
    if (isGameConfigLoaded) return;

    const loadConfig = async () => {
      const config = await loadGameConfig();
      initializeGameState(config);
    };

    loadConfig();
  }, [isGameConfigLoaded, initializeGameState]);

  // Emit game over event when health reaches 0
  useEffect(() => {
    if (
      health === 0 &&
      gameStatus === "gameOver" &&
      previousGameStatusRef.current !== "gameOver"
    ) {
      gameEvents.emit(GameEvent.GAME_OVER, { gameOverType: "loss" });
    }
    previousGameStatusRef.current = gameStatus;
  }, [health, gameStatus]);

  const winGame = useCallback(() => {
    setGameStatus("won");
    gameEvents.emit(GameEvent.GAME_WON, { gameWonType: "win" });
  }, [setGameStatus]);

  const pauseGame = useCallback(() => {
    if (gameStatus === "playing") {
      setGameStatus("paused");
      gameEvents.emit(GameEvent.GAME_PAUSED, { gamePausedType: "pause" });
    } else if (gameStatus === "paused") {
      setGameStatus("playing");
      gameEvents.emit(GameEvent.GAME_RESUMED, { gameResumedType: "resume" });
    }
  }, [setGameStatus, gameStatus]);

  const startGame = useCallback(async () => {
    resetGameState();
    setGameStatus("playing");
  }, [resetGameState, setGameStatus]);

  const goToMainMenu = useCallback(() => {
    resetGameState();
    setGameStatus("menu");
  }, [resetGameState, setGameStatus]);

  const openGameMenu = useCallback(() => {
    setPreviousStatus(gameStatus);
    setGameStatus("gameMenu");
  }, [gameStatus, setGameStatus, setPreviousStatus]);

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
    health,
    gameStatus,
    selectedTowerType,
    selectedTower,
    activeEffects,
    shouldDisableControls,
    shouldStopMovement,
    debug,
    isGameConfigLoaded,

    // Actions
    winGame,
    pauseGame,
    startGame,
    goToMainMenu,
    openGameMenu,
    closeGameMenu,
    setSelectedTowerType,
    setSelectedTower,
    setActiveEffects,
    toggleDebug,
    onSpawnEffect,
    onEndEffect,
    onEffectComplete,
  };
};

export type GameState = ReturnType<typeof useGameSystem>;
