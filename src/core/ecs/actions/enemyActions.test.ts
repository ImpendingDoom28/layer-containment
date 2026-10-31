import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";

import { enemyActions } from "./enemyActions";
import { statsActions, sweepStatsReceipts } from "./statsActions";
import { worldBaseActions } from "./baseActions";
import { getEnemySnapshots } from "../selectors/enemySnapshots";
import { EnemyState, IsEnemy, requestEnemyDeath } from "../traits/enemy";
import { isBase } from "../traits/base";
import { FacingDirection } from "../traits/facing";
import { damageRequest } from "../traits/damage";
import { EnemySlow, slowRequest } from "../traits/slow";
import { HealthInfo } from "../traits/health";
import {
  IsStats,
  damageDealtRequest,
  moneyEarnedRequest,
} from "../traits/stats";
import { testWorld } from "../world";
import { splitRequest } from "../traits/split";
import { useGameStore } from "../../stores/useGameStore";
import { useLevelStore } from "../../stores/useLevelStore";
import type { Enemy, EnemyConfig, EnemyType } from "../../types/game";
import { runEnemyDeathSystem } from "../systems/enemyDeathSystem";
import { runEnemySplitSystem } from "../systems/enemySplitSystem";
import { GameEvent } from "../../types/enums/events";
import { gameEvents } from "../../../utils/eventEmitter";
import {
  beginPauseSegment,
  createPauseClock,
  endPauseSegment,
  getEffectiveGameTime,
} from "../../../utils/pauseClock";

const baseEnemy = (id: number, health: number): Enemy => ({
  id,
  type: "basic",
  name: "E",
  health,
  maxHealth: 100,
  speed: 1,
  reward: 1,
  color: "#fff",
  size: 0.4,
  healthLoss: 1,
  pathProgress: 0,
  pathIndex: 0,
  x: 0,
  z: 0,
  upgrades: [],
});

const splitterEnemy = (id: number, health: number): Enemy => ({
  id,
  type: "splitter",
  name: "Splitter",
  health,
  maxHealth: health,
  speed: 1.5,
  reward: 18,
  color: "#06b6d4",
  size: 0.45,
  healthLoss: 2,
  pathProgress: 0.4,
  pathIndex: 1,
  x: 3,
  z: 4,
  upgrades: [],
  split: { minChildren: 2, maxChildren: 4 },
});

