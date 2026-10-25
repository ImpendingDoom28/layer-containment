#!/usr/bin/env tsx
/**
 * Generic level generator.
 *
 * Usage:
 *   npx tsx scripts/generate-level.ts <levelName>
 *
 * Reads `LEVELS` below (a grid-based LevelDefinition per level), builds the
 * level with src/utils/levelBuilder.ts (the same grid -> world mapping the
 * editor uses), validates it with validateLevel (the exact rules the level
 * editor runs via validateDraftLevel) plus off-path geometry checks (the
 * game's own isGridTileOnPath rule), and writes
 * public/configs/levels/<levelName>.json.
 *
 * To add a level: append an entry to LEVELS, then run the script.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  buildLevel,
  type LevelBuildingSpec,
  type LevelDefinition,
  type LevelWaterSpec,
} from "../src/utils/levelBuilder";
import { getLevelGridOffset } from "../src/utils/levelEditor";
import { isGridTileOnPath } from "../src/utils/pathUtils";
import { validateLevel } from "../src/utils/validateLevel";
import type { WaveEnemyGroup } from "../src/core/types/game";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

type WaveGroup = WaveEnemyGroup;

/** Build an enemy group entry for a wave. */
const g = (
  type: WaveGroup["type"],
  count: number,
  spawnInterval: number
): WaveGroup => ({ type, count, spawnInterval });

/** Build an unbuildable ruin/obstacle (a building) at a grid cell. */
const building = (
  gridX: number,
  gridZ: number,
  shape: LevelBuildingSpec["shape"],
  width: number,
  depth: number,
  height: number,
  color: string
): LevelBuildingSpec => ({ gridX, gridZ, shape, width, depth, height, color });

/** Build a water (contamination) tile at a grid cell. */
const water = (gridX: number, gridZ: number): LevelWaterSpec => ({
  gridX,
  gridZ,
});

