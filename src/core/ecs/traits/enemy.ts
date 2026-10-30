import { trait, type TraitRecord } from "koota";

import type {
  Enemy,
  EnemyType,
  EnemyUpgradeId,
  EnemyUpgradeStack,
  HealPulseConfig,
  SplitConfig,
} from "../../types/game";
import type { PositionData } from "./position";

export const IsEnemy = trait();

export const requestEnemyDeath = trait();

/**
 * Cold enemy data: changes only on discrete events (damage, slow, heal,
 * upgrades, spawn). `useTrait` subscriptions are safe on this trait.
 *
 * High-frequency motion fields (pathProgress, x, z) live in `EnemyMotion`
 * so per-frame writes do not trigger React re-renders.
 */
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
  pathIndex: number;
  upgrades: EnemyUpgradeId[];
  upgradeStacks?: EnemyUpgradeStack[];
  regeneration?: number;
  slowResistance?: number;
  nextHealPulseAt?: number;
  healPulse?: HealPulseConfig;
  /** Present on the Splitter: death spawns 2-4 weaker zero-reward children. */
  split?: SplitConfig;
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
  pathIndex: 0,
  upgrades: [],
});

export const EnemyState = trait(createDefaultEnemyState);

/**
 * Hot per-frame enemy motion, written by the EnemyMovementSystem and read
 * by the Enemy render component and the snapshot selectors.
 *
 * SoA (schema) so the movement system can mutate it in place without
 * allocating objects per enemy per frame. No React hook subscribes to this
 * trait, so its per-frame change events cost nothing in the view layer.
 *
 * The world position lives in the generic `Position` trait (see
 * traits/position.ts), which is also written per frame.
 */
export const EnemyMotion = trait({
  pathProgress: 0,
  /**
   * Unit direction (2D, x/z) the enemy currently faces — i.e. the direction
   * along its path. Set once at spawn (the first segment's direction) and
   * refreshed by the movement system as the enemy turns corners, so every
   * enemy — whatever its type — always spawns and walks facing the path.
   * The `Enemy` render component orients the mesh from it.
   */
  facingX: 1,
  facingZ: 0,
  /**
   * Simulation timestamp of the last regeneration tick. `-1` means "no
   * baseline yet": the first movement pass sets it to the current
   * simulation time without healing (a `0` baseline would credit a
   * mid-game spawn with healing for all time before it spawned).
   */
  lastRegenTick: -1,
  /** Guards the reach-end effect/callback against re-firing each frame. */
  hasReachedEnd: false,
});

export type EnemyMotionData = TraitRecord<typeof EnemyMotion>;

export const createDefaultEnemyMotion = (): EnemyMotionData => ({
  pathProgress: 0,
  facingX: 1,
  facingZ: 0,
  lastRegenTick: -1,
  hasReachedEnd: false,
});

/** Pure mapping from the ECS state to the domain snapshot. */
export const toEnemySnapshot = (
  state: EnemyStateData,
  motion: EnemyMotionData,
  position: PositionData
): Enemy => ({
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
  pathProgress: motion.pathProgress,
  pathIndex: state.pathIndex,
  x: position.x,
  z: position.z,
  upgrades: state.upgrades,
  upgradeStacks: state.upgradeStacks,
  regeneration: state.regeneration,
  slowResistance: state.slowResistance,
  nextHealPulseAt: state.nextHealPulseAt,
  healPulse: state.healPulse,
  split: state.split,
});
