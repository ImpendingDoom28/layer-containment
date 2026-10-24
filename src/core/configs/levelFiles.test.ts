import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { PLAYABLE_LEVEL_IDS } from "../../constants/playableLevels";
import {
  computeWaveTotalEnemies,
  waypointToTileUnclamped,
} from "../../utils/levelEditor";
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
