import { useEffect } from "react";
import { useGameSystem } from "../../core/hooks/useGameSystem";
import {
  KEYBINDING_BY_KEY,
  matchesKeybinding,
  resolveKeybinding,
} from "../../core/keybindings";
import {
  selectedTowerTypeToPlaceSelector,
  setSelectedTowerTypeToPlaceSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import {
  keybindingsSelector,
  useSettingsStore,
} from "../../core/stores/useSettingsStore";

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

  const keybindings = useSettingsStore(keybindingsSelector);

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
      if (
        matchesKeybinding(
          resolveKeybinding(keybindings, KEYBINDING_BY_KEY.menu),
          e.code,
          e
        )
      ) {
        if (gameStatus === "gameMenu") {
          onGameMenuEscape();
        } else if (selectedTowerType) {
          setSelectedTowerType(null);
        } else if (selectedTower) {
          setSelectedTower(null);
        } else if (gameStatus === "playing" || gameStatus === "paused") {
          openGameMenu();
        }
      } else if (
        matchesKeybinding(
          resolveKeybinding(keybindings, KEYBINDING_BY_KEY.pause),
          e.code,
          e
        )
      ) {
        e.preventDefault();
        if (gameStatus === "playing" || gameStatus === "paused") {
          pauseGame();
        }
      } else if (
        matchesKeybinding(
          resolveKeybinding(keybindings, KEYBINDING_BY_KEY.toggleDebug),
          e.code,
          e
        )
      ) {
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
    keybindings,
  ]);

  return null;
};
