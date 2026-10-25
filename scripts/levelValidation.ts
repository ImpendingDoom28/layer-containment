import { getLevelGridOffset } from "../src/utils/levelEditor";
import { isGridTileOnPath } from "../src/utils/pathUtils";
import type { LevelDefinition } from "../src/utils/levelBuilder";

/** Every grid cell any path segment covers, using the game's own rule. */
export const computePathTiles = (
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

export type LevelValidationResult = {
  issues: string[];
  pathTiles: Set<string>;
};

/**
 * Grid-geometry checks on a level definition — the rules the editor's
 * validateLevel can't see because it validates the built level: paths in
 * bounds and axis-aligned, buildings/waters in bounds, off the path, and
 * without duplicates or building/water overlaps. Collects every issue found
 * (never throws or exits), so callers decide how to report it.
 */
export const validateLevelDefinition = (
  definition: LevelDefinition,
  tileSize: number,
  pathWidth: number
): LevelValidationResult => {
  const issues: string[] = [];
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
      issues.push(`path ${pathIndex} needs at least 2 waypoints`);
    }
    cells.forEach(([gridX, gridZ]) => {
      if (!inBounds(gridX, gridZ)) {
        issues.push(`path ${pathIndex} waypoint out of grid: ${gridX},${gridZ}`);
      }
    });
    for (let i = 0; i < cells.length - 1; i++) {
      const [ax, az] = cells[i];
      const [bx, bz] = cells[i + 1];
      if (ax !== bx && az !== bz) {
        issues.push(
          `path ${pathIndex} non-axis-aligned segment (${ax},${az})->(${bx},${bz}); the editor's path tool is orthogonal`
        );
      }
    }
  });

  const pathTiles = computePathTiles(definition, tileSize, pathWidth);

  const buildingTiles = new Set<string>();
  (definition.buildings ?? []).forEach((spec) => {
    if (!inBounds(spec.gridX, spec.gridZ)) {
      issues.push(`building out of grid: ${spec.gridX},${spec.gridZ}`);
    }
    if (pathTiles.has(`${spec.gridX},${spec.gridZ}`)) {
      issues.push(`building on path: ${spec.gridX},${spec.gridZ}`);
    }
    if (buildingTiles.has(`${spec.gridX},${spec.gridZ}`)) {
      issues.push(`duplicate building tile: ${spec.gridX},${spec.gridZ}`);
    }
    buildingTiles.add(`${spec.gridX},${spec.gridZ}`);
  });

  const waterTiles = new Set<string>();
  (definition.waters ?? []).forEach((spec) => {
    if (!inBounds(spec.gridX, spec.gridZ)) {
      issues.push(`water out of grid: ${spec.gridX},${spec.gridZ}`);
    }
    if (pathTiles.has(`${spec.gridX},${spec.gridZ}`)) {
      issues.push(`water on path: ${spec.gridX},${spec.gridZ}`);
    }
    if (waterTiles.has(`${spec.gridX},${spec.gridZ}`)) {
      issues.push(`duplicate water tile: ${spec.gridX},${spec.gridZ}`);
    }
    waterTiles.add(`${spec.gridX},${spec.gridZ}`);
  });

  for (const tile of waterTiles) {
    if (buildingTiles.has(tile)) {
      issues.push(`a building overlaps a water tile: ${tile}`);
    }
  }

  return { issues, pathTiles };
};
