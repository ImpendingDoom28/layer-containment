import type { EnemyType } from "./game";

export type LevelEditorTool =
  | "select"
  | "placeBuilding"
  | "drawPath"
  | "setSpawn"
  | "setBase"
  | "erase";

export type LevelEditorSelection =
  | {
      type: "building";
      id: number;
    }
  | {
      type: "path";
      pathIndex: number;
    }
  | {
      type: "waypoint";
      pathIndex: number;
      waypointIndex: number;
    }
  | null;

export type LevelEditorValidationIssue = {
  path: string;
  message: string;
};

export type LevelEnemyWeightsDraft = Partial<Record<EnemyType, number>>;
