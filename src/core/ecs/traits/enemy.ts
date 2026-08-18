import { trait } from "koota";

import type {
  EnemyType,
  EnemyUpgradeId,
  HealPulseConfig,
} from "../../types/game";

export const IsEnemy = trait();

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
