import { z } from "zod";

import type {
  TowerConfig,
  EnemyConfig,
  EnemyUpgradeConfig,
} from "../types/game";
import { loadFile } from "../../utils/fileLoader";

const towerTargetingSchema = z.enum(["nearest", "furthest"]);
const projectileTypeSchema = z.enum(["aoe", "single", "beam", "chain"]);
const towerTypeSchema = z.enum([
  "basic",
  "slow",
  "aoe",
  "laser",
  "relay",
  "chain",
]);
const enemyTypeSchema = z.enum(["basic", "fast", "tank", "medic"]);

const healPulseConfigSchema = z.object({
  radius: z.number(),
  intervalSeconds: z.number(),
  healAmount: z.number(),
});
const enemyUpgradeIdSchema = z.enum([
  "armored",
  "swift",
  "slowImmune",
  "regenerating",
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
});

const enemyUpgradeConfigSchema: z.ZodType<EnemyUpgradeConfig> = z.object({
  id: enemyUpgradeIdSchema,
  name: z.string(),
  description: z.string(),
  displayRank: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  rewardMultiplier: z.number(),
  healthMultiplier: z.number().optional(),
  speedMultiplier: z.number().optional(),
  resistances: z
    .object({
      slow: z.number().optional(),
    })
    .optional(),
  abilities: z
    .object({
      regeneration: z.number().optional(),
    })
    .optional(),
  indicatorColor: z.string(),
});

export const gameConfigSchema = z.object({
  tileSize: z.number(),
  startingHealth: z.number(),
  towerSellPriceMultiplier: z.number(),
  enemyHealthLoss: z.number(),
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

/**
 * Loads game configuration from JSON file and initializes exports
 * Call this before starting the game to ensure config is loaded
 */
export async function loadGameConfig() {
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
}
