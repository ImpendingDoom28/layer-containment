import {
  DEFAULT_STARTING_HEALTH,
  type LevelConfigData,
} from "../core/configs/levelConfig";
import {
  DEFAULT_WATER_BODY_DEPTH,
  DEFAULT_WATER_BODY_HEIGHT,
  DEFAULT_WATER_BODY_WIDTH,
  type Building,
  type PathWaypoint,
  type WaterBody,
  type WaterBodyConfig,
  type WaveConfig,
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

export const waypointToTileUnclamped = (
  waypoint: PathWaypoint,
  gridSize: number,
  tileSize: number
): TileData => {
  const gridOffset = getLevelGridOffset(gridSize, tileSize);
  return {
    gridX: Math.round((waypoint.x - gridOffset - tileSize / 2) / tileSize),
    gridZ: Math.round((waypoint.z - gridOffset - tileSize / 2) / tileSize),
  };
};

export const waypointToTile = (
  waypoint: PathWaypoint,
  gridSize: number,
  tileSize: number
): TileData => {
  const { gridX, gridZ } = waypointToTileUnclamped(
    waypoint,
    gridSize,
    tileSize
  );
  return {
    gridX: clampToGrid(gridX, gridSize),
    gridZ: clampToGrid(gridZ, gridSize),
  };
};

// Convert building grid coordinates to world coordinates
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

export const withRecalculatedWaterCoordinates = (
  water: WaterBodyConfig,
  gridSize: number,
  tileSize: number
): WaterBody => {
  const width = water.width ?? DEFAULT_WATER_BODY_WIDTH;
  const depth = water.depth ?? DEFAULT_WATER_BODY_DEPTH;
  const height = DEFAULT_WATER_BODY_HEIGHT;
  return {
    id: water.id,
    gridX: water.gridX,
    gridZ: water.gridZ,
    shape: water.shape,
    color: water.color,
    width,
    depth,
    height,
    x: tileToWorldCoordinate(water.gridX, gridSize, tileSize),
    z: tileToWorldCoordinate(water.gridZ, gridSize, tileSize),
  };
};

export const clampWaterToGrid = (
  water: WaterBodyConfig | WaterBody,
  gridSize: number
): WaterBodyConfig => ({
  id: water.id,
  gridX: Math.max(0, Math.min(gridSize - 1, water.gridX)),
  gridZ: Math.max(0, Math.min(gridSize - 1, water.gridZ)),
  shape: water.shape,
  color: water.color,
  ...(water.width !== undefined ? { width: water.width } : {}),
  ...(water.depth !== undefined ? { depth: water.depth } : {}),
});

export const filterWatersToGrid = (
  waters: WaterBodyConfig[],
  gridSize: number
): WaterBodyConfig[] => {
  const filtered = waters.filter(
    (w) =>
      w.gridX >= 0 && w.gridX < gridSize && w.gridZ >= 0 && w.gridZ < gridSize
  );
  const seen = new Set<string>();
  const out: WaterBodyConfig[] = [];
  for (const w of filtered) {
    const key = `${w.gridX},${w.gridZ}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
};

export const createEmptyLevelConfig = (
  name: string = DEFAULT_LEVEL_NAME
): LevelConfigData => {
  return {
    name,
    label: "",
    description: "",
    startingHealth: DEFAULT_STARTING_HEALTH,
    startingMoney: DEFAULT_STARTING_MONEY,
    gridSize: DEFAULT_GRID_SIZE,
    waters: [],
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
  return wave.enemies.reduce(
    (total, enemyGroup) => total + enemyGroup.count,
    0
  );
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
  const watersFiltered = filterWatersToGrid(level.waters ?? [], level.gridSize);
  return {
    ...level,
    name: level.name?.trim() || DEFAULT_LEVEL_NAME,
    waters: watersFiltered,
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
  const watersFiltered = filterWatersToGrid(level.waters ?? [], level.gridSize);
  return {
    ...level,
    name: level.name.trim(),
    waters: watersFiltered,
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
