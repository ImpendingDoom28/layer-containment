import {
  levelConfigSchema,
  type LevelConfigData,
} from "../core/configs/levelConfig";
import type { LevelEditorValidationIssue } from "../core/types/editor";
import { MAX_GRID_SIZE, MIN_GRID_SIZE } from "./gridSizeLimits";
import { waypointToTile } from "./levelEditor";

/**
 * Validate a level with the exact rules the level editor runs
 * (`validateDraftLevel` delegates to this). Returns the list of issues
 * (empty when the level is valid).
 */
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
    level.startingHealth !== undefined &&
    (!Number.isFinite(level.startingHealth) || level.startingHealth < 1)
  ) {
    customIssues.push({
      path: "startingHealth",
      message: "Starting health must be at least 1.",
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
