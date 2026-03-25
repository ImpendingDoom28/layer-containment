import { Seconds } from "./utils";

// Game status types
export type GameStatus =
  | "menu"
  | "playing"
  | "paused"
  | "gameMenu"
  | "gameOver"
  | "won";

// Tower types
export type TowerType = "basic" | "slow" | "aoe" | "laser";
export type TowerTargeting = "nearest" | "furthest";

// Enemy types
export type EnemyType = "basic" | "fast" | "tank" | "medic";

export type HealPulseConfig = {
  radius: number;
  intervalSeconds: number;
  healAmount: number;
};

// Enemy upgrade types
export type EnemyUpgradeId = "armored" | "swift" | "slowImmune" | "regenerating";

export type EnemyUpgradeConfig = {
  id: EnemyUpgradeId;
  name: string;
  description: string;
  tier: 1 | 2 | 3;
  rewardMultiplier: number;
  healthMultiplier?: number;
  speedMultiplier?: number;
  resistances?: {
    slow?: number;
  };
  abilities?: {
    regeneration?: number;
  };
  indicatorColor: string;
};

export type ProjectileType = "aoe" | "single" | "beam";

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
};

// Enemy instance
export type Enemy = Omit<EnemyConfig, "id"> & {
  id: number;
  type: EnemyType;
  maxHealth: number;
  pathProgress: number;
  pathIndex: number;
  slowUntil: number;
  slowMultiplier: number;
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

export type ActiveEffect = {
  id: number;
  position: [number, number, number];
  color: string;
  type: "spawn" | "end";
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