describe("enemyActions", () => {
  beforeEach(() => {
    enemyActions(testWorld).clearAllEnemies();
    worldBaseActions(testWorld).removeBase();
  });

  afterEach(() => {
    worldBaseActions(testWorld).removeBase();
    // Clear any stats entity / receipts and restore the default menu status so
    // the new stats tests don't leak into other tests.
    for (const entity of [...testWorld.query(IsStats)]) {
      entity.destroy();
    }
    sweepStatsReceipts(testWorld);
    useGameStore.setState({ gameStatus: "menu" });
    useLevelStore.setState({ pathWaypoints: [] });
  });

  it("spawnEnemy adds entity readable via snapshots", () => {
    enemyActions(testWorld).spawnEnemy(baseEnemy(1, 100));
    const enemies = getEnemySnapshots(testWorld);
    expect(enemies).toHaveLength(1);
    expect(enemies[0].health).toBe(100);
  });

  it("sets the initial facing along the path at spawn", () => {
    useLevelStore.setState({
      pathWaypoints: [
        [
          { x: 0, y: 0, z: 0 },
          { x: 10, y: 0, z: 0 },
        ],
      ],
    });
    const entity = enemyActions(testWorld).spawnEnemy(baseEnemy(1, 100));

    const facing = entity.get(FacingDirection)!;
    expect(facing.x).toBeCloseTo(1);
    expect(facing.z).toBeCloseTo(0);
  });

  it("falls back to +x facing when the path is missing", () => {
    useLevelStore.setState({ pathWaypoints: [] });
    const entity = enemyActions(testWorld).spawnEnemy(baseEnemy(1, 100));

    const facing = entity.get(FacingDirection)!;
    expect(facing.x).toBeCloseTo(1);
    expect(facing.z).toBeCloseTo(0);
  });

  it("gives split children the path direction at their spawn point", () => {
    useLevelStore.setState({
      pathWaypoints: [
        [],
        [
          { x: 0, y: 0, z: 0 },
          { x: 10, y: 0, z: 0 },
        ],
      ],
    });
    const actions = enemyActions(testWorld);
    let nextChildId = 100;
    actions.spawnEnemy(splitterEnemy(1, 100));
    actions.damageEnemy(1, 100);
    runEnemyDeathSystem(testWorld);
    runEnemySplitSystem(testWorld, () => nextChildId++);

    // The parent is gone; every remaining enemy is a split child, and all of
    // them faced down their (straight +X) path at spawn.
    const children = getEnemySnapshots(testWorld);
    expect(children.length).toBeGreaterThan(0);
    for (const child of children) {
      const entity = testWorld
        .query(EnemyState)
        .find((e) => e.get(EnemyState)?.id === child.id)!;
      const facing = entity.get(FacingDirection)!;
      expect(facing.x).toBeCloseTo(1);
      expect(facing.z).toBeCloseTo(0);
    }
  });

  it("replaces and destroys an enemy with a colliding ID", () => {
    const actions = enemyActions(testWorld);
    actions.spawnEnemy(baseEnemy(5, 100));
    actions.spawnEnemy(baseEnemy(5, 40));

    const enemies = getEnemySnapshots(testWorld);
    expect(enemies).toHaveLength(1);
    expect(enemies[0]).toMatchObject({ id: 5, health: 40 });
  });

  it("respawns a clean entity: an active slow does not carry across", () => {
    const actions = enemyActions(testWorld);
    const original = actions.spawnEnemy(baseEnemy(5, 100));
    original.add(EnemySlow({ multiplier: 0.5, until: 3 }));

    // Re-spawn with the same id while a slow is still active.
    const replacement = actions.spawnEnemy(baseEnemy(5, 60));
    expect(replacement).not.toBe(original);

    const enemies = getEnemySnapshots(testWorld);
    expect(enemies).toHaveLength(1);
    expect(enemies[0]).toMatchObject({ id: 5, health: 60 });
    // The replacement is a clean entity: the slow stays on the old (destroyed)
    // entity and does not apply to the new one.
    expect(replacement.has(EnemySlow)).toBe(false);
  });

  it("damageEnemy reduces health on sequential hits", () => {
    enemyActions(testWorld).spawnEnemy(baseEnemy(1, 100));
    const actions = enemyActions(testWorld);

    actions.damageEnemy(1, 10);
    expect(getEnemySnapshots(testWorld)[0]?.health).toBe(90);

    actions.damageEnemy(1, 10);
    expect(getEnemySnapshots(testWorld)[0]?.health).toBe(80);
  });

  it("removeEnemy destroys entity", () => {
    enemyActions(testWorld).spawnEnemy(baseEnemy(1, 100));
    enemyActions(testWorld).removeEnemy(1, false);
    expect(getEnemySnapshots(testWorld)).toHaveLength(0);
  });

  it("lethal damageEnemy clamps health to 0 and raises requestEnemyDeath without destroying", () => {
    enemyActions(testWorld).spawnEnemy(baseEnemy(1, 100));

    const wasLethal = enemyActions(testWorld).damageEnemy(1, 120);

    expect(wasLethal).toBe(true);
    // The entity is not destroyed yet: the EnemyDeathSystem settles it.
    const snapshot = getEnemySnapshots(testWorld);
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.health).toBe(0);
    expect(testWorld.queryFirst(IsEnemy, requestEnemyDeath)).toBeDefined();
  });

  it("removeEnemy with reachedEnd raises damageRequest on the base instead of calling baseActions", () => {
    const reachedEndSpy = vi.fn();
    gameEvents.on(GameEvent.ENEMY_REACHED_END, reachedEndSpy);

    worldBaseActions(testWorld).spawnBase(20);
    const enemy = baseEnemy(2, 100);
    enemy.healthLoss = 7;
    enemyActions(testWorld).spawnEnemy(enemy);

    const removed = enemyActions(testWorld).removeEnemy(2, true);

    expect(removed).toBe(true);
    expect(getEnemySnapshots(testWorld)).toHaveLength(0);

    // The base damage is an ECS request on the base entity…
    const base = testWorld.queryFirst(isBase);
    expect(base).toBeDefined();
    expect(base!.get(damageRequest)).toEqual({ amount: 7 });
    // …and the base's health is untouched by the action itself.
    expect(base!.get(HealthInfo)).toEqual({ currentHealth: 20, maxHealth: 20 });
    expect(reachedEndSpy).toHaveBeenCalledTimes(1);

    gameEvents.off(GameEvent.ENEMY_REACHED_END, reachedEndSpy);
  });

  it("stores slow expiry in pause-adjusted simulation time", () => {
    const actions = enemyActions(testWorld);
    const clock = createPauseClock();
    actions.spawnEnemy(baseEnemy(1, 100));
    const entity = testWorld.queryFirst(IsEnemy)!;

    const slowStartedAt = getEffectiveGameTime(10, clock);
    actions.slowEnemy(1, 0.4, 2, slowStartedAt);

    beginPauseSegment(clock, 10);
    expect(getEffectiveGameTime(70, clock)).toBe(10);
    expect(entity.get(slowRequest)!.expiresAt).toBeGreaterThan(
      getEffectiveGameTime(70, clock)
    );

    endPauseSegment(clock, 70);
    expect(getEffectiveGameTime(71.99, clock)).toBeLessThan(12);
    expect(getEffectiveGameTime(72, clock)).toBe(12);
    expect(entity.get(slowRequest)!.expiresAt).toBe(12);
  });

  it("scales the slow effect down with slow resistance", () => {
    const actions = enemyActions(testWorld);
    const resisted = actions.spawnEnemy({
      ...baseEnemy(1, 100),
      slowResistance: 0.5,
    });
    const immune = actions.spawnEnemy({
      ...baseEnemy(2, 100),
      slowResistance: 1,
    });

    actions.slowEnemy(1, 0.4, 2, 0);
    actions.slowEnemy(2, 0.4, 2, 0);

    // 1 - (1 - 0.4) * (1 - 0.5): half the slow strength, half the duration.
    expect(resisted.get(slowRequest)!.multiplier).toBeCloseTo(0.7);
    expect(resisted.get(slowRequest)!.expiresAt).toBe(1);
    // A fully resistant enemy (tier 3 Unstoppable) takes no slow at all.
    expect(immune.has(slowRequest)).toBe(false);
  });

  it("damageEnemy with a source raises a damageDealtRequest with effective damage", () => {
    statsActions(testWorld).startRunStats();
    enemyActions(testWorld).spawnEnemy(baseEnemy(1, 100));

    // Non-lethal: effective damage equals the raw damage.
    enemyActions(testWorld).damageEnemy(1, 10, { towerType: "basic" });
    let receipts = testWorld.query(damageDealtRequest);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].get(damageDealtRequest)).toMatchObject({
      towerType: "basic",
      enemyType: "basic",
      amount: 10,
      killed: false,
    });

    // Lethal: effective damage is clamped to the remaining health.
    enemyActions(testWorld).damageEnemy(1, 999, { towerType: "laser" });
    receipts = testWorld.query(damageDealtRequest);
    expect(receipts).toHaveLength(2);
    expect(receipts[1].get(damageDealtRequest)).toMatchObject({
      towerType: "laser",
      amount: 90,
      killed: true,
    });
  });

  it("credits exactly one kill when extra hits land on an already-dead enemy", () => {
    statsActions(testWorld).startRunStats();
    enemyActions(testWorld).spawnEnemy(baseEnemy(1, 100));

    // First hit kills; the entity stays alive (health 0) until
    // EnemyDeathSystem settles it, so more hits can land in that window.
    enemyActions(testWorld).damageEnemy(1, 150, { towerType: "basic" });
    enemyActions(testWorld).damageEnemy(1, 25, { towerType: "aoe" });
    enemyActions(testWorld).damageEnemy(1, 10, { towerType: "laser" });

    const killed = testWorld
      .query(damageDealtRequest)
      .map((e) => e.get(damageDealtRequest)!)
      .filter((r) => r.killed);

    expect(killed).toHaveLength(1);
    expect(killed[0]).toMatchObject({ towerType: "basic", amount: 100 });
  });

  it("damageEnemy without a source raises no stats receipt", () => {
    statsActions(testWorld).startRunStats();
    enemyActions(testWorld).spawnEnemy(baseEnemy(1, 100));

    enemyActions(testWorld).damageEnemy(1, 10);

    expect(testWorld.query(damageDealtRequest)).toHaveLength(0);
  });

  it("handleEnemyDeath raises a moneyEarnedRequest for the reward (non-menu)", () => {
    statsActions(testWorld).startRunStats();
    useGameStore.setState({ gameStatus: "playing" });
    const enemy = baseEnemy(1, 100);
    enemy.reward = 7;
    enemyActions(testWorld).spawnEnemy(enemy);

    enemyActions(testWorld).removeEnemy(1, false);

    const receipt = testWorld.queryFirst(moneyEarnedRequest);
    expect(receipt?.get(moneyEarnedRequest)).toEqual({ amount: 7 });
  });

  it("handleEnemyDeath raises no money receipt in the menu (no stats entity)", () => {
    // No run started: gameStatus is the default "menu".
    const enemy = baseEnemy(2, 100);
    enemy.reward = 5;
    enemyActions(testWorld).spawnEnemy(enemy);

    enemyActions(testWorld).removeEnemy(2, false);

    expect(testWorld.queryFirst(moneyEarnedRequest)).toBeUndefined();
    expect(testWorld.queryFirst(IsStats)).toBeUndefined();
  });
});

