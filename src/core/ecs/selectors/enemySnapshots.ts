import type { World } from "koota";

import type { Enemy } from "../../types/game";
import {
  EnemyMotion,
  EnemyState,
  IsEnemy,
  type EnemyStateData,
  type EnemyMotionData,
  toEnemySnapshot,
} from "../traits/enemy";
import { Position, type PositionData } from "../traits/position";
import { createWorldRegistry } from "../../../utils/worldRegistry";

type EnemyRow = [EnemyStateData, EnemyMotionData, PositionData];

const copyEnemyFromRow = (
  enemy: Enemy,
  [state, motion, position]: EnemyRow
): void => {
  // Re-copy every field in place (mirrors toEnemySnapshot): static fields are
  // re-copied too, so a restart that reuses an enemy id (the id counter
  // resets to 1) never serves a stale type/name/color/size/upgrades/healthLoss
  // from the previous run. Array fields are re-pointed at the live trait
  // references (read-only downstream).
  enemy.name = state.name;
  enemy.type = state.type;
  enemy.health = state.health;
  enemy.maxHealth = state.maxHealth;
  enemy.speed = state.speed;
  enemy.reward = state.reward;
  enemy.color = state.color;
  enemy.size = state.size;
  enemy.healthLoss = state.healthLoss;
  enemy.description = state.description;
  enemy.pathProgress = motion.pathProgress;
  enemy.pathIndex = state.pathIndex;
  enemy.x = position.x;
  enemy.z = position.z;
  enemy.upgrades = state.upgrades;
  enemy.upgradeStacks = state.upgradeStacks;
  enemy.regeneration = state.regeneration;
  enemy.slowResistance = state.slowResistance;
  enemy.nextHealPulseAt = state.nextHealPulseAt;
  enemy.healPulse = state.healPulse;
  enemy.split = state.split;
};

const enemyRegistry = createWorldRegistry<number, Enemy, EnemyRow>({
  query: (world) => world.query(IsEnemy, EnemyState, EnemyMotion, Position),
  key: ([state]) => state.id,
  create: ([state, motion, position]) =>
    toEnemySnapshot(state, motion, position),
  update: copyEnemyFromRow,
});

export const getEnemySnapshots = (world: World): Enemy[] => {
  const enemies: Enemy[] = [];
  world
    .query(IsEnemy, EnemyState, EnemyMotion, Position)
    .readEach(([state, motion, position]) => {
      enemies.push(toEnemySnapshot(state, motion, position));
    });
  return enemies;
};

export const getEnemiesById = (world: World): Map<number, Enemy> => {
  const byId = new Map<number, Enemy>();
  world
    .query(IsEnemy, EnemyState, EnemyMotion, Position)
    .readEach(([state, motion, position]) => {
      const enemy = toEnemySnapshot(state, motion, position);
      byId.set(enemy.id, enemy);
    });
  return byId;
};

export const getLivingEnemySnapshots = (world: World): Enemy[] =>
  getEnemySnapshots(world).filter((enemy) => enemy.health > 0);

/**
 * Pooled enemy registry (object pooling): one `Enemy` object per live entity
 * is created on spawn and then all its fields are re-copied in place each
 * frame, so the hot per-frame consumers (tower targeting, projectile homing)
 * allocate nothing in steady state instead of one object per entity per frame.
 *
 * The registry is refreshed per call by re-reading the hot traits; consumers
 * must use it within a single system pass (the values are live references,
 * not frozen snapshots).
 *
 * One registry per `World` (see `createWorldRegistry`): refreshing a world
 * only mutates that world's registry, so two worlds sharing enemy ids cannot
 * clobber each other.
 */
export const refreshEnemyRegistry = (world: World): Map<number, Enemy> =>
  enemyRegistry.refresh(world);

// Reused across frames so targeting/homing reads allocate no list in steady
// state. Callers must consume the list within their own system pass.
export const getLivingEnemyList = (world: World): Enemy[] =>
  enemyRegistry.collect(world, (enemy) => enemy.health > 0);
