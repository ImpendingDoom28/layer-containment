import type { GameStatus } from "./types/game";

/**
 * Whether the player may pause the game.
 *
 * Pausing is disabled while the game is waiting for the next wave (the
 * "Start next wave" state: the game is playing and `nextWaveReady` is set).
 * Pausing/resuming mid-wave is unaffected.
 */
export const getCanPause = (
  gameStatus: GameStatus,
  nextWaveReady: boolean
): boolean => !(gameStatus === "playing" && nextWaveReady);