describe("enemyActions.getRemainingEnemyCount (wave-end clarity)", () => {
  let ids: number[];
  let idCounter: number;

  beforeEach(() => {
    useGameStore.setState({ gameStatus: "playing" });
    useGameStore.setState({
      enemyTypes: {
        splitter: {
          id: "splitter",
          name: "Splitter",
          health: 90,
          speed: 1.5,
          reward: 18,
          color: "#06b6d4",
          size: 0.45,
          healthLoss: 2,
          split: { minChildren: 2, maxChildren: 4 },
        },
      } as Record<EnemyType, EnemyConfig>,
    });
    enemyActions(testWorld).clearAllEnemies();
    for (const entity of testWorld.query(splitRequest)) entity.destroy();
    ids = [];
    idCounter = 1000;
  });

  const nextId = () => {
    ids.push(idCounter);
    return idCounter++;
  };

  it("stays above zero from the killing blow until the splitter's children are all dead", () => {
    const actions = enemyActions(testWorld);
    actions.spawnEnemy(splitterEnemy(10, 90));

    // The killing blow: health clamps to 0, so the health-based count sees
    // an empty field one frame before the death is settled (the regression).
    actions.damageEnemy(10, 90);
    expect(actions.getLivingEnemyCount()).toBe(0);
    expect(actions.getRemainingEnemyCount()).toBe(1);

    // The death system settles the kill: parent destroyed, split pending.
    runEnemyDeathSystem(testWorld);
    expect(actions.getLivingEnemyCount()).toBe(0);
    expect(actions.getRemainingEnemyCount()).toBe(1);

    // The split system spawns the children: the field has real enemies again.
    runEnemySplitSystem(testWorld, nextId);
    const children = getEnemySnapshots(testWorld);
    expect(children.length).toBeGreaterThanOrEqual(2);
    expect(actions.getRemainingEnemyCount()).toBe(children.length);

    // Killing the children leaves pending deaths until they are settled.
    for (const child of children) {
      actions.damageEnemy(child.id, child.maxHealth + 1);
    }
    expect(actions.getLivingEnemyCount()).toBe(0);
    expect(actions.getRemainingEnemyCount()).toBe(children.length);

    runEnemyDeathSystem(testWorld);
    // Only now is the field actually cleared up.
    expect(actions.getRemainingEnemyCount()).toBe(0);
    expect(actions.getLivingEnemyCount()).toBe(0);
  });

  it("reaches zero as soon as a non-splitter death is settled", () => {
    const actions = enemyActions(testWorld);
    actions.spawnEnemy(baseEnemy(20, 100));

    actions.damageEnemy(20, 100);
    expect(actions.getRemainingEnemyCount()).toBe(1);

    runEnemyDeathSystem(testWorld);
    expect(actions.getRemainingEnemyCount()).toBe(0);
  });
});
