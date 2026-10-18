import { World } from "koota";

import { statsActions } from "../actions/statsActions";
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
    // Flush pending receipts so the end screen freezes a complete snapshot,
    // regardless of per-frame fold ordering.
    statsActions(world).flushRunStats();
  }
  // The scene keeps running after defeat, so skip re-emitting (SFX) per frame.
  if (gameStore.gameStatus !== "gameOver") {
    gameEvents.emit(GameEvent.GAME_OVER, { gameOverType: "loss" });
  }

  for (const entity of pendingRequests) {
    entity.remove(requestBaseDefeat);
  }
};
