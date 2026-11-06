import { beforeEach, describe, expect, it, vi } from "vitest";

import { enemyActions } from "../ecs/actions/enemyActions";
import { getEnemySnapshots } from "../ecs/selectors/enemySnapshots";
import { testWorld } from "../ecs/world";
import { useGameStore } from "../stores/useGameStore";
import { useLevelStore } from "../stores/useLevelStore";
import { useUpgradeStore } from "../stores/useUpgradeStore";
import { useWaveStore } from "../stores/useWaveStore";
import type { EnemyConfig, EnemyType } from "../types/game";
import { createWaveSystem } from "./waveSystem";

const basicConfig: EnemyConfig = {
  id: "basic",
  name: "Basic",
  health: 10,
  speed: 1,
  reward: 1,
  color: "#fff",
  size: 0.4,
  healthLoss: 1,
  description: "",
};

const tick = (
  waves: ReturnType<typeof createWaveSystem>,
  simulationTimeSeconds: number,
  canResolveGameplay = true
) =>
  waves.tick({
    deltaSeconds: 0.05,
    simulationTimeSeconds,
    canResolveGameplay,
  });

describe("createWaveSystem", () => {
  beforeEach(() => {
    useLevelStore.getState().resetLevelState();
    useUpgradeStore.getState().resetLevelEnemyUpgrades();
    useWaveStore.getState().setNextWaveReady(true);
    useGameStore.setState({
      gameStatus: "playing",
      enemyTypes: { basic: basicConfig } as Record<EnemyType, EnemyConfig>,
      enemyUpgrades: {},
    });
    useLevelStore.setState({
      currentWave: 0,
      totalWaves: 2,
      waveConfigs: [
        {
          totalEnemies: 3,
          enemies: [{ type: "basic", count: 3, spawnInterval: 0.5 }],
        },
        {
          totalEnemies: 1,
          enemies: [{ type: "basic", count: 1, spawnInterval: 0.5 }],
        },
      ],
      pathWaypoints: [
        [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
        ],
      ],
    });
  });

  it("uses simulation seconds without separate pause-duration accounting", () => {
    let nextId = 1;
    const waves = createWaveSystem({
      world: testWorld,
      getNextEnemyId: () => nextId++,
      winGame: vi.fn(),
    });

    waves.startWave();
    expect(waves.getRemainingEnemiesInWave()).toBe(3);
    tick(waves, 10);
    tick(waves, 10.5);
    expect(getEnemySnapshots(testWorld)).toHaveLength(2);

    tick(waves, 20, false);
    expect(getEnemySnapshots(testWorld)).toHaveLength(2);

    tick(waves, 10.75);
    expect(getEnemySnapshots(testWorld)).toHaveLength(2);
    tick(waves, 11);
    expect(getEnemySnapshots(testWorld)).toHaveLength(3);
    expect(waves.getRemainingEnemiesInWave()).toBe(3);
  });

  it("does not start another wave until spawned and living enemies are cleared", () => {
    let nextId = 1;
    const waves = createWaveSystem({
      world: testWorld,
      getNextEnemyId: () => nextId++,
      winGame: vi.fn(),
    });

    waves.startWave();
    tick(waves, 1);
    waves.startWave();
    expect(useLevelStore.getState().currentWave).toBe(1);

    tick(waves, 1.5);
    tick(waves, 2);
    for (const enemy of getEnemySnapshots(testWorld)) {
      enemyActions(testWorld).removeEnemy(enemy.id, false);
    }
    tick(waves, 2.5);
    waves.startWave();
    expect(useLevelStore.getState().currentWave).toBe(2);
  });

  it("wins only after the final wave has started and cleared", () => {
    let nextId = 1;
    const winGame = vi.fn();
    const waves = createWaveSystem({
      world: testWorld,
      getNextEnemyId: () => nextId++,
      winGame,
    });
    useLevelStore.setState({
      totalWaves: 1,
      waveConfigs: [
        {
          totalEnemies: 1,
          enemies: [{ type: "basic", count: 1, spawnInterval: 0.5 }],
        },
      ],
    });

    waves.startWave();
    tick(waves, 1);
    enemyActions(testWorld).removeEnemy(1, false);
    tick(waves, 1.4);
    expect(winGame).toHaveBeenCalledTimes(1);
  });

  it("still wins when the final wave clears within 0.3s of its first spawn", () => {
    let nextId = 1;
    const winGame = vi.fn();
    const waves = createWaveSystem({
      world: testWorld,
      getNextEnemyId: () => nextId++,
      winGame,
    });
    useLevelStore.setState({
      totalWaves: 1,
      waveConfigs: [
        {
          totalEnemies: 1,
          enemies: [{ type: "basic", count: 1, spawnInterval: 0.5 }],
        },
      ],
    });

    waves.startWave();
    tick(waves, 1);
    enemyActions(testWorld).removeEnemy(1, false);
    // Cleared only 0.2s after the first spawn: the completion gate is deferred
    // but must not be skipped.
    tick(waves, 1.2);
    expect(winGame).not.toHaveBeenCalled();
    tick(waves, 1.5);
    expect(winGame).toHaveBeenCalledTimes(1);
  });

  it("does not offer or start the next wave during the completion delay", () => {
    let nextId = 1;
    const winGame = vi.fn();
    const waves = createWaveSystem({
      world: testWorld,
      getNextEnemyId: () => nextId++,
      winGame,
    });
    // A single-enemy first wave so it can fully spawn and clear quickly.
    useLevelStore.setState({
      totalWaves: 2,
      waveConfigs: [
        {
          totalEnemies: 1,
          enemies: [{ type: "basic", count: 1, spawnInterval: 0.5 }],
        },
        {
          totalEnemies: 1,
          enemies: [{ type: "basic", count: 1, spawnInterval: 0.5 }],
        },
      ],
    });

    waves.startWave(); // wave 1
    tick(waves, 1); // the single enemy spawns
    enemyActions(testWorld).removeEnemy(1, false); // wave 1 clears at t=1

    // 0.2s after the clear, the 0.3s completion delay is still pending. The
    // next wave must not be offered, and starting it must be a no-op — doing
    // so would reset `waveStarted` and skip the completion step.
    tick(waves, 1.2);
    expect(useWaveStore.getState().nextWaveReady).toBe(false);
    waves.startWave();
    expect(useLevelStore.getState().currentWave).toBe(1);

    // Once the delay elapses the wave is finished; readiness updates on the
    // following frame and the next wave can start.
    tick(waves, 1.5);
    tick(waves, 1.6);
    expect(useWaveStore.getState().nextWaveReady).toBe(true);
    waves.startWave();
    expect(useLevelStore.getState().currentWave).toBe(2);
  });
});
