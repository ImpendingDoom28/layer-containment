import type { World } from "koota";

import type { Enemy } from "../../types/game";
import {
  EnemyMotion,
  EnemyState,
  IsEnemy,
  toEnemySnapshot,
} from "../traits/enemy";
import { Position } from "../traits/position";

export const getEnemySnapshots = (world: World): Enemy[] => {
  const enemies: Enemy[] = [];
  world.query(IsEnemy, EnemyState, EnemyMotion, Position).readEach(
    ([state, motion, position]) => {
      enemies.push(toEnemySnapshot(state, motion, position));
    }
  );
  return enemies;
};

export const getEnemiesById = (world: World): Map<number, Enemy> => {
  const byId = new Map<number, Enemy>();
  world.query(IsEnemy, EnemyState, EnemyMotion, Position).readEach(
    ([state, motion, position]) => {
      const enemy = toEnemySnapshot(state, motion, position);
      byId.set(enemy.id, enemy);
    }
  );
  return byId;
};

export const getLivingEnemySnapshots = (world: World): Enemy[] =>
  getEnemySnapshots(world).filter((enemy) => enemy.health > 0);

/**
 * Pooled enemy registry (object pooling): one `Enemy` object per live entity
 * is created on spawn and then only its dynamic fields (health, position,
 * path progress) are refreshed in place each frame, so the hot per-frame
 * consumers (tower targeting, projectile homing) allocate nothing in steady
 * state instead of one object per entity per frame.
 *
 * The registry is refreshed per call by re-reading the hot traits; consumers
 * must use it within a single system pass (the values are live references,
 * not frozen snapshots).
 */
const enemyRegistry = new Map<number, Enemy>();

export const refreshEnemyRegistry = (world: World): Map<number, Enemy> => {
  const seenIds = new Set<number>();
  world
    .query(IsEnemy, EnemyState, EnemyMotion, Position)
    .readEach(([state, motion, position]) => {
      seenIds.add(state.id);
      let enemy = enemyRegistry.get(state.id);
      if (!enemy) {
        enemy = toEnemySnapshot(state, motion, position);
        enemyRegistry.set(state.id, enemy);
      } else {
        // Refresh every field in place: static fields are re-copied so a
        // restart that reuses an enemy id (id counter resets to 1) never
        // serves a stale color/size/maxHealth from the previous run.
        enemy.health = state.health;
        enemy.maxHealth = state.maxHealth;
        enemy.speed = state.speed;
        enemy.pathProgress = motion.pathProgress;
        enemy.pathIndex = state.pathIndex;
        enemy.x = position.x;
        enemy.z = position.z;
        enemy.nextHealPulseAt = state.nextHealPulseAt;
        enemy.color = state.color;
        enemy.size = state.size;
        enemy.reward = state.reward;
      }
    });
  for (const id of enemyRegistry.keys()) {
    if (!seenIds.has(id)) enemyRegistry.delete(id);
  }
  return enemyRegistry;
};

// Reused across frames so targeting/homing reads allocate no list in steady
// state. Callers must consume the list within their own system pass.
const livingList: Enemy[] = [];

export const collectLivingEnemies = (
  registry: Map<number, Enemy>
): Enemy[] => {
  livingList.length = 0;
  for (const enemy of registry.values()) {
    if (enemy.health > 0) livingList.push(enemy);
  }
  return livingList;
};

export const getLivingEnemyList = (
  world: World
): Enemy[] =>
  collectLivingEnemies(refreshEnemyRegistry(world));

/**
 * Alive-enemy count without building snapshot objects. The wave system checks
 * "is the field clear" up to three times per frame; counting the hot trait
 * fields directly is far cheaper than allocating one `Enemy` per entity.
 */
export const getLivingEnemyCount = (world: World): number => {
  let count = 0;
  world
    .query(IsEnemy, EnemyState, EnemyMotion, Position)
    .readEach(([state]) => {
      if (state.health > 0) count += 1;
    });
  return count;
};
