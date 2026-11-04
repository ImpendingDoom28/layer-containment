import { z } from "zod";

import type {
  TowerConfig,
  EnemyConfig,
  EnemyUpgradeConfig,
  SplitConfig,
} from "../types/game";
import { loadFile } from "../../utils/fileLoader";

const towerTargetingSchema = z.enum([
  "nearest",
  "furthest",
  "lowest",
  "highest",
  "focused",
]);
const projectileTypeSchema = z.enum(["aoe", "single", "beam", "chain"]);
const towerTypeSchema = z.enum([
  "basic",
  "slow",
  "aoe",
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
const splitConfigSchema: z.ZodType<SplitConfig> = z.object({
  minChildren: z.number().int().min(1),
  maxChildren: z.number().int().min(1),
});
const enemyUpgradeIdSchema = z.enum([
  "armored",
  "swift",
  "slowResistance",
  "regenerating",
  "reinforcements",
  "missingOut",
]);

const towerConfigSchema: z.ZodType<TowerConfig> = z.object({
  id: towerTypeSchema,
  name: z.string(),
  cost: z.number(),
  damage: z.number(),
  range: z.number(),
  fireRate: z.number(),
  targeting: towerTargetingSchema,
  slowAmount: z.number().optional(),
  slowDuration: z.number().optional(),
  aoeRadius: z.number().optional(),
  maxPierce: z.number().optional(),
  projectileType: projectileTypeSchema,
  projectileSpeed: z.number(),
  color: z.string(),
  description: z.string(),
  topShape: z.enum(["cone", "sphere", "cylinder", "flat", "coil"]).optional(),
  bodyWidthScale: z.number().optional(),
  topScale: z.number().optional(),
  relayNeighborDamageBonusFraction: z.number().optional(),
  relayNeighborRangeBonusFraction: z.number().optional(),
  relayDiminishingFactor: z.number().optional(),
  maxChainHops: z.number().optional(),
  chainDamageMultiplierPerHop: z.number().optional(),
});

const enemyConfigSchema: z.ZodType<EnemyConfig> = z.object({
  id: enemyTypeSchema,
  name: z.string(),
  health: z.number(),
  speed: z.number(),
  reward: z.number(),
  color: z.string(),
  size: z.number(),
  healthLoss: z.number(),
  description: z.string().optional(),
  healPulse: healPulseConfigSchema.optional(),
  split: splitConfigSchema.optional(),
});

const enemyUpgradeTierSchema = z.object({
  rewardMultiplier: z.number().optional(),
  healthMultiplier: z.number().optional(),
  speedMultiplier: z.number().optional(),
  countGrowth: z.number().optional(),
  slowResistance: z.number().optional(),
  regeneration: z.number().optional(),
  dodgeChance: z.number().optional(),
});

const enemyUpgradeConfigSchema: z.ZodType<EnemyUpgradeConfig> = z.object({
  id: enemyUpgradeIdSchema,
  name: z.string(),
  description: z.string(),
  displayRank: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  tiers: z.tuple([
    enemyUpgradeTierSchema,
    enemyUpgradeTierSchema,
    enemyUpgradeTierSchema,
  ]),
  indicatorColor: z.string(),
});

export const gameConfigSchema = z.object({
  tileSize: z.number(),
  towerSellPriceMultiplier: z.number(),
  towerTypes: z.record(towerTypeSchema, towerConfigSchema),
  enemyTypes: z.record(enemyTypeSchema, enemyConfigSchema),
  enemyUpgrades: z.record(enemyUpgradeIdSchema, enemyUpgradeConfigSchema),
  pathWidth: z.number(),
  pathYOffset: z.number(),
  towerHeight: z.number(),
  towerBaseRadius: z.number(),
  projectileSize: z.number(),
});

export type GameConfigData = z.infer<typeof gameConfigSchema>;

// Several components mount `useGameSystem` on the same first frame (the page
// and the main-menu scene), and the `isGameConfigLoaded` flag only flips once
// the fetch settles — so without this each mount races the same
// /configs/game.json fetch. A shared in-flight promise makes concurrent calls
// share one fetch; it is kept after success so later callers get the cached
// config instead of re-fetching, and cleared on failure so a transient error
// can be retried.
let pendingConfig: Promise<GameConfigData> | null = null;

const fetchGameConfig = async (): Promise<GameConfigData> => {
  const data = await loadFile(`/configs/game`);
  if (!data) {
    throw new Error("Failed to load game configuration file");
  }

  const result = gameConfigSchema.safeParse(data);
  if (!result.success) {
    throw new Error(
      `Game configuration validation failed: ${result.error.message}`
    );
  }

  return result.data;
};

/**
 * Loads game configuration from JSON file and initializes exports
 * Call this before starting the game to ensure config is loaded
 */
export function loadGameConfig() {
  if (pendingConfig === null) {
    pendingConfig = fetchGameConfig().catch((error) => {
      pendingConfig = null;
      throw error;
    });
  }

  return pendingConfig;
}