// Level definitions in grid coordinates. Each entry is one playable level.
const LEVELS: Record<string, LevelDefinition> = {
  // Sector 2 "The Convergence": two gates (top-left / top-right) that converge
  // into a shared final corridor to a single core, so towers on the corridor
  // hit both fronts. Ruins + corner contamination split the map.
  level_2: {
    name: "2",
    startingMoney: 200,
    gridSize: 20,
    paths: [
      [
        [3, 0],
        [3, 4],
        [7, 4],
        [7, 8],
        [3, 8],
        [3, 12],
        [9, 12],
        [9, 16],
        [9, 19],
      ],
      [
        [16, 0],
        [16, 4],
        [12, 4],
        [12, 8],
        [16, 8],
        [16, 12],
        [9, 12],
        [9, 16],
        [9, 19],
      ],
    ],
    buildings: [
      building(5, 2, "box", 0.9, 0.9, 2.2, "#8b7355"),
      building(14, 2, "cylinder", 0.8, 0.8, 1.9, "#6b7280"),
      building(5, 6, "box", 0.86, 0.86, 2.1, "#78716c"),
      building(14, 6, "cylinder", 0.7, 0.7, 1.8, "#57534e"),
      building(9, 6, "box", 0.9, 0.9, 2.3, "#8b7355"),
      building(9, 10, "cylinder", 0.75, 0.75, 2.0, "#6b7280"),
      building(2, 16, "box", 0.8, 0.8, 1.9, "#78716c"),
      building(17, 16, "cylinder", 0.7, 0.7, 1.8, "#57534e"),
    ],
    waters: [
      water(1, 17),
      water(2, 17),
      water(1, 18),
      water(2, 18),
      water(17, 17),
      water(18, 17),
      water(17, 18),
      water(18, 18),
      water(8, 15),
      water(10, 15),
    ],
    waves: [
      [g("basic", 10, 1.0)],
      [
        g("basic", 12, 0.8),
        g("fast", 4, 1.1),
        g("medic", 1, 1.0),
      ],
      [
        g("basic", 14, 0.7),
        g("fast", 6, 1.0),
      ],
      [
        g("basic", 16, 0.6),
        g("fast", 8, 0.9),
        g("tank", 2, 2.0),
        g("medic", 1, 1.0),
      ],
      [
        g("basic", 18, 0.5),
        g("fast", 10, 0.8),
        g("tank", 3, 1.5),
      ],
      [
        g("basic", 20, 0.45),
        g("fast", 12, 0.7),
        g("tank", 4, 1.3),
        g("medic", 2, 1.0),
      ],
      [
        g("basic", 22, 0.4),
        g("fast", 14, 0.6),
        g("tank", 5, 1.2),
      ],
      [
        g("basic", 26, 0.35),
        g("fast", 16, 0.5),
        g("tank", 8, 1.0),
        g("medic", 3, 1.0),
      ],
    ],
  },

  // Sector 3 "The Deep Vein": the breach's source is finally located — a
  // hollow vein running under the core rock. Three gates (top-left,
  // top-center, top-right) each zigzag down through a mined-out sector, then
  // all three merge into one shared vein corridor: a full-width cross-row at
  // gridZ 13 that feeds a single final approach down the x=9 column to the
  // core at (9,19). The left and right fronts travel in opposite directions
  // along the shared row, so the map reads as collapsing inward toward the
  // core. Ruins are mine supports and old excavation rigs; the pools flanking
  // the core approach are molten ventings from the vein.
  level_3: {
    name: "3",
    startingMoney: 250,
    gridSize: 20,
    paths: [
      [
        [2, 0],
        [2, 4],
        [6, 4],
        [6, 9],
        [3, 9],
        [3, 13],
        [9, 13],
        [9, 19],
      ],
      [
        [10, 0],
        [10, 5],
        [7, 5],
        [7, 10],
        [13, 10],
        [13, 13],
        [9, 13],
        [9, 19],
      ],
      [
        [17, 0],
        [17, 4],
        [14, 4],
        [14, 9],
        [16, 9],
        [16, 13],
        [9, 13],
        [9, 19],
      ],
    ],
    buildings: [
      building(0, 2, "box", 0.8, 0.8, 1.9, "#78716c"),
      building(4, 2, "cylinder", 0.7, 0.7, 1.8, "#57534e"),
      building(11, 3, "box", 0.9, 0.9, 2.2, "#8b7355"),
      building(15, 3, "box", 0.8, 0.8, 1.9, "#78716c"),
      building(12, 5, "box", 0.86, 0.86, 2.1, "#8b7355"),
      building(5, 6, "box", 0.8, 0.8, 1.9, "#78716c"),
      building(1, 7, "cylinder", 0.75, 0.75, 2.0, "#6b7280"),
      building(12, 8, "box", 0.86, 0.86, 2.1, "#78716c"),
      building(18, 7, "box", 0.8, 0.8, 1.9, "#78716c"),
      building(10, 8, "cylinder", 0.75, 0.75, 2.0, "#6b7280"),
      building(1, 10, "box", 0.8, 0.8, 1.9, "#78716c"),
      building(5, 11, "cylinder", 0.75, 0.75, 2.0, "#6b7280"),
      building(8, 12, "box", 0.86, 0.86, 2.1, "#8b7355"),
      building(15, 12, "cylinder", 0.7, 0.7, 1.8, "#57534e"),
      building(6, 15, "box", 0.8, 0.8, 1.9, "#78716c"),
      building(13, 15, "cylinder", 0.75, 0.75, 2.0, "#6b7280"),
    ],
    waters: [
      water(1, 16),
      water(2, 16),
      water(1, 17),
      water(2, 17),
      water(17, 16),
      water(18, 16),
      water(17, 17),
      water(18, 17),
      water(7, 16),
      water(7, 17),
      water(12, 16),
      water(12, 17),
    ],
    waves: [
      [g("basic", 12, 0.9)],
      [
        g("basic", 14, 0.8),
        g("fast", 5, 1.0),
        g("medic", 1, 1.0),
      ],
      [
        g("basic", 16, 0.7),
        g("fast", 7, 0.9),
      ],
      [
        g("basic", 18, 0.6),
        g("fast", 9, 0.85),
        g("tank", 2, 2.0),
        g("medic", 1, 1.0),
      ],
      [
        g("basic", 20, 0.55),
        g("fast", 11, 0.75),
        g("tank", 3, 1.6),
        g("medic", 2, 1.0),
      ],
      [
        g("basic", 22, 0.5),
        g("fast", 13, 0.65),
        g("tank", 4, 1.4),
        g("medic", 2, 0.9),
      ],
      [
        g("basic", 26, 0.45),
        g("fast", 15, 0.6),
        g("tank", 5, 1.2),
      ],
      [
        g("basic", 28, 0.4),
        g("fast", 18, 0.5),
        g("tank", 6, 1.1),
        g("medic", 3, 0.9),
      ],
      [
        g("basic", 32, 0.35),
        g("fast", 20, 0.45),
        g("tank", 8, 1.0),
        g("medic", 4, 0.9),
      ],
    ],
  },
};

/** Print the failure reason and exit non-zero. */
const fail = (message: string): never => {
  console.error(`Level generation failed: ${message}`);
  process.exit(1);
};

/** Every grid cell any path segment covers, using the game's own rule. */
const computePathTiles = (
  definition: LevelDefinition,
  tileSize: number,
  pathWidth: number
): Set<string> => {
  const { gridSize } = definition;
  const gridOffset = getLevelGridOffset(gridSize, tileSize);
  const waypoints = definition.paths.map((cells) =>
    cells.map(([gridX, gridZ]) => ({
      x: gridOffset + gridX + tileSize / 2,
      y: 0,
      z: gridOffset + gridZ + tileSize / 2,
    }))
  );
  const pathTiles = new Set<string>();
  for (let gridX = 0; gridX < gridSize; gridX++) {
    for (let gridZ = 0; gridZ < gridSize; gridZ++) {
      if (isGridTileOnPath(waypoints, gridX, gridZ, gridOffset, tileSize, pathWidth)) {
        pathTiles.add(`${gridX},${gridZ}`);
      }
    }
  }
  return pathTiles;
};

