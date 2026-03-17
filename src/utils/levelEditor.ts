import type { LevelConfigData } from "../core/levelConfig";
import type {
  Building,
  EnemyType,
  PathWaypoint,
  WaveConfig,
} from "../core/types/game";
import type { TileData } from "../core/types/utils";

const DEFAULT_LEVEL_NAME = "custom";
const DEFAULT_STARTING_MONEY = 1000;
const DEFAULT_GRID_SIZE = 20;
const DEFAULT_PATH_HEIGHT = 0;

const clampToGrid = (value: number, gridSize: number) => {
  return Math.max(0, Math.min(gridSize - 1, Math.round(value)));
};

export const getLevelGridOffset = (gridSize: number, tileSize: number) => {
  return -(gridSize * tileSize) / 2;
};

export const tileToWorldCoordinate = (
  gridValue: number,
  gridSize: number,
  tileSize: number
) => {
  return getLevelGridOffset(gridSize, tileSize) + gridValue + tileSize / 2;
};

export const tileToWaypoint = (
  tile: TileData,
  gridSize: number,
  tileSize: number
): PathWaypoint => {
  return {
    x: tileToWorldCoordinate(tile.gridX, gridSize, tileSize),
    y: DEFAULT_PATH_HEIGHT,
    z: tileToWorldCoordinate(tile.gridZ, gridSize, tileSize),
  };
};

export const waypointToTile = (
  waypoint: PathWaypoint,
  gridSize: number,
  tileSize: number
): TileData => {
  const gridOffset = getLevelGridOffset(gridSize, tileSize);
  const gridX = clampToGrid(
    (waypoint.x - gridOffset - tileSize / 2) / tileSize,
    gridSize
  );
  const gridZ = clampToGrid(
    (waypoint.z - gridOffset - tileSize / 2) / tileSize,
    gridSize
  );

  return {
    gridX,
    gridZ,
  };
};

export const withRecalculatedBuildingCoordinates = (
  building: Building,
  gridSize: number,
  tileSize: number
): Building => {
  return {
    ...building,
    x: tileToWorldCoordinate(building.gridX, gridSize, tileSize),
    z: tileToWorldCoordinate(building.gridZ, gridSize, tileSize),
  };
};

export const createEmptyLevelConfig = (
  name: string = DEFAULT_LEVEL_NAME
): LevelConfigData => {
  return {
    name,
    startingMoney: DEFAULT_STARTING_MONEY,
    gridSize: DEFAULT_GRID_SIZE,
    pathWaypoints: [[]],
    waveConfigs: [],
    buildings: [],
    towers: [],
    enemies: [],
    projectiles: [],
    enemyWeights: null,
  };
};

export const computeWaveTotalEnemies = (wave: WaveConfig) => {
  return wave.enemies.reduce((total, enemyGroup) => total + enemyGroup.count, 0);
};

export const withRecomputedWaveTotals = (
  waveConfigs: WaveConfig[]
): WaveConfig[] => {
  return waveConfigs.map((wave) => ({
    ...wave,
    totalEnemies: computeWaveTotalEnemies(wave),
  }));
};

export const sanitizeLevelFileName = (name: string) => {
  const normalized = name.trim().toLowerCase();
  const safeName = normalized
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/_+/g, "_")
    .replace(/(^_+)|(_+$)/g, "");

  return safeName || DEFAULT_LEVEL_NAME;
};

export const buildLevelFileName = (name: string) => {
  return `level_${sanitizeLevelFileName(name)}.json`;
};

export const normalizeImportedLevel = (
  level: LevelConfigData,
  tileSize: number
): LevelConfigData => {
  return {
    ...level,
    name: level.name?.trim() || DEFAULT_LEVEL_NAME,
    waveConfigs: withRecomputedWaveTotals(level.waveConfigs),
    buildings: level.buildings.map((building) =>
      withRecalculatedBuildingCoordinates(building, level.gridSize, tileSize)
    ),
  };
};

export const createExportableLevel = (
  level: LevelConfigData,
  tileSize: number
): LevelConfigData => {
  return {
    ...level,
    name: level.name.trim(),
    waveConfigs: withRecomputedWaveTotals(level.waveConfigs),
    buildings: level.buildings.map((building) =>
      withRecalculatedBuildingCoordinates(building, level.gridSize, tileSize)
    ),
  };
};

export const resizePathWaypoints = (
  pathWaypoints: PathWaypoint[][],
  currentGridSize: number,
  nextGridSize: number,
  tileSize: number
) => {
  return pathWaypoints.map((path) =>
    path.map((waypoint) =>
      tileToWaypoint(
        waypointToTile(waypoint, currentGridSize, tileSize),
        nextGridSize,
        tileSize
      )
    )
  );
};

export const getDefaultEnemyWeights = (
  enemyTypes: EnemyType[]
): Record<EnemyType, number> => {
  return enemyTypes.reduce(
    (weights, enemyType) => ({
      ...weights,
      [enemyType]: 1,
    }),
    {} as Record<EnemyType, number>
  );
};
