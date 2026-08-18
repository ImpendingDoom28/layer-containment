import { describe, expect, it, beforeEach } from "vitest";

import { enemyActions } from "../ecs/actions/enemyActions";
import { getEnemySnapshots } from "../ecs/selectors/enemySnapshots";
import { world } from "../ecs/world";
import type { Enemy } from "../types/game";

const baseEnemy = (health: number): Enemy => ({
  id: 1,
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
  slowUntil: 0,
  slowMultiplier: 1,
  x: 0,
  z: 0,
  upgrades: [],
});

describe("sequential damage reads fresh enemy health from ECS", () => {
  beforeEach(() => {
    enemyActions(world).clearAllEnemies();
    enemyActions(world).spawnEnemy(baseEnemy(100));
  });

  it("second damage application uses updated health after first", () => {
    const actions = enemyActions(world);

    actions.damageEnemy(1, 10);
    expect(getEnemySnapshots(world)[0]?.health).toBe(90);

    actions.damageEnemy(1, 10);
    expect(getEnemySnapshots(world)[0]?.health).toBe(80);
  });
});
