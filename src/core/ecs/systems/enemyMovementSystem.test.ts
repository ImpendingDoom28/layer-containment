import { describe, expect, it, beforeEach, vi } from "vitest";
import type { Entity } from "koota";

import { runEnemyMovementSystem } from "./enemyMovementSystem";
import { enemyActions } from "../actions/enemyActions";
import { getEnemySnapshots } from "../selectors/enemySnapshots";
import { EnemyMotion, EnemyState } from "../traits/enemy";
import { EnemySlow } from "../traits/slow";
import { Position } from "../traits/position";
import { testWorld } from "../world";
import type { Enemy, PathWaypoint } from "../../../core/types/game";

/** Straight path from the origin along +X, 10 units long. */
const path: PathWaypoint[][] = [
  [
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 0, z: 0 },
  ],
];

const makeEnemy = (id: number, overrides: Partial<Enemy> = {}): Enemy => ({
  id,
  type: "basic",
  name: "E",
  health: 100,
  maxHealth: 100,
  speed: 10,
  reward: 1,
  color: "#fff",
  size: 0.4,
  healthLoss: 1,
  pathProgress: 0,
  pathIndex: 0,
  x: 0,
  z: 0,
  upgrades: [],
  ...overrides,
});

type TestOptions = {
  pathWaypoints: PathWaypoint[][];
  radius: number;
  onEnemyReachEnd: ((enemyId: number) => void) | null;
  onEndEffect: ((position: [number, number, number], color: string) => void) | null;
};

const defaultOptions = (): TestOptions => ({
  pathWaypoints: path,
  radius: 50,
  onEnemyReachEnd: vi.fn(),
  onEndEffect: vi.fn(),
});

/** Entity helpers: all traits are always present on spawned enemies. */
const stateOf = (entity: Entity) => entity.get(EnemyState)!;
const motionOf = (entity: Entity) => entity.get(EnemyMotion)!;
const positionOf = (entity: Entity) => entity.get(Position)!;