/** Extra geometry checks beyond the editor's validation. */
const checkGeometry = (
  definition: LevelDefinition,
  pathTiles: Set<string>
): void => {
  const { gridSize } = definition;
  const inBounds = (gridX: number, gridZ: number) =>
    Number.isInteger(gridX) &&
    Number.isInteger(gridZ) &&
    gridX >= 0 &&
    gridX < gridSize &&
    gridZ >= 0 &&
    gridZ < gridSize;

  definition.paths.forEach((cells, pathIndex) => {
    if (cells.length < 2) {
      fail(`path ${pathIndex} needs at least 2 waypoints`);
    }
    cells.forEach(([gridX, gridZ]) => {
      if (!inBounds(gridX, gridZ)) {
        fail(`waypoint out of grid: ${gridX},${gridZ}`);
      }
    });
    for (let i = 0; i < cells.length - 1; i++) {
      const [ax, az] = cells[i];
      const [bx, bz] = cells[i + 1];
      if (ax !== bx && az !== bz) {
        fail(
          `non-axis-aligned segment (${ax},${az})->(${bx},${bz}); the editor's path tool is orthogonal`
        );
      }
    }
  });

  const buildingTiles = new Set<string>();
  (definition.buildings ?? []).forEach((spec) => {
    if (!inBounds(spec.gridX, spec.gridZ)) {
      fail(`building out of grid: ${spec.gridX},${spec.gridZ}`);
    }
    if (pathTiles.has(`${spec.gridX},${spec.gridZ}`)) {
      fail(`building on path: ${spec.gridX},${spec.gridZ}`);
    }
    buildingTiles.add(`${spec.gridX},${spec.gridZ}`);
  });

  const waterTiles = new Set<string>();
  (definition.waters ?? []).forEach((spec) => {
    if (!inBounds(spec.gridX, spec.gridZ)) {
      fail(`water out of grid: ${spec.gridX},${spec.gridZ}`);
    }
    if (pathTiles.has(`${spec.gridX},${spec.gridZ}`)) {
      fail(`water on path: ${spec.gridX},${spec.gridZ}`);
    }
    if (waterTiles.has(`${spec.gridX},${spec.gridZ}`)) {
      fail(`duplicate water tile: ${spec.gridX},${spec.gridZ}`);
    }
    waterTiles.add(`${spec.gridX},${spec.gridZ}`);
  });

  for (const tile of waterTiles) {
    if (buildingTiles.has(tile)) {
      fail(`a building overlaps a water tile: ${tile}`);
    }
  }
};
/** Build, validate, and write one level to public/configs/levels/<name>.json. */
const writeLevel = (
  levelName: string,
  definition: LevelDefinition,
  tileSize: number,
  pathWidth: number
): void => {
  const pathTiles = computePathTiles(definition, tileSize, pathWidth);
  checkGeometry(definition, pathTiles);

  const level = buildLevel(definition, tileSize);
  const issues = validateLevel(level, tileSize);
  if (issues.length > 0) {
    fail(
      `validation failed with ${issues.length} issue(s):\n  ` +
        issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n  ")
    );
  }

  const outputPath = path.join(
    PROJECT_ROOT,
    "public",
    "configs",
    "levels",
    `${levelName}.json`
  );
  writeFileSync(outputPath, `${JSON.stringify(level, null, 2)}\n`);

  const totalEnemies = level.waveConfigs.reduce(
    (sum, wave) => sum + wave.totalEnemies,
    0
  );
  console.log(`Wrote ${outputPath}`);
  console.log(`  path tiles blocked: ${pathTiles.size}`);
  console.log(`  buildings: ${level.buildings.length}`);
  console.log(`  water tiles: ${level.waters.length}`);
  console.log(`  waves: ${level.waveConfigs.length} (total enemies: ${totalEnemies})`);
};

const isPositiveFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/** Read and validate tileSize/pathWidth from game.json (the path-geometry constants). */
const loadGameConstants = (): { tileSize: number; pathWidth: number } => {
  const gameConfigPath = path.join(PROJECT_ROOT, "public", "configs", "game.json");
  const gameConfig = JSON.parse(
    readFileSync(gameConfigPath, "utf8")
  ) as Record<string, unknown>;
  const { tileSize, pathWidth } = gameConfig;
  if (!isPositiveFiniteNumber(tileSize) || !isPositiveFiniteNumber(pathWidth)) {
    fail(
      `invalid public/configs/game.json: tileSize (${tileSize}) and pathWidth (${pathWidth}) must be finite numbers greater than zero`
    );
  }
  return { tileSize, pathWidth };
};

/** Parse the level name, load tileSize/pathWidth from game.json, and generate the level. */
const main = (): void => {
  const levelName = process.argv[2];
  if (!levelName) {
    fail(
      `missing level name. Available: ${Object.keys(LEVELS).join(", ")}`
    );
  }
  const definition = LEVELS[levelName];
  if (!definition) {
    fail(`unknown level "${levelName}". Available: ${Object.keys(LEVELS).join(", ")}`);
  }

  // tileSize / pathWidth are the level's rendering constants; read them from the
  // game config file so the generated geometry matches the game's path width.
  const { tileSize, pathWidth } = loadGameConstants();
  writeLevel(levelName, definition, tileSize, pathWidth);
};

void main();
