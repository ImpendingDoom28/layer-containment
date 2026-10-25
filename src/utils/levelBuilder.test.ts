import { describe, expect, it } from "vitest";

import {
  buildLevel,
  toBuildings,
  toPathWaypoints,
  toWaves,
  type LevelDefinition,
} from "./levelBuilder";
import { validateLevel } from "./validateLevel";

const TILE_SIZE = 1;

describe("toPathWaypoints", () => {
  it("maps grid cells to world-space waypoints (y = 0)", () => {
    // gridSize 10, tileSize 1 -> offset -5, center = -5 + grid + 0.5
    const [first, last] = toPathWaypoints(
      [
        [0, 0],
        [9, 0],
      ],
      10,
      TILE_SIZE
    );
    expect(first).toEqual({ x: -4.5, y: 0, z: -4.5 });
    expect(last).toEqual({ x: 4.5, y: 0, z: -4.5 });
  });
});

describe("toWaves", () => {
  it("recomputes totalEnemies from the group counts", () => {
    const waves = toWaves([
      [
        { type: "basic", count: 3, spawnInterval: 1 },
        { type: "fast", count: 2, spawnInterval: 0.5 },
      ],
    ]);
    expect(waves[0].totalEnemies).toBe(5);
    expect(waves[0].enemies).toHaveLength(2);
  });
});

describe("toBuildings", () => {
  it("recomputes world coordinates from grid cells", () => {
    const [building] = toBuildings(
      [{ gridX: 3, gridZ: 7, shape: "box" }],
      10,
      TILE_SIZE
    );
    expect(building.x).toBe(-1.5); // -5 + 3 + 0.5
    expect(building.z).toBe(2.5); // -5 + 7 + 0.5
    expect(building.id).toBe(1);
  });
});

describe("buildLevel", () => {
  const definition: LevelDefinition = {
    name: "test",
    startingMoney: 100,
    gridSize: 10,
    paths: [
      [
        [0, 0],
        [0, 9],
      ],
    ],
    buildings: [
      {
        gridX: 5,
        gridZ: 5,
        shape: "box",
        width: 0.8,
        depth: 0.8,
        height: 2,
        color: "#8b7355",
      },
    ],
    waters: [{ gridX: 9, gridZ: 9 }],
    waves: [[{ type: "basic", count: 5, spawnInterval: 1 }]],
  };

  it("produces a level that passes the editor validation", () => {
    const level = buildLevel(definition, TILE_SIZE);
    expect(validateLevel(level, TILE_SIZE)).toEqual([]);
  });

  it("round-trips grid data into the full config", () => {
    const level = buildLevel(definition, TILE_SIZE);
    expect(level.name).toBe("test");
    expect(level.gridSize).toBe(10);
    expect(level.pathWaypoints).toHaveLength(1);
    expect(level.pathWaypoints[0]).toHaveLength(2);
    expect(level.buildings).toHaveLength(1);
    expect(level.waters).toHaveLength(1);
    expect(level.waveConfigs[0].totalEnemies).toBe(5);
    expect(level.towers).toEqual([]);
    expect(level.enemies).toEqual([]);
    expect(level.projectiles).toEqual([]);
    expect(level.enemyWeights).toBeNull();
  });
});
