import { Seconds } from "./utils";

// Game status types
export type GameStatus =
  "menu" | "playing" | "paused" | "gameMenu" | "gameOver" | "won";

// Tower types
export type TowerType = "basic" | "slow" | "aoe" | "laser" | "relay" | "chain";
export type TowerTargeting = "nearest" | "furthest";

/**
 * Payload of the `UI_ACTION_DENIED` event. `elementId` names the HUD element
 * (its `data-hud-animation-id` attribute) that should play the denial shake;
 * omitted when the denied action has no targetable element.
 */
export type UiActionDeniedData = {
  reason: "insufficient_funds" | "blocked_tile";
  towerType: TowerType;
  elementId?: string;
};

// Enemy types
export type EnemyType = "basic" | "fast" | "tank" | "medic" | "splitter";

export type HealPulseConfig = {
  radius: number;
  intervalSeconds: number;
  healAmount: number;
};

/**
 * Splitter death behavior: on death the enemy spawns a random number of
 * weaker children (between `minChildren` and `maxChildren` inclusive) with
 * zero gold reward.
 */
export type SplitConfig = {
  minChildren: number;
  maxChildren: number;
};

// Enemy upgrade types
export type EnemyUpgradeId =
  | "armored"
  | "swift"
  | "slowResistance"
  | "regenerating"
  | "reinforcements";

export type EnemyUpgradeStackTier = 1 | 2 | 3;

export type EnemyUpgradeConfig = {
  id: EnemyUpgradeId;
  name: string;
  description: string;
  displayRank: 1 | 2 | 3;
  rewardMultiplier: number;
  healthMultiplier?: number;
  speedMultiplier?: number;
  /** Reinforcements: base fraction of extra enemies per wave (e.g. 0.2 = +20%). */
  countGrowth?: number;
  resistances?: {
    slow?: number;
  };
  abilities?: {
    regeneration?: number;
  };
  indicatorColor: string;
};

export type ProjectileType = "aoe" | "single" | "beam" | "chain";

// Path waypoint
export type PathWaypoint = {
  x: number;
  y: number;
  z: number;
};

// Tower configuration
export type TowerConfig = {
  id: TowerType;
  name: string;
  cost: number;

  damage: number;
  range: number;
  fireRate: number;
  targeting: TowerTargeting;
  slowAmount?: number;
  slowDuration?: number;
  aoeRadius?: number;
  maxPierce?: number;

  projectileType: ProjectileType;
  projectileSpeed: number;

  color: string;
  description: string;
  topShape?: "cone" | "sphere" | "cylinder" | "flat" | "coil";
  bodyWidthScale?: number;
  topScale?: number;

  /** Relay: fraction added to neighbor damage per source before diminishing (e.g. 0.15 = +15% first relay). */
  relayNeighborDamageBonusFraction?: number;
  /** Relay: fraction added to neighbor range per source before diminishing. */
  relayNeighborRangeBonusFraction?: number;
  /** Relay: multiplier for each additional adjacent relay (default 0.5). */
  relayDiminishingFactor?: number;

  /** Chain: max hops after first hit (default 3). */
  maxChainHops?: number;
  /** Chain: damage multiplier per hop after first hit (default 0.85). */
  chainDamageMultiplierPerHop?: number;
};

// Tower instance
export type Tower = Omit<TowerConfig, "id"> & {
  id: number;
  type: TowerType;
  lastFireTime: number;
  gridX: number;
  gridZ: number;
  x: number;
  z: number;
};

// Enemy configuration
export type EnemyConfig = {
  id: EnemyType;
  name: string;
  health: number;
  speed: number;
  reward: number;
  color: string;
  size: number;
  healthLoss: number;
  description?: string;
  healPulse?: HealPulseConfig;
  /** Present on the Splitter: on death, spawns 2-4 weaker zero-reward children. */
  split?: SplitConfig;
};

// Enemy instance
export type Enemy = Omit<EnemyConfig, "id"> & {
  id: number;
  type: EnemyType;
  maxHealth: number;
  pathProgress: number;
  pathIndex: number;
  x: number;
  z: number;
  upgrades: EnemyUpgradeId[];
  upgradeIndicatorColors?: string[];
  regeneration?: number;
  slowResistance?: number;
  nextHealPulseAt?: number;
};

// Projectile instance
export type Projectile = {
  id: number;
  towerId: number;
  towerType: TowerType;
  projectileType: ProjectileType;
  startX: number;
  startY: number;
  startZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  targetId: number;
  damage: number;
  speed: number;
  range: number;
  color: string;
  slowAmount?: number;
  slowDuration?: number;
  aoeRadius?: number;
  maxPierce?: number;
  pierceEnemyIds?: number[];
  /** Chain lightning: ordered extra hops; each hop applies when the bolt reaches that enemy. */
  chainAdditionalHits?: Array<{ enemyId: number; damage: number }>;
};

// Wave enemy group
export type WaveEnemyGroup = {
  type: EnemyType;
  count: number;
  spawnInterval: Seconds;
};

// Wave configuration
export type WaveConfig = {
  totalEnemies: number;
  enemies: WaveEnemyGroup[];
};

export type Building = {
  id: number;
  gridX: number;
  gridZ: number;
  x: number;
  z: number;
  shape: "box" | "cylinder";
  width: number;
  depth: number;
  height: number;
  color: string;
};

export const DEFAULT_WATER_BODY_WIDTH = 1;
export const DEFAULT_WATER_BODY_DEPTH = 1;
export const DEFAULT_WATER_BODY_HEIGHT = 0.03;

/** Water pool in level JSON (grid layout; optional footprint — defaults applied in-game). */
export type WaterBodyConfig = {
  id: number;
  gridX: number;
  gridZ: number;
  shape: "box" | "cylinder";
  color: string;
  width?: number;
  depth?: number;
};

/** Runtime water with resolved footprint, height, and world-space center. */
export type WaterBody = {
  id: number;
  gridX: number;
  gridZ: number;
  shape: "box" | "cylinder";
  color: string;
  width: number;
  depth: number;
  height: number;
  x: number;
  z: number;
};
