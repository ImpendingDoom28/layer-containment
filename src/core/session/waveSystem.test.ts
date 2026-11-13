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
  Tower,
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

const swiftUpgrade: EnemyUpgradeConfig = {
  id: "swift",
  name: "Swift",
  description: "+35% speed",
  displayRank: 1,
  indicatorColor: "#facc15",
  tiers: [
    { speedMultiplier: 1.35, rewardMultiplier: 1.1 },
    { speedMultiplier: 1.5, rewardMultiplier: 1.04 },
    { speedMultiplier: 1.7, rewardMultiplier: 1.0555 },
  ],
};

const slowResistanceUpgrade: EnemyUpgradeConfig = {
  id: "slowResistance",
  name: "Unstoppable",
  description: "Slow resistance",
  displayRank: 1,
  indicatorColor: "#8b5cf6",
  tiers: [
    { slowResistance: 0.25, rewardMultiplier: 1.05 },
    { slowResistance: 0.65, rewardMultiplier: 1.05 },
    { slowResistance: 1, rewardMultiplier: 1.115 },
  ],
};

const makeSlowTower = (id: number): Tower => ({
  id,
  type: "slow",
  name: "Slow Tower",
  cost: 75,
  damage: 10,
  range: 3,
  fireRate: 0.8,
  targeting: "nearest",
  projectileType: "single",
  projectileSpeed: 10,
  color: "#8b5cf6",
  description: "Slows enemies on hit",
  model: { url: "assets/models/tower_slow.glb", node: "Tower_Slow_ROOT" },
  muzzle: { muzzle: { x: 0, y: 0.55, z: 0.63 } },
  slowAmount: 0.7,
  slowDuration: 3,
  lastFireTime: 0,
  gridX: 0,
  gridZ: 0,
  x: 0,
  z: 0,
});

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
    useWaveStore.getState().setRevealSettled(true);
    useWaveStore.setState({ waveClearedPulse: 0 });
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
    expect(useLevelStore.getState().currentWave).toBe(1);
    tick(waves, 3.1);
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
    // The clear is first observed at 1.4; the 0.45s completion budget keeps
    // the win pending until 1.85.
    tick(waves, 1.4);
    expect(winGame).not.toHaveBeenCalled();
    tick(waves, 2);
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
    // Cleared only 0.2s after the first spawn: the completion budget is
    // measured from the clear, so the win is deferred until 0.45s past it.
    tick(waves, 1.2);
    expect(winGame).not.toHaveBeenCalled();
    tick(waves, 1.4);
    expect(winGame).not.toHaveBeenCalled();
    tick(waves, 1.7);
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

    // 0.2s after the clear, the 0.45s completion budget is still pending.
    // The next wave must not be offered, and starting it must be a no-op —
    // doing so would reset `waveStarted` and skip the completion step.
    tick(waves, 1.2);
    expect(useWaveStore.getState().nextWaveReady).toBe(false);
    tick(waves, 1.4);
    expect(useWaveStore.getState().nextWaveReady).toBe(false);
    waves.startWave();
    expect(useLevelStore.getState().currentWave).toBe(1);

    // Once the budget elapses (0.45s past the clear) the wave is finished;
    // readiness updates on the following frame and the next wave can start.
    tick(waves, 1.7);
    tick(waves, 1.75);
    expect(useWaveStore.getState().nextWaveReady).toBe(true);
    waves.startWave();
    expect(useLevelStore.getState().currentWave).toBe(2);
  });

  it("does not offer or start wave 1 while the comet is still in flight", () => {
    let nextId = 1;
    const waves = createWaveSystem({
      world: testWorld,
      getNextEnemyId: () => nextId++,
      winGame: vi.fn(),
    });
    const run = useLevelStore.getState().levelEnterRun;
    // The comet is in flight (the reveal is `armed`): the portals have not
    // been struck yet, so wave 1 must not be offered or started.
    useLevelStore.getState().setCometReveal({ run, phase: "armed" });

    tick(waves, 1);
    expect(useWaveStore.getState().revealSettled).toBe(false);
    // `nextWaveReady` is independent of the reveal: it stays true so the
    // "waiting for the next wave" pause-blocking is unaffected.
    expect(useWaveStore.getState().nextWaveReady).toBe(true);
    waves.startWave();
    expect(useLevelStore.getState().currentWave).toBe(0);
  });

  it("holds wave 1 until the comet reveal has settled on the ground", () => {
    let nextId = 1;
    const waves = createWaveSystem({
      world: testWorld,
      getNextEnemyId: () => nextId++,
      winGame: vi.fn(),
    });
    const run = useLevelStore.getState().levelEnterRun;
    // The comet struck at sim time 1.0. The reveal settles 1.3s after the
    // impact (the portal's 1.0s rise + a 0.3s buffer), i.e. at sim time 2.3.
    useLevelStore.getState().setCometReveal({
      run,
      phase: "revealed",
      revealedAt: 1.0,
    });

    // Before the settle time elapses, wave 1 cannot start, though
    // `nextWaveReady` stays true (pause-blocking is independent of the reveal).
    tick(waves, 2.2);
    expect(useWaveStore.getState().revealSettled).toBe(false);
    expect(useWaveStore.getState().nextWaveReady).toBe(true);
    waves.startWave();
    expect(useLevelStore.getState().currentWave).toBe(0);

    // Once the reveal has settled, wave 1 can start.
    tick(waves, 2.4);
    expect(useWaveStore.getState().revealSettled).toBe(true);
    waves.startWave();
    expect(useLevelStore.getState().currentWave).toBe(1);
  });

  it("treats a stale reveal from a previous level as settled", () => {
    let nextId = 1;
    const waves = createWaveSystem({
      world: testWorld,
      getNextEnemyId: () => nextId++,
      winGame: vi.fn(),
    });
    // A reveal left over from an earlier level (a different run id) must not
    // hold the current level's wave 1: it belongs to a level that is no
    // longer loaded.
    const run = useLevelStore.getState().levelEnterRun;
    useLevelStore.getState().setCometReveal({
      run: run + 1000,
      phase: "armed",
    });

    tick(waves, 1);
    expect(useWaveStore.getState().revealSettled).toBe(true);
    expect(useWaveStore.getState().nextWaveReady).toBe(true);
    waves.startWave();
    expect(useLevelStore.getState().currentWave).toBe(1);
  });

  describe("upgrade gate", () => {
    // Clears the first (single-enemy) wave and lets the 0.45s completion
    // budget (0.3s delay + the last-enemy slow-mo beat) run, which opens the
    // upgrade gate.
    const clearWave1AndOpenGate = (
      waves: ReturnType<typeof createWaveSystem>
    ) => {
      waves.startWave();
      tick(waves, 1); // the single enemy spawns
      enemyActions(testWorld).removeEnemy(1, false);
      tick(waves, 1.5); // the clear is observed here (waveClearedAt = 1.5)
      tick(waves, 2); // 0.45s completion budget elapses → gate opens
    };

    it("offers the Unstoppable upgrade only when a slow tower is placed", () => {
      useGameStore.setState({
        enemyUpgrades: {
          swift: swiftUpgrade,
          slowResistance: slowResistanceUpgrade,
        } as Record<EnemyUpgradeId, EnemyUpgradeConfig>,
      });
      useLevelStore.setState({ towers: [makeSlowTower(100)] });

      let nextId = 1;
      const waves = createWaveSystem({
        world: testWorld,
        getNextEnemyId: () => nextId++,
        winGame: vi.fn(),
      });
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

      clearWave1AndOpenGate(waves);

      const { pendingEnemyUpgradeGate, upgradeChoiceOptions } =
        useUpgradeStore.getState();
      expect(pendingEnemyUpgradeGate).toBe(true);
      expect(upgradeChoiceOptions).toContain("slowResistance");
      expect(upgradeChoiceOptions).toContain("swift");
    });

    it("hides the Unstoppable upgrade when no slow tower is placed", () => {
      useGameStore.setState({
        enemyUpgrades: {
          swift: swiftUpgrade,
          slowResistance: slowResistanceUpgrade,
        } as Record<EnemyUpgradeId, EnemyUpgradeConfig>,
      });
      useLevelStore.setState({ towers: [] });

      let nextId = 1;
      const waves = createWaveSystem({
        world: testWorld,
        getNextEnemyId: () => nextId++,
        winGame: vi.fn(),
      });
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

      clearWave1AndOpenGate(waves);

      const { pendingEnemyUpgradeGate, upgradeChoiceOptions } =
        useUpgradeStore.getState();
      expect(pendingEnemyUpgradeGate).toBe(true);
      expect(upgradeChoiceOptions).not.toContain("slowResistance");
      expect(upgradeChoiceOptions).toContain("swift");
    });

    it("bumps the wave-cleared pulse exactly once per clear", () => {
      useGameStore.setState({
        enemyUpgrades: {
          swift: swiftUpgrade,
        } as Record<EnemyUpgradeId, EnemyUpgradeConfig>,
      });
      useLevelStore.setState({ towers: [] });

      let nextId = 1;
      const waves = createWaveSystem({
        world: testWorld,
        getNextEnemyId: () => nextId++,
        winGame: vi.fn(),
      });
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

      expect(useWaveStore.getState().waveClearedPulse).toBe(0);
      clearWave1AndOpenGate(waves);
      // The completion branch re-runs every frame until the budget elapses,
      // so the pulse must fire once per clear, not per frame.
      expect(useWaveStore.getState().waveClearedPulse).toBe(1);

      // The second wave gets its own beat when it clears.
      waves.startWave();
      tick(waves, 2); // enemy 2 spawns
      enemyActions(testWorld).removeEnemy(2, false);
      tick(waves, 2.5); // the clear is observed → pulse 2
      expect(useWaveStore.getState().waveClearedPulse).toBe(2);
    });
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
