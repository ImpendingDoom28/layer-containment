import ReactThreeTestRenderer from "@react-three/test-renderer";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { WorldProvider } from "koota/react";

import { worldBaseActions } from "../../core/ecs/actions/baseActions";
import { requestBaseDefeat, isBase } from "../../core/ecs/traits/base";
import { testWorld } from "../../core/ecs/world";
import { GameEvent } from "../../core/types/enums/events";
import { useGameStore } from "../../core/stores/useGameStore";
import { gameEvents } from "../../utils/eventEmitter";
import { runBaseDefeatSystem } from "../../core/ecs/systems/gameProcessSystem";
import { GameProcessSystem } from "./GameProcessSystem";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const advance = async (
  renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>
) => {
  await ReactThreeTestRenderer.act(async () => {
    await renderer.advanceFrames(1, 1);
  });
};

describe("GameProcessSystem", () => {
  let gameOverSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    worldBaseActions(testWorld).removeBase();
    gameOverSpy = vi.fn();
    gameEvents.on(GameEvent.GAME_OVER, gameOverSpy);
  });

  afterEach(() => {
    gameEvents.off(GameEvent.GAME_OVER, gameOverSpy);
    gameOverSpy.mockClear();
    // Clear any pending request so it does not leak between tests.
    testWorld.query(requestBaseDefeat).forEach((entity) => {
      entity.remove(requestBaseDefeat);
    });
  });

  it("consumes a pending baseDefeatRequest: game over + GAME_OVER event, tag cleared", async () => {
    useGameStore.getState().setGameStatus("playing");

    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <GameProcessSystem />
      </WorldProvider>
    );

    try {
      // Simulate ApplyBaseDefeatSystem having raised the request on a dead base.
      worldBaseActions(testWorld).spawnBase(20);
      const base = testWorld.queryFirst(isBase);
      base!.add(requestBaseDefeat);

      await advance(renderer);

      expect(useGameStore.getState().gameStatus).toBe("gameOver");
      expect(gameOverSpy).toHaveBeenCalledTimes(1);
      expect(gameOverSpy).toHaveBeenCalledWith({ gameOverType: "loss" });
      // The request was acknowledged (tag removed).
      expect(testWorld.queryFirst(requestBaseDefeat)).toBeUndefined();
    } finally {
      renderer.unmount();
    }
  });

  it("ignores a request raised while the game is not playing (stale) but still clears it", async () => {
    useGameStore.getState().setGameStatus("paused");

    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <GameProcessSystem />
      </WorldProvider>
    );

    try {
      worldBaseActions(testWorld).spawnBase(20);
      const base = testWorld.queryFirst(isBase);
      base!.add(requestBaseDefeat);

      await advance(renderer);

      expect(useGameStore.getState().gameStatus).toBe("paused");
      expect(gameOverSpy).toHaveBeenCalledTimes(1);
      expect(testWorld.queryFirst(requestBaseDefeat)).toBeUndefined();
    } finally {
      renderer.unmount();
    }
  });
});

describe("runBaseDefeatSystem", () => {
  it("transitions a playing run to game-over and clears the request", () => {
    useGameStore.getState().setGameStatus("playing");
    worldBaseActions(testWorld).spawnBase(20);
    testWorld.queryFirst(isBase)!.add(requestBaseDefeat);

    runBaseDefeatSystem(testWorld);

    expect(useGameStore.getState().gameStatus).toBe("gameOver");
    expect(testWorld.queryFirst(requestBaseDefeat)).toBeUndefined();
  });

  it("does not overwrite a non-playing status (stale request)", () => {
    useGameStore.getState().setGameStatus("menu");
    worldBaseActions(testWorld).spawnBase(20);
    testWorld.queryFirst(isBase)!.add(requestBaseDefeat);

    runBaseDefeatSystem(testWorld);

    expect(useGameStore.getState().gameStatus).toBe("menu");
    expect(testWorld.queryFirst(requestBaseDefeat)).toBeUndefined();
  });
});
