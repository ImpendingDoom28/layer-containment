import { z } from "zod";

import { loadFile } from "../../utils/fileLoader";
import { MAX_GRID_SIZE, MIN_GRID_SIZE } from "../../utils/gridSizeLimits";
import type {
  BossConfig,
  Building,
  CanyonConfig,
  Enemy,
  EnemyUpgradeStack,
  PathWaypoint,
  Projectile,
  WaterBody,
  WaterBodyConfig,
  WaveConfig,
} from "../types/game";
import type { QuestConfig } from "../types/quests";

const towerTypeSchema = z.enum([
  "basic",
  "slow",
  "brl",
  "laser",
  "relay",
  "chain",
]);
const enemyTypeSchema = z.enum(["basic", "fast", "tank", "medic", "splitter"]);

const healPulseConfigSchema = z.object({
  radius: z.number(),
  intervalSeconds: z.number(),
  healAmount: z.number(),
});
const splitConfigSchema = z.object({
  minChildren: z.number().int().min(1),
  maxChildren: z.number().int().min(1),
});
const projectileTypeSchema = z.enum([
  "aoe",
  "single",
  "beam",
  "chain",
  "rocket",
]);
const buildingShapeSchema = z.enum(["box", "cylinder"]);

const pathWaypointSchema: z.ZodType<PathWaypoint> = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

/** Footprint of a water pool within its tile (see `WaterVariant`). */
export const waterVariantSchema = z.enum([
  "full",
  "half-n",
  "half-e",
  "half-s",
  "half-w",
  "corner-nw",
  "corner-ne",
  "corner-se",
  "corner-sw",
]);

const waterBodyConfigFields = z.object({
  id: z.number(),
  gridX: z.number(),
  gridZ: z.number(),
  shape: buildingShapeSchema,
  color: z.string(),
  variant: waterVariantSchema.default("full"),
  width: z.number().optional(),
  depth: z.number().optional(),
});

export const waterBodyConfigSchema: z.ZodType<WaterBodyConfig> =
  waterBodyConfigFields;

/**
 * A canyon tile: a non-buildable rocky basin. Rendering (the basin, its
 * walls, and the bridge that spans it) is derived from the tile set, so the
 * JSON only needs the grid cells. Coordinates are integer grid indices — a
 * fractional one would silently skip the mask cell while still shaping the
 * basin bbox — so the schema rejects them at load.
 */
export const canyonConfigSchema: z.ZodType<CanyonConfig> = z.object({
  id: z.number(),
  gridX: z.number().int(),
  gridZ: z.number().int(),
});

/** Resolved water instance (e.g. after {@link withRecalculatedWaterCoordinates}). */
export const waterBodySchema: z.ZodType<WaterBody> = z.object({
  id: z.number(),
  gridX: z.number(),
  gridZ: z.number(),
  shape: buildingShapeSchema,
  color: z.string(),
  variant: waterVariantSchema,
  width: z.number(),
  depth: z.number(),
  height: z.number(),
  x: z.number(),
  z: z.number(),
});

const waveEnemyGroupSchema = z.object({
  type: enemyTypeSchema,
  count: z.number(),
  spawnInterval: z.number(),
  /** Portal (path index) the group emerges from; omitted = distributed evenly. */
  pathIndex: z.number().int().min(0).optional(),
});

const bossModelSchema = z.object({
  url: z.string(),
  node: z.string(),
});

// `everyNthWave` has `.default(4)`, so it is optional on the schema's input
// side but required on its output side — the input type must reflect that,
// otherwise the `z.ZodType<BossConfig>` annotation (Input = BossConfig,
// required) rejects the defaulted field.
const bossConfigSchema: z.ZodType<
  BossConfig,
  z.ZodTypeDef,
  Omit<BossConfig, "everyNthWave"> & { everyNthWave?: number }
> = z.object({
  name: z.string().min(1),
  everyNthWave: z.number().int().min(2).default(4),
  baseStats: z.object({
    health: z.number().positive(),
    speed: z.number().positive(),
    size: z.number().positive(),
    healthLoss: z.number().int().min(1),
    reward: z.number().positive(),
  }),
  hpGrowthPerAppearance: z.number().positive().optional(),
  model: bossModelSchema.optional(),
  pathSwap: z
    .array(
      z.object({
        // Strictly below the movement system's path-end threshold (0.99):
        // at/above it the enemy is removed at the path end before the swap
        // can ever observe the threshold, so the rule could never fire.
        atProgress: z.number().min(0).lt(0.99),
        targetPathIndex: z.number().int().min(0),
        minAppearance: z.number().int().min(1).optional(),
      })
    )
    .optional(),
});

