import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { PLAYABLE_LEVEL_IDS } from "../../constants/playableLevels";
import {
  computeWaveTotalEnemies,
  waypointToTile,
  waypointToTileUnclamped,
} from "../../utils/levelEditor";
import { MIN_GRID_SIZE } from "../../utils/gridSizeLimits";
import { isGridTileOnPath } from "../../utils/pathUtils";
import { parseLevelConfigData, type LevelConfigData } from "./levelConfig";

// Matches public/configs/game.json (tileSize / pathWidth are static per build).
const TILE_SIZE = 1;
const PATH_WIDTH = 0.85;

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "../../../..");
const LEVELS_DIR = path.join(REPO_ROOT, "public", "configs", "levels");

/** Reads a level file and returns it after validating it against the schema. */
const loadLevel = (id: string): LevelConfigData => {
  const raw = readFileSync(path.join(LEVELS_DIR, `${id}.json`), "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  const result = parseLevelConfigData(parsed);
  if (!result.success) {
    throw new Error(
      `${id}.json failed schema validation: ${result.error.message}`
    );
  }
  return result.data;
};

describe("playable level files", () => {
  for (const id of PLAYABLE_LEVEL_IDS) {
    it(`${id}: exists and parses against the level schema`, () => {
      expect(() => loadLevel(id)).not.toThrow();
    });

    it(`${id}: has at least one path and at least one wave`, () => {
      const level = loadLevel(id);
      expect(level.pathWaypoints.length).toBeGreaterThan(0);
      expect(level.pathWaypoints.every((path) => path.length > 1)).toBe(true);
      expect(level.waveConfigs.length).toBeGreaterThan(0);
    });

    it(`${id}: every wave spawns at least one enemy`, () => {
      const level = loadLevel(id);
      for (const wave of level.waveConfigs) {
        expect(Number.isInteger(wave.totalEnemies)).toBe(true);
        // The wave system spawns min(totalEnemies, sum of group counts)
        // enemies (totalEnemies acts as a cap), so a playable wave needs at
        // least one defined enemy and a positive cap.
        const spawned = Math.min(
          wave.totalEnemies,
          computeWaveTotalEnemies(wave)
        );
        expect(spawned).toBeGreaterThanOrEqual(1);
      }
    });

    it(`${id}: buildings and water never sit on the path`, () => {
      const level = loadLevel(id);
      const gridOffset = -(level.gridSize * TILE_SIZE) / 2;
      const isOnPath = (gridX: number, gridZ: number) =>
        isGridTileOnPath(
          level.pathWaypoints,
          gridX,
          gridZ,
          gridOffset,
          TILE_SIZE,
          PATH_WIDTH
        );
      for (const building of level.buildings) {
        expect(
          isOnPath(building.gridX, building.gridZ),
          `building ${building.id} at ${building.gridX},${building.gridZ} is on the path`
        ).toBe(false);
      }
      for (const water of level.waters) {
        expect(
          isOnPath(water.gridX, water.gridZ),
          `water ${water.id} at ${water.gridX},${water.gridZ} is on the path`
        ).toBe(false);
      }
    });

    it(`${id}: path segments are axis-aligned`, () => {
      const level = loadLevel(id);
      level.pathWaypoints.forEach((path, pathIndex) => {
        for (let i = 1; i < path.length; i++) {
          const prev = path[i - 1];
          const curr = path[i];
          // The editor's path tool is orthogonal; a diagonal segment would
          // render but the level could not be opened or edited.
          expect(
            prev.x === curr.x || prev.z === curr.z,
            `path ${pathIndex} segment (${prev.x}, ${prev.z})->(${curr.x}, ${curr.z}) is not axis-aligned`
          ).toBe(true);
        }
      });
    });

    it(`${id}: no duplicate or overlapping building/water tiles`, () => {
      const level = loadLevel(id);
      const tileKey = (gridX: number, gridZ: number) => `${gridX},${gridZ}`;
      const buildingKeys = level.buildings.map(
        (b) => tileKey(b.gridX, b.gridZ)
      );
      expect(new Set(buildingKeys).size).toBe(buildingKeys.length);
      const waterKeys = level.waters.map((w) => tileKey(w.gridX, w.gridZ));
      expect(new Set(waterKeys).size).toBe(waterKeys.length);
      for (const key of waterKeys) {
        expect(buildingKeys).not.toContain(key);
      }
    });

    it(`${id}: path waypoints never sit on water`, () => {
      const level = loadLevel(id);
      const waterKeys = new Set(
        level.waters.map((w) => `${w.gridX},${w.gridZ}`)
      );
      for (const path of level.pathWaypoints) {
        for (const waypoint of path) {
          const { gridX, gridZ } = waypointToTile(
            waypoint,
            level.gridSize,
            TILE_SIZE
          );
          expect(
            waterKeys.has(`${gridX},${gridZ}`),
            `path waypoint at grid ${gridX},${gridZ} sits on water`
          ).toBe(false);
        }
      }
    });

    it(`${id}: grid cells are within the grid bounds`, () => {
      const level = loadLevel(id);
      const inBounds = (v: number) => v >= 0 && v < level.gridSize;
      for (const path of level.pathWaypoints) {
        for (const waypoint of path) {
          const { gridX, gridZ } = waypointToTileUnclamped(
            waypoint,
            level.gridSize,
            TILE_SIZE
          );
          expect(inBounds(gridX)).toBe(true);
          expect(inBounds(gridZ)).toBe(true);
        }
      }
      for (const building of level.buildings) {
        expect(inBounds(building.gridX)).toBe(true);
        expect(inBounds(building.gridZ)).toBe(true);
      }
      for (const water of level.waters) {
        expect(inBounds(water.gridX)).toBe(true);
        expect(inBounds(water.gridZ)).toBe(true);
      }
    });
  }
});

// The 3D asset showcase (`/testing-level`) is not a playable level, so it sits
// outside `PLAYABLE_LEVEL_IDS` and skips the wave/buildable checks above. It
// still ships as level JSON, so it must validate against the schema and
// actually carry the showcase rows (every asset category the page displays).
describe("3D asset showcase level", () => {
  const level = loadLevel("level_testing");

  it("exists and parses against the level schema", () => {
    expect(level.name).toBeTruthy();
    expect(level.gridSize).toBeGreaterThanOrEqual(MIN_GRID_SIZE);
  });

  it("shows the full roster: enemies, towers, buildings, water, projectiles, path", () => {
    expect(level.enemies.length).toBeGreaterThan(0);
    expect(level.towers.length).toBeGreaterThan(0);
    expect(level.buildings.length).toBeGreaterThan(0);
    expect(level.waters.length).toBeGreaterThan(0);
    expect(level.projectiles.length).toBeGreaterThan(0);
    expect(level.pathWaypoints.length).toBeGreaterThan(0);
    expect(level.pathWaypoints.every((path) => path.length > 1)).toBe(true);
  });

  it("covers every enemy and tower type once each", () => {
    const enemyTypes = new Set(level.enemies.map((e) => e.type));
    const towerTypes = new Set(level.towers.map((t) => t.type));
    for (const type of ["basic", "fast", "tank", "medic", "splitter"]) {
      expect(enemyTypes.has(type as never), `enemy type ${type} missing`).toBe(true);
    }
    for (const type of ["basic", "slow", "aoe", "laser", "relay", "chain"]) {
      expect(towerTypes.has(type as never), `tower type ${type} missing`).toBe(true);
    }
  });

  it("is not playable: no waves and no enemy weights", () => {
    expect(level.waveConfigs.length).toBe(0);
    expect(level.enemyWeights).toBeNull();
  });

  it("keeps every showcase entity within the grid bounds", () => {
    const inBounds = (v: number) => v >= 0 && v < level.gridSize;
    for (const tower of level.towers) {
      expect(inBounds(tower.gridX)).toBe(true);
      expect(inBounds(tower.gridZ)).toBe(true);
    }
    // Enemy world coords sit one tile inside the board (offset −gridSize/2,
    // tile size 1): a 20×20 grid spans [−9.5, 10.5) per axis.
    const worldInBounds = (v: number) => v >= -level.gridSize / 2 && v <= level.gridSize / 2 + 1;
    for (const enemy of level.enemies) {
      expect(worldInBounds(enemy.x)).toBe(true);
      expect(worldInBounds(enemy.z)).toBe(true);
    }
  });
});
