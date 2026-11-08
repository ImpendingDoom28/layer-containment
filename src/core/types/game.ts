import { Seconds } from "./utils";

// Game status types
export type GameStatus =
  "menu" | "playing" | "paused" | "gameMenu" | "gameOver" | "won";

// Tower types
export type TowerType = "basic" | "slow" | "brl" | "laser" | "relay" | "chain";
export type TowerTargeting =
  | "nearest"
  | "furthest"
  | "lowest"
  | "highest"
  | "focused";

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
  | "reinforcements"
  | "missingOut";

export type EnemyUpgradeStackTier = 1 | 2 | 3;

/**
 * One upgrade the enemy carries, with how many times it was picked (1-3).
 * The pick count is the glyph count shown on the enemy (1 pick = 1 glyph,
 * 3 picks = 3 glyphs).
 */
export type EnemyUpgradeStack = {
  id: EnemyUpgradeId;
  tier: EnemyUpgradeStackTier;
};

/**
 * Absolute effect of one upgrade tier. Each tier fully describes its effect
 * (no cumulative stacking): picking a higher tier replaces the previous
 * tier's value, so balancing is a matter of editing the tier values in
 * `public/configs/game.json`. All fields are optional; an absent field means
 * the tier grants nothing of that kind. `rewardMultiplier` is the gold
 * multiplier applied on that pick (picks still stack multiplicatively).
 */
export type EnemyUpgradeTier = {
  rewardMultiplier?: number;
  healthMultiplier?: number;
  speedMultiplier?: number;
  /** Reinforcements: fraction of extra enemies per wave (e.g. 0.2 = +20%). */
  countGrowth?: number;
  /** Slow resistance for this tier (0-1; 1 = immune). */
  slowResistance?: number;
  /** Flat HP/sec regeneration for this tier. */
  regeneration?: number;
  /**
   * Missing out: chance (0-1) to dodge an incoming tower damage hit at this
   * tier. Each hit rolls independently.
   */
  dodgeChance?: number;
};

export type EnemyUpgradeConfig = {
  id: EnemyUpgradeId;
  name: string;
  description: string;
  displayRank: 1 | 2 | 3;
  /**
   * One absolute effect per tier (index 0 = tier I, index 2 = tier III).
   * Higher tiers replace — not add to — the previous tier's effect.
   */
  tiers: [EnemyUpgradeTier, EnemyUpgradeTier, EnemyUpgradeTier];
  indicatorColor: string;
};

export type ProjectileType = "aoe" | "single" | "beam" | "chain" | "rocket";

// Path waypoint
export type PathWaypoint = {
  x: number;
  y: number;
  z: number;
};

// The 3D model a tower type renders, referenced from the game config
// (`public/configs/game.json`).
export type TowerModelSpec = {
  /** Relative GLB URL, served from `public/` at the app root. */
  url: string;
  /** Name of the model root node inside the GLB. */
  node: string;
};

// The rotating part of a tower model and where its barrel tip sits at rest
// (the muzzle the shot, beam, and fire sound leave). `turretNode` is the node
// rotated toward the target at runtime; `muzzle` is the barrel tip in the
// turret node's local frame at rest, or `null` for a tower that never fires
// (the relay, whose "Azimuth003" is an empty pivot). `barrelNode` is the
// turret's barrel subtree (a node name relative to the turret node) that the
// firing feedback's recoil punch animates.
export type TowerMuzzleSpec = {
  turretNode?: string;
  barrelNode?: string;
  muzzle: { x: number; y: number; z: number } | null;
  /**
   * Multiple muzzle points in the turret node's local rest frame, cycled per
   * shot (the BRL fires from each of its launcher tubes in turn). When present
   * it takes precedence over the single `muzzle` point.
   */
  muzzleOffsets?: Array<{ x: number; y: number; z: number }>;
};

// Tower configuration
export type TowerConfig = {
  id: TowerType;
  name: string;
  cost: number;

  damage: number;
  range: number;
  /**
   * Minimum effective range (the artillery dead-zone): the tower refuses to
   * target enemies closer than this. Absent for towers that can engage at any
   * distance.
   */
  minRange?: number;
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

  /** The 3D model body this tower type renders. */
  model: TowerModelSpec;
  /** The rotating turret node and its rest muzzle (the shot origin). */
  muzzle: TowerMuzzleSpec;
  /**
   * The decorative top node the idle animation scans and bobs for a tower
   * without a firing turret (the relay's "Pulse_Array"). Towers with a
   * `muzzle.turretNode` animate that node instead.
   */
  idleNode?: string;

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
  upgradeStacks?: EnemyUpgradeStack[];
  regeneration?: number;
  slowResistance?: number;
  /** Missing-out: chance (0-1) to dodge an incoming tower damage hit. */
  dodgeChance?: number;
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
  /**
   * Portal (path index) the enemies of this group emerge from. When omitted,
   * the group's enemies are distributed evenly across all portals; when set,
   * every enemy of the group spawns only from that portal.
   */
  pathIndex?: number;
};

/**
 * Per-level boss definition (the level JSON's `boss`). Every `N`-th wave
 * (`everyNthWave`, default 4) spawns the boss alongside the regular wave.
 *
 * `baseStats` are the boss's stats at its first appearance: `health`,
 * `speed`, `size`, `healthLoss`, and `reward` (the base values the upgrade
 * stack then multiplies, exactly like a regular enemy of that wave).
 *
 * `hpGrowthPerAppearance` multiplies the boss's health on each later
 * appearance of the same wave (e.g. 1.5: wave 8's boss has 1.5× wave 4's
 * base HP, wave 12's has 2.25×), so the boss keeps scaling without a new
 * mechanic. Absent or 1 = no growth.
 *
 * `name` is the boss's display name (shown on the boss bar and in the
 * almanac); `model` is the GLB the boss body renders (absent = the tankee
 * model).
 */
export type BossConfig = {
  name: string;
  /** Every N-th wave spawns the boss (wave 4, 8, 12, ... for N = 4). */
  everyNthWave: number;
  baseStats: {
    health: number;
    speed: number;
    size: number;
    healthLoss: number;
    reward: number;
  };
  hpGrowthPerAppearance?: number;
  model?: {
    url: string;
    node: string;
  };
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
