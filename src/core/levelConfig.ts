import { z } from "zod";

import { loadFile } from "../utils/fileLoader";
import type {
  Building,
  Enemy,
  PathWaypoint,
  Projectile,
  WaveConfig,
} from "./types/game";

const towerTypeSchema = z.enum(["basic", "slow", "aoe", "laser"]);
const enemyTypeSchema = z.enum(["basic", "fast", "tank"]);
const projectileTypeSchema = z.enum(["aoe", "single", "beam"]);
const buildingShapeSchema = z.enum(["box", "cylinder"]);

const pathWaypointSchema: z.ZodType<PathWaypoint> = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

const waveEnemyGroupSchema = z.object({
  type: enemyTypeSchema,
  count: z.number(),
  spawnInterval: z.number(),
});

const waveConfigSchema: z.ZodType<WaveConfig> = z.object({
  totalEnemies: z.number(),
  enemies: z.array(waveEnemyGroupSchema),
});

const buildingSchema: z.ZodType<Building> = z.object({
  id: z.number(),
  gridX: z.number(),
  gridZ: z.number(),
  x: z.number(),
  z: z.number(),
  shape: buildingShapeSchema,
  width: z.number(),
  depth: z.number(),
  height: z.number(),
  color: z.string(),
});

const towerSchema = z.object({
  id: z.number(),
  type: towerTypeSchema,
  gridX: z.number(),
  gridZ: z.number(),
  x: z.number(),
  z: z.number(),
});

const enemyUpgradeIdSchema = z.enum([
  "armored",
  "swift",
  "slowImmune",
  "regenerating",
]);

const enemySchema: z.ZodType<Enemy> = z.object({
  id: z.number(),
  type: enemyTypeSchema,
  name: z.string(),
  health: z.number(),
  speed: z.number(),
  reward: z.number(),
  color: z.string(),
  size: z.number(),
  healthLoss: z.number(),
  maxHealth: z.number(),
  pathProgress: z.number(),
  pathIndex: z.number(),
  slowUntil: z.number(),
  slowMultiplier: z.number(),
  x: z.number(),
  z: z.number(),
  upgrades: z.array(enemyUpgradeIdSchema),
});

const projectileSchema: z.ZodType<Projectile> = z.object({
  id: z.number(),
  towerId: z.number(),
  towerType: towerTypeSchema,
  projectileType: projectileTypeSchema,
  startX: z.number(),
  startY: z.number(),
  startZ: z.number(),
  targetX: z.number(),
  targetY: z.number(),
  targetZ: z.number(),
  targetId: z.number(),
  damage: z.number(),
  speed: z.number(),
  range: z.number(),
  color: z.string(),
  slowAmount: z.number().optional(),
  slowDuration: z.number().optional(),
  aoeRadius: z.number().optional(),
  maxPierce: z.number().optional(),
  pierceEnemyIds: z.array(z.number()).optional(),
});

export type LevelConfigFiles = "level_main" | "level_1";

export const levelConfigSchema = z.object({
  name: z.string().min(1),
  startingMoney: z.number(),
  gridSize: z.number(),
  tileColor: z.string().optional(),
  groundColor: z.string().optional(),
  pathWaypoints: z.array(z.array(pathWaypointSchema)),
  waveConfigs: z.array(waveConfigSchema),
  buildings: z.array(buildingSchema),
  towers: z.array(towerSchema),
  enemies: z.array(enemySchema),
  projectiles: z.array(projectileSchema),
  enemyWeights: z.record(enemyTypeSchema, z.number()).nullable(),
});

export type LevelConfigData = z.infer<typeof levelConfigSchema>;

export const parseLevelConfigData = (data: unknown) => {
  return levelConfigSchema.safeParse(data);
};

export const loadLevelConfigFile = async (levelName: LevelConfigFiles) => {
  const data = await loadFile(`/configs/levels/${levelName}`);
  if (!data) {
    throw new Error(`Failed to load level configuration file: ${levelName}`);
  }

  const result = parseLevelConfigData(data);
  if (!result.success) {
    throw new Error(
      `Level configuration validation failed for ${levelName}: ${result.error.message}`
    );
  }

  return result.data;
};
