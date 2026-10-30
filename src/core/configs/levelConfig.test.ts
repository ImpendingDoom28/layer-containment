import { describe, expect, it } from "vitest";

import { parseLevelConfigData } from "./levelConfig";

const makeLevel = (
  enemies: Array<Record<string, unknown>>
): Record<string, unknown> => ({
  name: "Test",
  label: "Test Sector",
  description: "A test sector.",
  startingHealth: 20,
  startingMoney: 100,
  gridSize: 5,
  pathWaypoints: [[{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }]],
  waveConfigs: [],
  buildings: [],
  towers: [],
  enemies,
  projectiles: [],
  enemyWeights: null,
});

const splitterEnemy = (split?: Record<string, unknown>) => ({
  id: 1,
  type: "splitter",
  name: "Splitter",
  health: 90,
  speed: 1.5,
  reward: 18,
  color: "#06b6d4",
  size: 0.45,
  healthLoss: 2,
  maxHealth: 90,
  pathProgress: 0,
  pathIndex: 0,
  x: 0,
  z: 4,
  upgrades: [],
  ...(split ? { split } : {}),
});

describe("levelConfigSchema", () => {
  it("retains the split config of a pre-spawned splitter enemy", () => {
    const result = parseLevelConfigData(
      makeLevel([splitterEnemy({ minChildren: 2, maxChildren: 4 })])
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.enemies[0].split).toEqual({
      minChildren: 2,
      maxChildren: 4,
    });
  });

  it("parses enemies without a split config as split-undefined", () => {
    const result = parseLevelConfigData(
      makeLevel([
        { ...splitterEnemy(), type: "basic", name: "Troop" },
      ])
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.enemies[0].split).toBeUndefined();
  });

  it("accepts a level whose enemyWeights include a splitter weight", () => {
    const result = parseLevelConfigData({
      ...makeLevel([]),
      enemyWeights: { basic: 10, splitter: 2 },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.enemyWeights).toEqual({ basic: 10, splitter: 2 });
  });
});
