import { describe, expect, it, beforeEach } from "vitest";
import type { Entity } from "koota";

import { runSlowSystem } from "./slowSystem";
import { enemyActions } from "../actions/enemyActions";
import { EnemyState } from "../traits/enemy";
import { slowRequest } from "../traits/slow";
import { testWorld } from "../world";
import type { Enemy } from "../../../core/types/game";

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
  slowUntil: 0,
  slowMultiplier: 1,
  x: 0,
  z: 0,
  upgrades: [],
  ...overrides,
});

/** Entity helpers: all traits are always present on spawned enemies. */
const stateOf = (entity: Entity) => entity.get(EnemyState)!;

describe("slowSystem", () => {
  beforeEach(() => {
    enemyActions(testWorld).clearAllEnemies();
  });

  it("applies a pending slowRequest: multiplier and expiry written, request removed", () => {
    const entity = enemyActions(testWorld).spawnEnemy(makeEnemy(1));
    entity.add(slowRequest({ multiplier: 0.5, expiresAt: 2 }));

    runSlowSystem(testWorld, 0);

    const state = stateOf(entity);
    expect(state.slowMultiplier).toBe(0.5);
    expect(state.slowUntil).toBe(2);
    expect(entity.has(slowRequest)).toBe(false);
  });

  it("applies a slow raised through the slowEnemy action", () => {
    const entity = enemyActions(testWorld).spawnEnemy(makeEnemy(1));

    enemyActions(testWorld).slowEnemy(1, 0.4, 2, 0);
    runSlowSystem(testWorld, 0);

    const state = stateOf(entity);
    expect(state.slowMultiplier).toBeCloseTo(0.4);
    expect(state.slowUntil).toBe(2);
    expect(entity.has(slowRequest)).toBe(false);
  });

  it("refreshing an active slow extends the expiry and updates the strength", () => {
    const entity = enemyActions(testWorld).spawnEnemy(makeEnemy(1));

    enemyActions(testWorld).slowEnemy(1, 0.5, 2, 0);
    runSlowSystem(testWorld, 0);
    expect(stateOf(entity).slowUntil).toBe(2);

    // A second hit at t=1.5: expiresAt 1.5 + 2 = 3.5 (later than 2).
    enemyActions(testWorld).slowEnemy(1, 0.3, 2, 1.5);
    runSlowSystem(testWorld, 1.5);

    const state = stateOf(entity);
    expect(state.slowMultiplier).toBeCloseTo(0.3);
    expect(state.slowUntil).toBe(3.5);
  });

  it("expires an active slow when simulation time reaches slowUntil", () => {
    const entity = enemyActions(testWorld).spawnEnemy(
      makeEnemy(1, { slowMultiplier: 0.5, slowUntil: 0.1 })
    );

    // Not yet expired: the state is untouched.
    runSlowSystem(testWorld, 0.05);
    expect(stateOf(entity).slowMultiplier).toBe(0.5);

    // Expired: cleared.
    runSlowSystem(testWorld, 0.2);

    const state = stateOf(entity);
    expect(state.slowMultiplier).toBe(1);
    expect(state.slowUntil).toBe(0);
  });

  it("expires a slow exactly at its expiry timestamp", () => {
    const entity = enemyActions(testWorld).spawnEnemy(
      makeEnemy(1, { slowMultiplier: 0.5, slowUntil: 2 })
    );

    runSlowSystem(testWorld, 2);

    const state = stateOf(entity);
    expect(state.slowMultiplier).toBe(1);
    expect(state.slowUntil).toBe(0);
  });

  it("ignores a stale slow with a full-strength multiplier", () => {
    const entity = enemyActions(testWorld).spawnEnemy(
      makeEnemy(1, { slowMultiplier: 1, slowUntil: 100 })
    );

    runSlowSystem(testWorld, 200);

    expect(stateOf(entity).slowMultiplier).toBe(1);
    expect(stateOf(entity).slowUntil).toBe(100);
  });

  it("does not write the cold trait for a healthy, unslowed enemy", () => {
    enemyActions(testWorld).spawnEnemy(makeEnemy(1));
    let coldEvents = 0;
    const unsubscribe = testWorld.onChange(EnemyState, () => {
      coldEvents++;
    });

    runSlowSystem(testWorld, 0.5);

    unsubscribe();
    expect(coldEvents).toBe(0);
  });

  it("fires a change event exactly once when a slow is applied and then expires", () => {
    enemyActions(testWorld).spawnEnemy(makeEnemy(1));
    let coldEvents = 0;
    const unsubscribe = testWorld.onChange(EnemyState, () => {
      coldEvents++;
    });

    enemyActions(testWorld).slowEnemy(1, 0.5, 1, 0);
    runSlowSystem(testWorld, 0);
    expect(coldEvents).toBe(1);

    runSlowSystem(testWorld, 2);
    expect(coldEvents).toBe(2);

    unsubscribe();
  });

  it("runs a no-op frame without touching anything when nothing is pending", () => {
    const entity = enemyActions(testWorld).spawnEnemy(makeEnemy(1));
    const stateBefore = stateOf(entity);

    expect(() => runSlowSystem(testWorld, 0)).not.toThrow();
    expect(stateOf(entity)).toEqual(stateBefore);
  });
});
