import { describe, expect, it, beforeEach } from "vitest";

import { runSlowSystem } from "./slowSystem";
import { enemyActions } from "../actions/enemyActions";
import { slowRequest, EnemySlow } from "../traits/slow";
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
  x: 0,
  z: 0,
  upgrades: [],
  ...overrides,
});

describe("slowSystem", () => {
  beforeEach(() => {
    enemyActions(testWorld).clearAllEnemies();
  });

  it("applies a pending slowRequest: slow trait written, request removed", () => {
    const entity = enemyActions(testWorld).spawnEnemy(makeEnemy(1));
    entity.add(slowRequest({ multiplier: 0.5, expiresAt: 2 }));

    runSlowSystem(testWorld, 0);

    expect(entity.get(EnemySlow)).toEqual({ multiplier: 0.5, until: 2 });
    expect(entity.has(slowRequest)).toBe(false);
  });

  it("applies a slow raised through the slowEnemy action", () => {
    const entity = enemyActions(testWorld).spawnEnemy(makeEnemy(1));

    enemyActions(testWorld).slowEnemy(1, 0.4, 2, 0);
    runSlowSystem(testWorld, 0);

    expect(entity.get(EnemySlow)).toEqual({ multiplier: 0.4, until: 2 });
    expect(entity.has(slowRequest)).toBe(false);
  });

  it("refreshing an active slow extends the expiry and updates the strength", () => {
    const entity = enemyActions(testWorld).spawnEnemy(makeEnemy(1));

    enemyActions(testWorld).slowEnemy(1, 0.5, 2, 0);
    runSlowSystem(testWorld, 0);
    expect(entity.get(EnemySlow)).toEqual({ multiplier: 0.5, until: 2 });

    // A second hit at t=1.5: expiresAt 1.5 + 2 = 3.5 (later than 2).
    enemyActions(testWorld).slowEnemy(1, 0.3, 2, 1.5);
    runSlowSystem(testWorld, 1.5);

    const slow = entity.get(EnemySlow);
    expect(slow).toBeDefined();
    expect(slow!.until).toBe(3.5);
    // 1 - (1 - 0.3) * (1 - 0) in float64.
    expect(slow!.multiplier).toBeCloseTo(0.3);
  });

  it("expires an active slow when simulation time reaches slowUntil", () => {
    const entity = enemyActions(testWorld).spawnEnemy(makeEnemy(1));
    entity.add(EnemySlow({ multiplier: 0.5, until: 0.1 }));

    // Not yet expired: the slow is untouched.
    runSlowSystem(testWorld, 0.05);
    expect(entity.get(EnemySlow)).toEqual({ multiplier: 0.5, until: 0.1 });

    // Expired: the slow trait is removed.
    runSlowSystem(testWorld, 0.2);
    expect(entity.has(EnemySlow)).toBe(false);
  });

  it("expires a slow exactly at its expiry timestamp", () => {
    const entity = enemyActions(testWorld).spawnEnemy(makeEnemy(1));
    entity.add(EnemySlow({ multiplier: 0.5, until: 2 }));

    runSlowSystem(testWorld, 2);

    expect(entity.has(EnemySlow)).toBe(false);
  });

  it("ignores a stale slow with a full-strength multiplier", () => {
    const entity = enemyActions(testWorld).spawnEnemy(makeEnemy(1));
    entity.add(EnemySlow({ multiplier: 1, until: 100 }));

    runSlowSystem(testWorld, 200);

    // The full-strength slow is a no-op; the system leaves it alone.
    expect(entity.get(EnemySlow)).toEqual({ multiplier: 1, until: 100 });
  });

  it("does not fire slow-trait events for a healthy, unslowed enemy", () => {
    enemyActions(testWorld).spawnEnemy(makeEnemy(1));
    let events = 0;
    const unsubChange = testWorld.onChange(EnemySlow, () => events++);
    const unsubRemove = testWorld.onRemove(EnemySlow, () => events++);

    runSlowSystem(testWorld, 0.5);

    unsubChange();
    unsubRemove();
    expect(events).toBe(0);
  });

  it("fires a change event on apply and a remove event on expiry, exactly once each", () => {
    enemyActions(testWorld).spawnEnemy(makeEnemy(1));
    let changeEvents = 0;
    let removeEvents = 0;
    const unsubChange = testWorld.onChange(EnemySlow, () => changeEvents++);
    const unsubRemove = testWorld.onRemove(EnemySlow, () => removeEvents++);

    enemyActions(testWorld).slowEnemy(1, 0.5, 1, 0);
    runSlowSystem(testWorld, 0);
    expect(changeEvents).toBe(1);
    expect(removeEvents).toBe(0);

    runSlowSystem(testWorld, 2);
    expect(changeEvents).toBe(1);
    expect(removeEvents).toBe(1);

    unsubChange();
    unsubRemove();
  });

  it("runs a no-op frame without touching anything when nothing is pending", () => {
    const entity = enemyActions(testWorld).spawnEnemy(makeEnemy(1));

    expect(() => runSlowSystem(testWorld, 0)).not.toThrow();
    expect(entity.has(EnemySlow)).toBe(false);
    expect(entity.has(slowRequest)).toBe(false);
  });
});
