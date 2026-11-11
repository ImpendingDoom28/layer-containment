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
  canyons: [],
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
      issues.some(
        (issue) =>
          issue.message ===
          "Waypoint cannot be on water (except over a canyon)."
      )
    ).toBe(true);
  });

  it("allows a waypoint over water that sits on a canyon tile (bridge)", () => {
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
        canyons: [{ id: 1, gridX: tile.gridX, gridZ: tile.gridZ }],
      }),
      TILE_SIZE
    );
    expect(
      issues.some((issue) =>
        issue.message.includes("Waypoint cannot be on water")
      )
    ).toBe(false);
  });

  it("reports two paths crossing the same canyon tile (two bridges)", () => {
    // Grid 10, tileSize 1: world (x,z) maps to grid (x+5, z+5).
    // Path 0 runs down column 5, path 1 runs across row 5, crossing at
    // grid (5,5) over a canyon tile there.
    const crossing = makeLevel({
      pathWaypoints: [
        [
          { x: 0, y: 0, z: -3 }, // (5, 2)
          { x: 0, y: 0, z: 3 }, // (5, 8)
        ],
        [
          { x: -3, y: 0, z: 0 }, // (2, 5)
          { x: 3, y: 0, z: 0 }, // (8, 5)
        ],
      ],
      canyons: [{ id: 1, gridX: 5, gridZ: 5 }],
    });
    const issues = validateLevel(crossing, TILE_SIZE);
    expect(
      issues.some((issue) =>
        issue.message.includes("two bridges cannot share a canyon tile")
      )
    ).toBe(true);
  });

  it("allows two paths merging over the same canyon tiles (collinear)", () => {
    // Both paths run down column 5 and share canyon tiles (5,5) and (5,6)
    // in the same direction — one shared deck, not a crossing.
    const merging = makeLevel({
      pathWaypoints: [
        [
          { x: 0, y: 0, z: -3 }, // (5, 2)
          { x: 0, y: 0, z: 3 }, // (5, 8)
        ],
        [
          { x: 0, y: 0, z: 0 }, // (5, 5)
          { x: 0, y: 0, z: 3 }, // (5, 8)
        ],
      ],
      canyons: [
        { id: 1, gridX: 5, gridZ: 5 },
        { id: 2, gridX: 5, gridZ: 6 },
      ],
    });
    const issues = validateLevel(merging, TILE_SIZE);
    expect(
      issues.some((issue) =>
        issue.message.includes("two bridges cannot share a canyon tile")
      )
    ).toBe(false);
  });

  it("allows paths crossing on ground (no canyon at the crossing tile)", () => {
    const crossingOnGround = makeLevel({
      pathWaypoints: [
        [
          { x: 0, y: 0, z: -3 }, // (5, 2)
          { x: 0, y: 0, z: 3 }, // (5, 8)
        ],
        [
          { x: -3, y: 0, z: 0 }, // (2, 5)
          { x: 3, y: 0, z: 0 }, // (8, 5)
        ],
      ],
      canyons: [],
    });
    const issues = validateLevel(crossingOnGround, TILE_SIZE);
    expect(issues).toEqual([]);
  });
});
