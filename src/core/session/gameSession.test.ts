import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnyPlayableLevelId } from "../../constants/playableLevels";
import type { LevelConfigData } from "../configs/levelConfig";
import { worldBaseActions } from "../ecs/actions/baseActions";
import { effectActions } from "../ecs/actions/effectActions";
import { enemyActions } from "../ecs/actions/enemyActions";
import { statsActions } from "../ecs/actions/statsActions";
import { getEnemySnapshots } from "../ecs/selectors/enemySnapshots";
import { isBase } from "../ecs/traits/base";
import { damageRequest } from "../ecs/traits/damage";
import { IsEffect, spawnEffectRequest } from "../ecs/traits/effect";
import { HealthInfo } from "../ecs/traits/health";
import {
  IsStats,
  MoneyEarned,
  RunEnded,
  moneyEarnedRequest,
} from "../ecs/traits/stats";
import { testWorld } from "../ecs/world";
import { createIdCounter } from "../hooks/utils/useNextId";
import { useGameStore } from "../stores/useGameStore";
import { useLevelStore } from "../stores/useLevelStore";
import { useUpgradeStore } from "../stores/useUpgradeStore";
import type {
  EnemyConfig,
  EnemyType,
  EnemyUpgradeConfig,
  EnemyUpgradeId,
  Tower,
  TowerConfig,
} from "../types/game";
import { createGameSession } from "./gameSession";
import type { GameSessionRuntime, SimulationFrame } from "./types";

const basicEnemy: EnemyConfig = {
  id: "basic",
  name: "Basic",
  health: 10,
  speed: 1,
  reward: 2,
  color: "#fff",
  size: 0.4,
  healthLoss: 1,
  description: "",
};

const basicTower: TowerConfig = {
  id: "basic",
  name: "Basic",
  cost: 10,
  damage: 10,
  range: 2,
  fireRate: 1,
  targeting: "nearest",
  projectileType: "single",
  projectileSpeed: 5,
  color: "#fff",
  description: "",
  model: { url: "assets/models/tower_basic.glb", node: "Tower_Basic_ROOT" },
  muzzle: {
    turretNode: "Azimuth",
    barrelNode: "Elevation",
    muzzle: { x: 0, y: 0.3731, z: 1.071 },
  },
};

const makeLevel = (
  startingHealth = 37,
  startingMoney = 100
): LevelConfigData => ({
  name: "Test",
  label: "Test",
  description: "",
  startingHealth,
  startingMoney,
  gridSize: 8,
  waters: [],
  canyons: [],
  pathWaypoints: [
    [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ],
  ],
  waveConfigs: [
    {
      totalEnemies: 1,
      enemies: [{ type: "basic", count: 1, spawnInterval: 0.5 }],
    },
  ],
  buildings: [],
  towers: [],
  enemies: [],
  projectiles: [],
  enemyWeights: null,
});

const frame: SimulationFrame = {
  deltaSeconds: 0.05,
  simulationTimeSeconds: 1,
  canResolveGameplay: true,
};

const makeSession = (
  loadLevel = async (_levelId: AnyPlayableLevelId) => makeLevel()
) => {
  const towerIds = createIdCounter();
  const enemyIds = createIdCounter();
  const projectileIds = createIdCounter();
  const runtime: GameSessionRuntime = {
    fireProjectile: vi.fn((projectile) => ({ ...projectile, id: 1 })),
    updateProjectiles: vi.fn(),
    clearProjectiles: vi.fn(),
  };
  const session = createGameSession({
    world: testWorld,
    getNextTowerId: towerIds.getNextId,
    getNextEnemyId: enemyIds.getNextId,
    ensureEnemyIdAtLeast: enemyIds.ensureAtLeast,
    getNextProjectileId: projectileIds.getNextId,
    loadLevel,
  });
  session.connectRuntime(runtime);
  return { session, runtime, enemyIds };
};

const clearWorld = () => {
  enemyActions(testWorld).clearAllEnemies();
  worldBaseActions(testWorld).removeBase();
  statsActions(testWorld).endRunStats();
  for (const entity of testWorld.query(IsEffect)) entity.destroy();
  for (const entity of testWorld.query(spawnEffectRequest)) entity.destroy();
};

