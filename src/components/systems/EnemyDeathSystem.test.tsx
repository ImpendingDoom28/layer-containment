import ReactThreeTestRenderer from "@react-three/test-renderer";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { WorldProvider } from "koota/react";

import { enemyActions } from "../../core/ecs/actions/enemyActions";
import { worldBaseActions } from "../../core/ecs/actions/baseActions";
import { getEnemySnapshots } from "../../core/ecs/selectors/enemySnapshots";
import { IsEnemy, requestEnemyDeath } from "../../core/ecs/traits/enemy";
import { isBase } from "../../core/ecs/traits/base";
import { damageRequest } from "../../core/ecs/traits/damage";
import { testWorld } from "../../core/ecs/world";
import type { Enemy } from "../../core/types/game";
import { GameEvent } from "../../core/types/enums/events";
import { useGameStore } from "../../core/stores/useGameStore";
import { useLevelStore } from "../../core/stores/useLevelStore";
import { gameEvents } from "../../utils/eventEmitter";
import { EnemyDeathSystem } from "./EnemyDeathSystem";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const advance = async (
  renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>
) => {
  await ReactThreeTestRenderer.act(async () => {
    await renderer.advanceFrames(1, 1);
  });
};

const baseEnemy = (id: number, health: number): Enemy => ({
  id,
  type: "basic",
  name: "E",
  health,
  maxHealth: 100,
  speed: 1,
  reward: 3,
  color: "#fff",
  size: 0.4,
  healthLoss: 1,
  pathProgress: 0,
  pathIndex: 0,
  slowUntil: 0,
  slowMultiplier: 1,
  x: 0,
  z: 0,
  upgrades: [],
});

describe("EnemyDeathSystem", () => {
  let killedSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useLevelStore.getState().resetLevelState();
    useGameStore.getState().setGameStatus("playing");
    worldBaseActions(testWorld).removeBase();
    enemyActions(testWorld).clearAllEnemies();
    killedSpy = vi.fn();
    gameEvents.on(GameEvent.ENEMY_KILLED, killedSpy);
  });

  afterEach(() => {
    gameEvents.off(GameEvent.ENEMY_KILLED, killedSpy);
    killedSpy.mockClear();
    useLevelStore.getState().resetLevelState();
    useGameStore.getState().setGameStatus("menu");
  });

  it("consumes a requestEnemyDeath request: kill settled, entity destroyed, tag cleared", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <EnemyDeathSystem />
      </WorldProvider>
    );

    try {
      enemyActions(testWorld).spawnEnemy(baseEnemy(1, 100));

      // The lethal hit leaves the entity alive with the request raised.
      enemyActions(testWorld).damageEnemy(1, 100);
      expect(getEnemySnapshots(testWorld)).toHaveLength(1);
      expect(
        testWorld.queryFirst(IsEnemy, requestEnemyDeath)
      ).toBeDefined();

      await advance(renderer);

      // Kill settled: reward, kill count, event.
      expect(useLevelStore.getState().money).toBe(3);
      expect(useLevelStore.getState().enemiesKilled).toBe(1);
      expect(killedSpy).toHaveBeenCalledTimes(1);

      // Entity destroyed and request acknowledged.
      expect(getEnemySnapshots(testWorld)).toHaveLength(0);
      expect(testWorld.queryFirst(requestEnemyDeath)).toBeUndefined();
    } finally {
      renderer.unmount();
    }
  });

  it("leaves entities without a request alone", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <EnemyDeathSystem />
      </WorldProvider>
    );

    try {
      enemyActions(testWorld).spawnEnemy(baseEnemy(2, 50));

      await advance(renderer);

      expect(getEnemySnapshots(testWorld)).toHaveLength(1);
      expect(testWorld.queryFirst(requestEnemyDeath)).toBeUndefined();
      expect(killedSpy).not.toHaveBeenCalled();
    } finally {
      renderer.unmount();
    }
  });

  it("does nothing when there are no enemies", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <EnemyDeathSystem />
      </WorldProvider>
    );

    try {
      await advance(renderer);
      expect(getEnemySnapshots(testWorld)).toHaveLength(0);
      expect(killedSpy).not.toHaveBeenCalled();
    } finally {
      renderer.unmount();
    }
  });
});

describe("damageRequest raised on reach-end (DamageSystem side contract)", () => {
  it("a reached-end request is raised on the base and does not settle the kill", async () => {
    // removeEnemy(reachedEnd) is synchronous: it raises the request on the
    // base and destroys the enemy. The EnemyDeathSystem must not pick it
    // up (there is no requestEnemyDeath), and no kill is settled.
    const reachedEndSpy = vi.fn();
    gameEvents.on(GameEvent.ENEMY_REACHED_END, reachedEndSpy);

    worldBaseActions(testWorld).spawnBase(20);
    const enemy = baseEnemy(3, 100);
    enemy.healthLoss = 7;
    enemyActions(testWorld).spawnEnemy(enemy);

    enemyActions(testWorld).removeEnemy(3, true);

    const base = testWorld.queryFirst(isBase);
    expect(base).toBeDefined();
    expect(base!.get(damageRequest)).toEqual({ amount: 7 });
    expect(testWorld.queryFirst(requestEnemyDeath)).toBeUndefined();
    expect(getEnemySnapshots(testWorld)).toHaveLength(0);
    expect(reachedEndSpy).toHaveBeenCalledTimes(1);
    expect(useLevelStore.getState().money).toBe(0);
    expect(useLevelStore.getState().enemiesKilled).toBe(0);

    gameEvents.off(GameEvent.ENEMY_REACHED_END, reachedEndSpy);
  });
});
