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
});
