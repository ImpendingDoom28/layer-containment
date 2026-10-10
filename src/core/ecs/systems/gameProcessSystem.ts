import { World } from "koota";

import { requestBaseDefeat } from "../traits/base";
import { useGameStore } from "../../stores/useGameStore";
import { gameEvents } from "../../../utils/eventEmitter";
import { GameEvent } from "../../types/enums/events";

export const runBaseDefeatSystem = (world: World) => {
  const pendingRequests = world.query(requestBaseDefeat);
  if (pendingRequests.length === 0) return;

  const gameStore = useGameStore.getState();
  if (gameStore.gameStatus === "playing") {
    gameStore.setGameStatus("gameOver");
  }
  // The scene keeps running after defeat, so skip re-emitting (SFX) per frame.
  if (gameStore.gameStatus !== "gameOver") {
    gameEvents.emit(GameEvent.GAME_OVER, { gameOverType: "loss" });
  }

  for (const entity of pendingRequests) {
    entity.remove(requestBaseDefeat);
  }
};
