import { describe, expect, it } from "vitest";

import type { LevelConfigData } from "../core/configs/levelConfig";
import { waypointToTile } from "./levelEditor";
import { validateLevel } from "./validateLevel";

const TILE_SIZE = 1;

const makeLevel = (
  overrides: Partial<LevelConfigData> = {}
): LevelConfigData => ({
  name: "test",
  label: "Test",
  description: "A test sector.",
  startingHealth: 20,
  startingMoney: 100,
  gridSize: 10,
  waters: [],
  pathWaypoints: [
    [
      { x: -4, y: 0, z: -4 },
      { x: 4, y: 0, z: -4 },
    ],
  ],
  waveConfigs: [
    {
      totalEnemies: 10,
      enemies: [{ type: "basic", count: 10, spawnInterval: 1 }],
    },
  ],
  buildings: [],
  towers: [],
  enemies: [],
  projectiles: [],
  enemyWeights: null,
  ...overrides,
});

describe("validateLevel", () => {
  it("reports no issues for a valid level", () => {
    expect(validateLevel(makeLevel(), TILE_SIZE)).toEqual([]);
  });

  it("reports an empty name", () => {
    const issues = validateLevel(makeLevel({ name: "  " }), TILE_SIZE);
    expect(issues.some((issue) => issue.path === "name")).toBe(true);
  });

  it("reports a grid size outside the allowed range", () => {
    const issues = validateLevel(makeLevel({ gridSize: 3 }), TILE_SIZE);
    expect(issues.some((issue) => issue.path === "gridSize")).toBe(true);
  });

  it("reports a level with no paths", () => {
    const issues = validateLevel(makeLevel({ pathWaypoints: [] }), TILE_SIZE);
    expect(issues.some((issue) => issue.path === "pathWaypoints")).toBe(true);
  });

  it("reports a path with fewer than 2 waypoints", () => {
    const issues = validateLevel(
      makeLevel({ pathWaypoints: [[{ x: 0, y: 0, z: 0 }]] }),
      TILE_SIZE
    );
    expect(issues.some((issue) => issue.path === "pathWaypoints.0")).toBe(true);
  });

  it("reports a waypoint placed on water", () => {
    const level = makeLevel();
    const [firstWaypoint] = level.pathWaypoints[0];
    const tile = waypointToTile(firstWaypoint, level.gridSize, TILE_SIZE);
    const issues = validateLevel(
      makeLevel({
        waters: [
          {
            id: 1,
            gridX: tile.gridX,
            gridZ: tile.gridZ,
            shape: "box",
            color: "#0e7490",
          },
        ],
      }),
      TILE_SIZE
    );
    expect(
      issues.some((issue) => issue.message === "Waypoint cannot be on water.")
    ).toBe(true);
  });
});
