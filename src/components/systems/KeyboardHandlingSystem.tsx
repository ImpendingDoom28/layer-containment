import { useEffect } from "react";
import { useGameSystem } from "../../core/hooks/useGameSystem";
import {
  selectedTowerTypeToPlaceSelector,
  setSelectedTowerTypeToPlaceSelector,
  useGameStore,
} from "../../core/stores/useGameStore";

export const KeyboardHandlingSystem = () => {
  const selectedTowerType = useGameStore(selectedTowerTypeToPlaceSelector);
  const setSelectedTowerType = useGameStore(
    setSelectedTowerTypeToPlaceSelector
  );

  const {
    gameStatus,
    selectedTower,
    pauseGame,
    openGameMenu,
    closeGameMenu,
    setSelectedTower,
    toggleDebug,
  } = useGameSystem();

  // Game controls
  useEffect(() => {
    if (gameStatus === "menu") {
      return;
    }

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (gameStatus === "gameMenu") {
          closeGameMenu();
        } else if (selectedTowerType) {
          setSelectedTowerType(null);
        } else if (selectedTower) {
          setSelectedTower(null);
        } else if (gameStatus === "playing" || gameStatus === "paused") {
          openGameMenu();
        }
      } else if (e.key === " ") {
        e.preventDefault();
        if (gameStatus === "playing" || gameStatus === "paused") {
          pauseGame();
        }
      } else if (e.ctrlKey && e.shiftKey && e.altKey && e.key === "D") {
        e.preventDefault();
        e.stopPropagation();
        toggleDebug();
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [
    selectedTowerType,
    selectedTower,
    gameStatus,
    pauseGame,
    openGameMenu,
    closeGameMenu,
    setSelectedTowerType,
    setSelectedTower,
    toggleDebug,
  ]);

  return null;
};