beforeEach(() => {
  clearWorld();
  useLevelStore.getState().resetLevelState();
  useUpgradeStore.getState().resetLevelEnemyUpgrades();
  useGameStore.setState({
    gameStatus: "menu",
    isGameConfigLoaded: true,
    isPageVisible: true,
    tileSize: 1,
    pathWidth: 1,
    towerHeight: 1,
    enemyTypes: { basic: basicEnemy } as Record<EnemyType, EnemyConfig>,
    towerTypes: { basic: basicTower } as Record<Tower["type"], TowerConfig>,
    enemyUpgrades: {} as Record<EnemyUpgradeId, EnemyUpgradeConfig>,
  });
});

afterEach(clearWorld);

describe("createGameSession lifecycle", () => {
  it("starts a fully initialized run through one boundary", async () => {
    const { session } = makeSession();

    await session.startRun("level_1");

    expect(useGameStore.getState().gameStatus).toBe("playing");
    expect(useLevelStore.getState().isLevelConfigLoaded).toBe(true);
    expect(useLevelStore.getState().money).toBe(100);
    expect(testWorld.queryFirst(isBase)?.get(HealthInfo)).toMatchObject({
      currentHealth: 37,
      maxHealth: 37,
    });
    expect(testWorld.queryFirst(IsStats)).toBeDefined();

    session.startWave();
    session.tick(frame);
    expect(getEnemySnapshots(testWorld)).toHaveLength(1);
  });

  it("restarts every run-owned store and runtime system", async () => {
    const { session, runtime } = makeSession();
    await session.startRun("level_1");
    session.startWave();
    session.tick(frame);
    const firstRunEnemyId = getEnemySnapshots(testWorld)[0].id;

    effectActions(testWorld).spawnEffect([0, 0, 0], "#fff", "spawn");
    effectActions(testWorld).requestSpawnEffect([0, 0, 0], "#fff", "end");
    testWorld.spawn(moneyEarnedRequest({ amount: 9 }));
    useUpgradeStore.setState({
      levelEnemyUpgradeStack: ["armored"],
      pendingEnemyUpgradeGate: true,
    });

    await session.restartRun();

    expect(runtime.clearProjectiles).toHaveBeenCalled();
    expect(getEnemySnapshots(testWorld)).toHaveLength(0);
    expect(testWorld.query(IsEffect)).toHaveLength(0);
    expect(testWorld.query(spawnEffectRequest)).toHaveLength(0);
    expect(testWorld.query(moneyEarnedRequest)).toHaveLength(0);
    expect(useUpgradeStore.getState().levelEnemyUpgradeStack).toEqual([]);
    expect(useUpgradeStore.getState().pendingEnemyUpgradeGate).toBe(false);
    expect(useLevelStore.getState().currentWave).toBe(0);
    expect(testWorld.queryFirst(isBase)?.get(HealthInfo)).toMatchObject({
      currentHealth: 37,
    });

    session.startWave();
    session.tick(frame);
    expect(getEnemySnapshots(testWorld)[0].id).toBe(firstRunEnemyId);
  });

  it("endRun tears down the run but not terminal stats before then", async () => {
    const { session } = makeSession();
    await session.startRun("level_1");
    statsActions(testWorld).markRunEnded();
    expect(testWorld.queryFirst(IsStats)).toBeDefined();

    session.endRun();

    expect(useGameStore.getState().gameStatus).toBe("menu");
    expect(useGameStore.getState().isGameConfigLoaded).toBe(false);
    expect(useLevelStore.getState().isLevelConfigLoaded).toBe(false);
    expect(testWorld.queryFirst(IsStats)).toBeUndefined();
    expect(testWorld.queryFirst(isBase)).toBeUndefined();
  });

  it("mounts the run (playing status) before the level load settles", async () => {
    let resolveLevel!: (level: LevelConfigData) => void;
    const { session } = makeSession(
      () =>
        new Promise((resolve) => {
          resolveLevel = resolve;
        })
    );

    const starting = session.startRun("level_1");

    // The scene/camera mount on "playing", and they must mount while the level
    // store is still reset so the camera's first frames see the same framing
    // as before the session refactor.
    expect(session.isRunStarting).toBe(true);
    expect(useGameStore.getState().gameStatus).toBe("playing");
    expect(useLevelStore.getState().isLevelConfigLoaded).toBe(false);
    expect(useLevelStore.getState().gridSize).toBe(0);
    expect(testWorld.queryFirst(isBase)).toBeUndefined();

    resolveLevel(makeLevel());
    await starting;

    expect(session.isRunStarting).toBe(false);
    expect(useLevelStore.getState().isLevelConfigLoaded).toBe(true);
    expect(useLevelStore.getState().gridSize).toBe(8);
    expect(testWorld.queryFirst(isBase)).toBeDefined();
  });

  it("returns to the menu when the level load fails after the run started", async () => {
    const { session } = makeSession(
      () => Promise.reject(new Error("level fetch failed"))
    );

    await expect(session.startRun("level_1")).rejects.toThrow(
      "level fetch failed"
    );

    expect(session.isRunStarting).toBe(false);
    expect(useGameStore.getState().gameStatus).toBe("menu");
    expect(useLevelStore.getState().isLevelConfigLoaded).toBe(false);
    expect(testWorld.queryFirst(isBase)).toBeUndefined();
  });

  it("ignores a level load that resolves after the session was disposed", async () => {
    let resolveLevel!: (level: LevelConfigData) => void;
    const { session } = makeSession(
      () =>
        new Promise((resolve) => {
          resolveLevel = resolve;
        })
    );

    const starting = session.startRun("level_1");
    session.dispose();
    resolveLevel(makeLevel());
    await starting;

    // The stale load must not populate the level after disposal (e.g. the
    // page was unmounted mid-start).
    expect(session.isRunStarting).toBe(false);
    expect(useLevelStore.getState().isLevelConfigLoaded).toBe(false);
    expect(testWorld.queryFirst(isBase)).toBeUndefined();
  });

  it("ignores a stale level load after a newer selection", async () => {
    let resolveFirst!: (level: LevelConfigData) => void;
    let resolveSecond!: (level: LevelConfigData) => void;
    const { session } = makeSession((levelId) =>
      levelId === "level_1"
        ? new Promise((resolve) => {
            resolveFirst = resolve;
          })
        : new Promise((resolve) => {
            resolveSecond = resolve;
          })
    );

    const first = session.startRun("level_1");
    const second = session.startRun("level_2");
    resolveSecond(makeLevel(22, 200));
    await second;
    resolveFirst(makeLevel(11, 50));
    await first;

    expect(useLevelStore.getState().money).toBe(200);
    expect(testWorld.queryFirst(isBase)?.get(HealthInfo)).toMatchObject({
      currentHealth: 22,
      maxHealth: 22,
    });
  });
});

