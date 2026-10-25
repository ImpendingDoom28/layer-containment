import type { LevelConfigData } from "../core/configs/levelConfig";
import type { WaveConfig, WaveEnemyGroup } from "../core/types/game";
import {
  tileToWaypoint,
  withRecalculatedBuildingCoordinates,
  withRecomputedWaveTotals,
} from "./levelEditor";

// Level authoring: describe a level in grid coordinates and turn it into a
// LevelConfigData. Reused by the level generation script (scripts/generate-level.ts)
// so generated levels go through the same grid -> world mapping as the editor.
export type LevelCell = [gridX: number, gridZ: number];

export type LevelBuildingSpec = {
  gridX: number;
  gridZ: number;
  shape?: "box" | "cylinder";
  width?: number;
  depth?: number;
  height?: number;
  color?: string;
};

export type LevelWaterSpec = {
  gridX: number;
  gridZ: number;
  color?: string;
};

export type LevelDefinition = {
  name: string;
  startingMoney: number;
  gridSize: number;
  tileColor?: string;
  groundColor?: string;
  paths: LevelCell[][];
  buildings?: LevelBuildingSpec[];
  waters?: LevelWaterSpec[];
  waves: WaveEnemyGroup[][];
  enemyWeights?: LevelConfigData["enemyWeights"];
};

const DEFAULT_BUILDING_SHAPE: "box" | "cylinder" = "box";
const DEFAULT_BUILDING_FOOTPRINT = 0.8;
const DEFAULT_BUILDING_HEIGHT = 2;
const DEFAULT_BUILDING_COLOR = "#8b7355";
const DEFAULT_WATER_SHAPE: "box" | "cylinder" = "box";
const DEFAULT_WATER_COLOR = "#0e7490";

/** Convert grid waypoints into world-space path waypoints (y = 0). */
export const toPathWaypoints = (
  cells: LevelCell[],
  gridSize: number,
  tileSize: number
) => {
  return cells.map(([gridX, gridZ]) =>
    tileToWaypoint({ gridX, gridZ }, gridSize, tileSize)
  );
};

/** Convert building specs into Building entries with recomputed world coordinates. */
export const toBuildings = (
  specs: LevelBuildingSpec[],
  gridSize: number,
  tileSize: number
) => {
  return specs.map((spec, index) =>
    withRecalculatedBuildingCoordinates(
      {
        id: index + 1,
        gridX: spec.gridX,
        gridZ: spec.gridZ,
        x: 0,
        z: 0,
        shape: spec.shape ?? DEFAULT_BUILDING_SHAPE,
        width: spec.width ?? DEFAULT_BUILDING_FOOTPRINT,
        depth: spec.depth ?? DEFAULT_BUILDING_FOOTPRINT,
        height: spec.height ?? DEFAULT_BUILDING_HEIGHT,
        color: spec.color ?? DEFAULT_BUILDING_COLOR,
      },
      gridSize,
      tileSize
    )
  );
};

/** Convert water specs into WaterBodyConfig entries (footprint uses in-game defaults). */
export const toWaters = (specs: LevelWaterSpec[]) => {
  return specs.map((spec, index) => ({
    id: index + 1,
    gridX: spec.gridX,
    gridZ: spec.gridZ,
    shape: DEFAULT_WATER_SHAPE,
    color: spec.color ?? DEFAULT_WATER_COLOR,
  }));
};

/** Convert per-wave enemy group lists into WaveConfig entries with recomputed totals. */
export const toWaves = (waveGroups: WaveEnemyGroup[][]): WaveConfig[] => {
  // totalEnemies is a placeholder; withRecomputedWaveTotals overwrites it from the groups.
  return withRecomputedWaveTotals(
    waveGroups.map((enemies) => ({ enemies, totalEnemies: 0 }))
  );
};

/** Build a full level config from a grid-based definition. */
export const buildLevel = (
  definition: LevelDefinition,
  tileSize: number
): LevelConfigData => {
  return {
    name: definition.name,
    startingMoney: definition.startingMoney,
    gridSize: definition.gridSize,
    ...(definition.tileColor !== undefined
      ? { tileColor: definition.tileColor }
      : {}),
    ...(definition.groundColor !== undefined
      ? { groundColor: definition.groundColor }
      : {}),
    waters: toWaters(definition.waters ?? []),
    pathWaypoints: definition.paths.map((cells) =>
      toPathWaypoints(cells, definition.gridSize, tileSize)
    ),
    waveConfigs: toWaves(definition.waves),
    buildings: toBuildings(
      definition.buildings ?? [],
      definition.gridSize,
      tileSize
    ),
    towers: [],
    enemies: [],
    projectiles: [],
    enemyWeights: definition.enemyWeights ?? null,
  };
};