const waveConfigSchema: z.ZodType<WaveConfig> = z.object({
  totalEnemies: z.number(),
  enemies: z.array(waveEnemyGroupSchema),
});

// A quest is built from exactly one live counter (the evaluator reads the
// first one it finds), so the schema rejects a spec with zero or several
// counters rather than silently ignoring the extras. `killsByType` counts as
// a single counter but must itself name exactly one enemy type.
const questCountersSchema = z
  .object({
    /** Cap on enemies allowed to reach the base (a quest on a *cap* counter). */
    leaks: z.number().int().min(0).optional(),
    /** Completes when the run is won. */
    victory: z.literal(true).optional(),
    wavesStarted: z.number().int().min(1).optional(),
    towersPlaced: z.number().int().min(1).optional(),
    towersSold: z.number().int().min(1).optional(),
    kills: z.number().int().min(1).optional(),
    killsByType: z
      .record(enemyTypeSchema, z.number().int().min(1))
      .refine((types) => Object.keys(types).length === 1, {
        message: "killsByType must target exactly one enemy type",
      })
      .optional(),
    totalGoldEarned: z.number().int().min(1).optional(),
  })
  .refine(
    (counters) =>
      [
        counters.leaks,
        counters.victory,
        counters.wavesStarted,
        counters.towersPlaced,
        counters.towersSold,
        counters.kills,
        counters.killsByType,
        counters.totalGoldEarned,
      ].filter((value) => value !== undefined).length === 1,
    { message: "a quest must define exactly one counter" }
  );

export const questConfigSchema: z.ZodType<QuestConfig> = z.object({
  id: z.string().min(1),
  additional: z.boolean().optional(),
  labelKey: z.string().min(1),
  labelParams: z.record(z.union([z.string(), z.number()])).optional(),
  counters: questCountersSchema,
  /**
   * Settled only at the end of the run (e.g. a leak cap): the quest stays
   * open while the run goes on and completes only on a win with the
   * condition holding.
   */
  deferred: z.boolean().optional(),
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
  "slowResistance",
  "regenerating",
  "reinforcements",
  "missingOut",
]);

const enemyUpgradeStackSchema: z.ZodType<EnemyUpgradeStack> = z.object({
  id: enemyUpgradeIdSchema,
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

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
  x: z.number(),
  z: z.number(),
  upgrades: z.array(enemyUpgradeIdSchema),
  upgradeStacks: z.array(enemyUpgradeStackSchema).optional(),
  regeneration: z.number().optional(),
  slowResistance: z.number().optional(),
  dodgeChance: z.number().optional(),
  healPulse: healPulseConfigSchema.optional(),
  nextHealPulseAt: z.number().optional(),
  split: splitConfigSchema.optional(),
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

export type LevelConfigFiles =
  | "level_main"
  | "level_1"
  | "level_2"
  | "level_3"
  | "level_4"
  | "level_5"
  | "level_testing"
  | "stress";

export const DEFAULT_STARTING_HEALTH = 20;

export const levelConfigSchema = z.object({
  name: z.string().min(1),
  /** Human-facing name shown in the level picker (falls back to `name`, then the id). */
  label: z.string().default(""),
  /** One-line blurb shown under the label in the level picker. */
  description: z.string().default(""),
  startingMoney: z.number(),
  /** Base (player HQ) max health for this level; each level can set its own. */
  startingHealth: z.number().finite().min(1).default(DEFAULT_STARTING_HEALTH),
  gridSize: z.number().finite().int().min(MIN_GRID_SIZE).max(MAX_GRID_SIZE),
  tileColor: z.string().optional(),
  groundColor: z.string().optional(),
  waters: z.array(waterBodyConfigSchema).default([]),
  /** Non-buildable canyon tiles (rocky basins); a path crossing them is bridged. */
  canyons: z.array(canyonConfigSchema).default([]),
  pathWaypoints: z.array(z.array(pathWaypointSchema)),
  waveConfigs: z.array(waveConfigSchema),
  /**
   * Declarative quest definitions (main objectives + side quests). Absent =
   * a level with no quest card. The quest system resolves the counters from
   * live gameplay events, so levels stay pure data.
   */
  quests: z
    .array(questConfigSchema)
    .default([])
    .refine(
      (quests) =>
        new Set(quests.map((quest) => quest.id)).size === quests.length,
      { message: "quest ids must be unique within a level" }
    ),
  /** Per-level boss definition; absent = no boss waves for this level. */
  boss: bossConfigSchema.optional(),
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