describe("enemyMovementSystem", () => {
  beforeEach(() => {
    enemyActions(testWorld).clearAllEnemies();
  });

  const run = (delta: number, effectiveTime: number, options = defaultOptions()) =>
    runEnemyMovementSystem(testWorld, delta, effectiveTime, options);

  it("advances an enemy along the path and writes hot motion", () => {
    const entity = enemyActions(testWorld).spawnEnemy(makeEnemy(1));

    // speed 10, delta 0.2 -> progressDelta = (10 * 0.2) / 20 = 0.1
    run(0.2, 0);

    const motion = motionOf(entity);
    const pos = positionOf(entity);
    expect(motion.pathProgress).toBeCloseTo(0.1);
    expect(pos.x).toBeCloseTo(1);
    expect(pos.z).toBeCloseTo(0);

    // The cold state is untouched by per-frame movement.
    const state = stateOf(entity);
    expect(state.health).toBe(100);
    expect(entity.has(EnemySlow)).toBe(false);
  });

  it("moves a slowed enemy at the slowed speed", () => {
    const entity = enemyActions(testWorld).spawnEnemy(makeEnemy(1));
    entity.add(EnemySlow({ multiplier: 0.5, until: 100 }));

    // effective speed = 10 * 0.5 = 5 -> progressDelta = (5 * 0.2) / 20 = 0.05
    run(0.2, 0);

    expect(motionOf(entity).pathProgress).toBeCloseTo(0.05);
    expect(positionOf(entity).x).toBeCloseTo(0.5);
  });

  it("moves at full speed when the slow has expired, without clearing the state", () => {
    const entity = enemyActions(testWorld).spawnEnemy(makeEnemy(1));
    entity.add(EnemySlow({ multiplier: 0.5, until: 0.1 }));

    // effectiveTime 0.2 > until 0.1 -> the slow no longer applies.
    run(0.2, 0.2);

    // The movement system only reads the slow state; removing expired slows
    // is the ApplySlowSystem's job. It moves at full speed this frame.
    expect(entity.get(EnemySlow)).toEqual({ multiplier: 0.5, until: 0.1 });
    // The enemy still moved this frame, at full speed.
    expect(motionOf(entity).pathProgress).toBeCloseTo(0.1);
  });

  it("does not write the cold trait for a healthy, unslowed, non-regenerating enemy", () => {
    const entity = enemyActions(testWorld).spawnEnemy(makeEnemy(1));
    let coldEvents = 0;
    const unsubscribe = testWorld.onChange(EnemyState, () => {
      coldEvents++;
    });

    run(0.2, 0.5);

    unsubscribe();
    expect(coldEvents).toBe(0);
    // Motion was still advanced.
    expect(motionOf(entity).pathProgress).toBeCloseTo(0.1);
  });

  it("clamps motion at the path end and fires the end callbacks exactly once", () => {
    const options = defaultOptions();
    const entity = enemyActions(testWorld).spawnEnemy(
      makeEnemy(1, { pathProgress: 0.98, x: 9.8 })
    );

    // Frame 1: 0.98 + 0.1 = 1.08 >= 0.99 -> reached end.
    run(0.2, 0, options);

    const motion = motionOf(entity);
    const pos = positionOf(entity);
    expect(motion.pathProgress).toBeGreaterThanOrEqual(1);
    expect(pos.x).toBe(10);
    expect(pos.z).toBe(0);
    expect(options.onEnemyReachEnd).toHaveBeenCalledTimes(1);
    expect(options.onEnemyReachEnd).toHaveBeenCalledWith(1);
    expect(options.onEndEffect).toHaveBeenCalledTimes(1);

    // Frame 2 (entity still alive, no removal in this test):
    // the one-shot guard prevents re-firing.
    run(0.2, 0.2, options);
    expect(options.onEnemyReachEnd).toHaveBeenCalledTimes(1);
    expect(options.onEndEffect).toHaveBeenCalledTimes(1);
  });

  it("settles reached-end removal after the pass so destruction is safe", () => {
    const options = defaultOptions();
    const removalSpy = vi.fn((id: number) => {
      // Removal (entity destruction) happens from within the callback.
      enemyActions(testWorld).removeEnemy(id, true);
    });
    options.onEnemyReachEnd = removalSpy;

    enemyActions(testWorld).spawnEnemy(
      makeEnemy(1, { pathProgress: 0.98, x: 9.8 })
    );

    expect(() => run(0.2, 0, options)).not.toThrow();

    expect(getEnemySnapshots(testWorld)).toHaveLength(0);
    expect(removalSpy).toHaveBeenCalledTimes(1);

    // Subsequent frames are no-ops (no enemies left).
    expect(() => run(0.2, 0.2, options)).not.toThrow();
  });

  it("skips dead enemies", () => {
    const entity = enemyActions(testWorld).spawnEnemy(
      makeEnemy(1, { health: 0 })
    );
    const progressBefore = motionOf(entity).pathProgress;

    run(0.2, 0);

    expect(motionOf(entity).pathProgress).toBe(progressBefore);
  });

  it("applies regeneration as discrete ticks capped at max health", () => {
    const entity = enemyActions(testWorld).spawnEnemy(
      makeEnemy(1, { health: 50, regeneration: 10, pathProgress: 0, x: 0 })
    );

    // t=0: first pass only establishes the regen baseline (lastRegenTick
    // -1 -> 0), no heal.
    run(0.2, 0);
    expect(stateOf(entity).health).toBe(50);

    // t=0.15: 0.15s elapsed >= 0.1 tick interval -> heal 10 * 0.15 = 1.5.
    run(0.2, 0.15);
    expect(stateOf(entity).health).toBeCloseTo(51.5);
    expect(motionOf(entity).lastRegenTick).toBeCloseTo(0.15);

    // t=0.24: only 0.09s since last tick -> no heal yet.
    run(0.01, 0.24);
    expect(stateOf(entity).health).toBeCloseTo(51.5);
  });

  it("caps regeneration at max health", () => {
    enemyActions(testWorld).spawnEnemy(
      makeEnemy(1, { health: 99, regeneration: 10 })
    );

    // First pass establishes the baseline at t=0.15 (no heal yet).
    run(0.2, 0.15);
    expect(getEnemySnapshots(testWorld)[0]?.health).toBe(99);

    // Second pass: 0.15s elapsed -> heal 1.5, capped at max health 100.
    run(0.2, 0.3);
    expect(getEnemySnapshots(testWorld)[0]?.health).toBe(100);
  });

  it("does not heal a mid-simulation spawn for time before it spawned", () => {
    // Simulation time is already at 30s when this injured regenerating
    // enemy spawns. The first movement pass must only establish the
    // baseline — healing 10/s for 30s would instantly max its health.
    const entity = enemyActions(testWorld).spawnEnemy(
      makeEnemy(1, { health: 50, regeneration: 10 })
    );

    run(0.2, 30);

    expect(stateOf(entity).health).toBe(50);
    expect(motionOf(entity).lastRegenTick).toBeCloseTo(30);

    // Subsequent ticks heal normally: 30.15 -> 0.15s elapsed, heal 1.5.
    run(0.2, 30.15);
    expect(stateOf(entity).health).toBeCloseTo(51.5);
  });

  it("keeps enemies at the path end when no removal callback is given (menu scene)", () => {
    const options = defaultOptions();
    const endSpy = options.onEndEffect;
    options.onEnemyReachEnd = null;
    const entity = enemyActions(testWorld).spawnEnemy(
      makeEnemy(1, { pathProgress: 0.98, x: 9.8 })
    );

    run(0.2, 0, options);
    expect(endSpy).toHaveBeenCalledTimes(1);

    // The enemy stays at the path end and the effect does not re-fire.
    expect(motionOf(entity).pathProgress).toBeGreaterThanOrEqual(1);
    run(0.2, 0.2, options);
    expect(endSpy).toHaveBeenCalledTimes(1);
    expect(getEnemySnapshots(testWorld)).toHaveLength(1);
  });
});
