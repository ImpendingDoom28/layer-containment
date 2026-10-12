import { describe, expect, it, beforeEach } from "vitest";

import { enemyActions } from "../ecs/actions/enemyActions";
import { getEnemySnapshots } from "../ecs/selectors/enemySnapshots";
import { testWorld } from "../ecs/world";
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
  x: 0,
  z: 0,
  upgrades: [],
});

describe("useEnemyActions", () => {
  beforeEach(() => {
    enemyActions(testWorld).clearAllEnemies();
    enemyActions(testWorld).spawnEnemy(baseEnemy(100));
  });

  it("second damage application uses updated health after first", () => {
    const actions = enemyActions(testWorld);

    actions.damageEnemy(1, 10);
    expect(getEnemySnapshots(testWorld)[0]?.health).toBe(90);

    actions.damageEnemy(1, 10);
    expect(getEnemySnapshots(testWorld)[0]?.health).toBe(80);
  });
});
