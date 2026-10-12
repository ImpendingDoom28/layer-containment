import { useEffect } from "react";
import { useGameSystem } from "../../core/hooks/useGameSystem";
import {
  selectedTowerTypeToPlaceSelector,
  setSelectedTowerTypeToPlaceSelector,
  useGameStore,
} from "../../core/stores/useGameStore";

type KeyboardHandlingSystemProps = {
  onGameMenuEscape: () => void;
};

export const KeyboardHandlingSystem = ({
  onGameMenuEscape,
}: KeyboardHandlingSystemProps) => {
  const selectedTowerType = useGameStore(selectedTowerTypeToPlaceSelector);
  const setSelectedTowerType = useGameStore(
    setSelectedTowerTypeToPlaceSelector
  );

  const {
    gameStatus,
    selectedTower,
    pauseGame,
    openGameMenu,
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
          onGameMenuEscape();
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

    globalThis.addEventListener("keydown", handleKeyPress);
    return () => globalThis.removeEventListener("keydown", handleKeyPress);
  }, [
    selectedTowerType,
    selectedTower,
    gameStatus,
    onGameMenuEscape,
    pauseGame,
    openGameMenu,
    setSelectedTowerType,
    setSelectedTower,
    toggleDebug,
  ]);

  return null;
};
