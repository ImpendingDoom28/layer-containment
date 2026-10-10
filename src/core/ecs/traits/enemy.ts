import { trait } from "koota";

import type {
  Enemy,
  EnemyType,
  EnemyUpgradeId,
  HealPulseConfig,
} from "../../types/game";

export const IsEnemy = trait();

export const requestEnemyDeath = trait();

export type EnemyStateData = {
  id: number;
  type: EnemyType;
  name: string;
  health: number;
  maxHealth: number;
  speed: number;
  reward: number;
  color: string;
  size: number;
  healthLoss: number;
  description?: string;
  pathProgress: number;
  pathIndex: number;
  /** Expiry timestamp in pause-adjusted simulation time. */
  slowUntil: number;
  slowMultiplier: number;
  x: number;
  z: number;
  upgrades: EnemyUpgradeId[];
  upgradeIndicatorColors?: string[];
  regeneration?: number;
  slowResistance?: number;
  nextHealPulseAt?: number;
  healPulse?: HealPulseConfig;
};

export const createDefaultEnemyState = (): EnemyStateData => ({
  id: 0,
  type: "basic",
  name: "",
  health: 0,
  maxHealth: 0,
  speed: 0,
  reward: 0,
  color: "",
  size: 0,
  healthLoss: 0,
  pathProgress: 0,
  pathIndex: 0,
  slowUntil: 0,
  slowMultiplier: 1,
  x: 0,
  z: 0,
  upgrades: [],
});

export const EnemyState = trait(createDefaultEnemyState);

/** Pure mapping from the ECS state to the domain snapshot. */
export const toEnemySnapshot = (state: EnemyStateData): Enemy => ({
  id: state.id,
  type: state.type,
  name: state.name,
  health: state.health,
  maxHealth: state.maxHealth,
  speed: state.speed,
  reward: state.reward,
  color: state.color,
  size: state.size,
  healthLoss: state.healthLoss,
  description: state.description,
  pathProgress: state.pathProgress,
  pathIndex: state.pathIndex,
  slowUntil: state.slowUntil,
  slowMultiplier: state.slowMultiplier,
  x: state.x,
  z: state.z,
  upgrades: state.upgrades,
  upgradeIndicatorColors: state.upgradeIndicatorColors,
  regeneration: state.regeneration,
  slowResistance: state.slowResistance,
  nextHealPulseAt: state.nextHealPulseAt,
  healPulse: state.healPulse,
});