describe("createGameSession pipeline integration", () => {
  it("folds terminal receipts and clears RunEnded in the same tick", async () => {
    const { session } = makeSession();
    await session.startRun("level_1");
    testWorld.spawn(moneyEarnedRequest({ amount: 5 }));
    statsActions(testWorld).markRunEnded();

    session.tick(frame);

    expect(testWorld.queryFirst(IsStats)?.get(MoneyEarned)).toEqual({
      total: 5,
    });
    expect(testWorld.queryFirst(moneyEarnedRequest)).toBeUndefined();
    expect(testWorld.queryFirst(IsStats, RunEnded)).toBeUndefined();
  });

  it("applies base damage before raising defeat for the next pass", async () => {
    const { session } = makeSession();
    await session.startRun("level_1");
    testWorld.queryFirst(isBase)!.add(damageRequest({ amount: 37 }));

    session.tick(frame);
    expect(testWorld.queryFirst(isBase)?.get(HealthInfo)?.currentHealth).toBe(
      0
    );
    expect(useGameStore.getState().gameStatus).toBe("playing");

    session.tick({ ...frame, simulationTimeSeconds: 2 });
    expect(useGameStore.getState().gameStatus).toBe("gameOver");
    expect(testWorld.queryFirst(IsStats)).toBeDefined();
  });
});
