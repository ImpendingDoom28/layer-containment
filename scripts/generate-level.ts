#!/usr/bin/env tsx
/**
 * Generic level generator.
 *
 * Usage:
 *   npx tsx scripts/generate-level.ts <levelName>
 *
 * Looks up `LEVELS[levelName]` from scripts/levels/levelDefinitions.ts (a
 * grid-based LevelDefinition per level), builds the level with
 * src/utils/levelBuilder.ts (the same grid -> world mapping the editor uses),
 * validates it with scripts/levelValidation.ts (off-path geometry rules) plus
 * validateLevel (the exact rules the level editor runs via validateDraftLevel),
 * and writes public/configs/levels/<levelName>.json.
 *
 * To add a level: append an entry to scripts/levels/levelDefinitions.ts,
 * then run the script.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { buildLevel, type LevelDefinition } from "../src/utils/levelBuilder";
import { validateLevel } from "../src/utils/validateLevel";
import { LEVELS } from "./levels/levelDefinitions";
import { validateLevelDefinition } from "./levelValidation";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

/** Print the failure reason and exit non-zero. */
const fail = (message: string): never => {
  console.error(`Level generation failed: ${message}`);
  process.exit(1);
};

/** Build, validate, and write one level to public/configs/levels/<name>.json. */
const writeLevel = (
  levelName: string,
  definition: LevelDefinition,
  tileSize: number,
  pathWidth: number
): void => {
  const { issues, pathTiles } = validateLevelDefinition(
    definition,
    tileSize,
    pathWidth
  );
  if (issues.length > 0) {
    fail(
      `invalid level definition:\n  ` + issues.join("\n  ")
    );
  }

  const level = buildLevel(definition, tileSize);
  const validationIssues = validateLevel(level, tileSize);
  if (validationIssues.length > 0) {
    fail(
      `validation failed with ${validationIssues.length} issue(s):\n  ` +
        validationIssues
          .map((issue) => `${issue.path}: ${issue.message}`)
          .join("\n  ")
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
