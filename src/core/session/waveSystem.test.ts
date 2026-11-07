import { beforeEach, describe, expect, it, vi } from "vitest";

import { enemyActions } from "../ecs/actions/enemyActions";
import { getEnemySnapshots } from "../ecs/selectors/enemySnapshots";
import { EnemyState, IsBoss, type EnemyStateData } from "../ecs/traits/enemy";
import { testWorld } from "../ecs/world";
import { useGameStore } from "../stores/useGameStore";
import { useLevelStore } from "../stores/useLevelStore";
import { useUpgradeStore } from "../stores/useUpgradeStore";
import { useWaveStore } from "../stores/useWaveStore";
import type {
  EnemyConfig,
  EnemyType,
  EnemyUpgradeConfig,
  EnemyUpgradeId,
} from "../types/game";
import { createWaveSystem } from "./waveSystem";

const armoredUpgrade: EnemyUpgradeConfig = {
  id: "armored",
  name: "Armored",
  description: "+50% health",
  displayRank: 1,
  indicatorColor: "#6b7280",
  tiers: [
    { healthMultiplier: 1.5, rewardMultiplier: 1.05 },
    { healthMultiplier: 1.75, rewardMultiplier: 1.105 },
    { healthMultiplier: 2, rewardMultiplier: 1.1875 },
  ],
};

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

const tankConfig: EnemyConfig = {
  id: "tank",
  name: "Tank",
  health: 200,
  speed: 0.8,
  reward: 25,
  color: "#6366f1",
  size: 0.55,
  healthLoss: 2,
  description: "",
};

const colossusBoss = {
  name: "Colossus",
  everyNthWave: 4,
  baseStats: {
    health: 1000,
    speed: 0.6,
    size: 1.4,
    healthLoss: 5,
    reward: 250,
  },
  hpGrowthPerAppearance: 1.5,
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
      enemyTypes: {
        basic: basicConfig,
        tank: tankConfig,
      } as Record<EnemyType, EnemyConfig>,
      enemyUpgrades: {} as Record<EnemyUpgradeId, EnemyUpgradeConfig>,
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
      boss: null,
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

  describe("boss waves", () => {
    // Advances the wave counter up to `targetWave` (1-based): repeatedly
    // clears the field, lets the completion delay (0.3s from wave start) run,
    // and starts the next wave. Each call ends with the target wave's first
    // spawn done (the boss, at t=0).
    const reachWave = (
      waves: ReturnType<typeof createWaveSystem>,
      targetWave: number,
      baseTime: number
    ) => {
      let time = baseTime;
      while (useLevelStore.getState().currentWave < targetWave) {
        for (const e of getEnemySnapshots(testWorld)) {
          enemyActions(testWorld).removeEnemy(e.id, false);
        }
        time += 1; // > 0.3s past the current wave's start, so it completes
        tick(waves, time);
        waves.startWave();
        time += 0.05;
      }
      // Two ticks spawn the boss (index 0, delay 0) and the regular enemy
      // (index 1, delay 0.5) — the spawn loop emits one enemy per tick.
      tick(waves, time);
      tick(waves, time + 0.55);
      expect(useLevelStore.getState().currentWave).toBe(targetWave);
    };

    const getBossState = (): EnemyStateData | null => {
      let boss: EnemyStateData | null = null;
      testWorld.query(IsBoss, EnemyState).readEach(([state]) => {
        if (boss === null) boss = state;
      });
      return boss;
    };

    it("spawns the boss alongside the regular wave every 4th wave", () => {
      let nextId = 1;
      const waves = createWaveSystem({
        world: testWorld,
        getNextEnemyId: () => nextId++,
        winGame: vi.fn(),
      });
      useLevelStore.setState({
        totalWaves: 8,
        waveConfigs: Array.from({ length: 8 }, () => ({
          totalEnemies: 1,
          enemies: [{ type: "basic", count: 1, spawnInterval: 0.5 }],
        })),
        boss: colossusBoss,
      });

      reachWave(waves, 3, 1);
      expect(getBossState()).toBe(null);

      // Wave 4: the boss joins the unchanged regular wave at t=0.
      reachWave(waves, 4, 5);
      const boss = getBossState();
      expect(boss).not.toBe(null);
      expect(boss!.name).toBe("Colossus");
      expect(boss!.health).toBe(1000);
      expect(boss!.maxHealth).toBe(1000);
      expect(boss!.size).toBe(1.4);
      expect(boss!.healthLoss).toBe(5);
      // Regular wave (1) + the boss = 2 entities.
      expect(getEnemySnapshots(testWorld)).toHaveLength(2);
    });

    it("scales the boss health per later appearance", () => {
      let nextId = 1;
      const waves = createWaveSystem({
        world: testWorld,
        getNextEnemyId: () => nextId++,
        winGame: vi.fn(),
      });
      useLevelStore.setState({
        totalWaves: 8,
        waveConfigs: Array.from({ length: 8 }, () => ({
          totalEnemies: 1,
          enemies: [{ type: "basic", count: 1, spawnInterval: 0.5 }],
        })),
        boss: colossusBoss,
      });

      reachWave(waves, 4, 1);
      expect(getBossState()?.health).toBe(1000); // 1.5^0
      reachWave(waves, 8, 5);
      expect(getBossState()?.health).toBe(1500); // 1.5^1
    });

    it("applies the player's upgrade stack to the boss like a regular enemy", () => {
      let nextId = 1;
      const waves = createWaveSystem({
        world: testWorld,
        getNextEnemyId: () => nextId++,
        winGame: vi.fn(),
      });
      useLevelStore.setState({
        totalWaves: 8,
        waveConfigs: Array.from({ length: 8 }, () => ({
          totalEnemies: 1,
          enemies: [{ type: "basic", count: 1, spawnInterval: 0.5 }],
        })),
        boss: colossusBoss,
      });
      // Armored I: +50% HP. The boss's 1000 base HP becomes 1500.
      useGameStore.setState({
        enemyUpgrades: { armored: armoredUpgrade } as never,
      });
      useUpgradeStore.getState().confirmEnemyUpgradePick("armored");

      reachWave(waves, 4, 1);
      const boss = getBossState();
      expect(boss!.health).toBe(1500);
      expect(boss!.maxHealth).toBe(1500);
      expect(boss!.upgrades).toEqual(["armored"]);
    });
  });
});
