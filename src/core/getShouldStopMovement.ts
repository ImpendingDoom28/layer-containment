import type { GameStatus } from "./types/game";

export const getShouldStopMovement = (
  gameStatus: GameStatus,
  isPageVisible: boolean
): boolean => {
  const shouldDisableControls =
    gameStatus === "gameOver" ||
    gameStatus === "won" ||
    gameStatus === "gameMenu";
  return shouldDisableControls || gameStatus === "paused" || !isPageVisible;
};
