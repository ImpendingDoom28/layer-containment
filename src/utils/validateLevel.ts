import {
  levelConfigSchema,
  type LevelConfigData,
} from "../core/configs/levelConfig";
import type { LevelEditorValidationIssue } from "../core/types/editor";
import { MAX_GRID_SIZE, MIN_GRID_SIZE } from "./gridSizeLimits";
import { waypointToTile } from "./levelEditor";

// Shared level validation. Used by the level editor (validateDraftLevel) and
// by the level generation script (scripts/generate-level.ts), so both check a
// level with the exact same rules.
export const validateLevel = (
  level: LevelConfigData,
  tileSize: number
): LevelEditorValidationIssue[] => {
  const result = levelConfigSchema.safeParse(level);
  const customIssues: LevelEditorValidationIssue[] = [];

  if (level.name.trim().length === 0) {
    customIssues.push({
      path: "name",
      message: "Level name is required.",
    });
  }

  if (
    !Number.isFinite(level.gridSize) ||
    !Number.isInteger(level.gridSize) ||
    level.gridSize < MIN_GRID_SIZE ||
    level.gridSize > MAX_GRID_SIZE
  ) {
    customIssues.push({
      path: "gridSize",
      message: `Grid size must be a whole number from ${MIN_GRID_SIZE} to ${MAX_GRID_SIZE}.`,
    });
  }

  if (level.pathWaypoints.length === 0) {
    customIssues.push({
      path: "pathWaypoints",
      message: "At least one path is required.",
    });
  }

  level.pathWaypoints.forEach((path, index) => {
    if (path.length < 2) {
      customIssues.push({
        path: `pathWaypoints.${index}`,
        message: "Each path needs at least 2 waypoints.",
      });
    }
  });

  const waters = level.waters ?? [];

  level.pathWaypoints.forEach((path, pathIndex) => {
    path.forEach((waypoint, waypointIndex) => {
      const tile = waypointToTile(waypoint, level.gridSize, tileSize);
      const onWater = waters.some(
        (w) => w.gridX === tile.gridX && w.gridZ === tile.gridZ
      );
      if (onWater) {
        customIssues.push({
          path: `pathWaypoints.${pathIndex}.${waypointIndex}`,
          message: "Waypoint cannot be on water.",
        });
      }
    });
  });

  if (result.success) {
    return customIssues;
  }

  return [
    ...result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
    ...customIssues,
  ];
};
