import type { World } from "koota";

import { enemyActions } from "../actions/enemyActions";
import { splitRequest, type SplitRequestData } from "../traits/split";
import { useGameStore } from "../../stores/useGameStore";
import type { Enemy } from "../../types/game";

/** Children keep the parent's speed but are visibly weaker: less HP, smaller. */
const CHILD_HEALTH_FRACTION = 0.3;
const CHILD_SIZE_FRACTION = 0.6;
const CHILD_HEALTH_LOSS = 1;

/**
 * Each child is nudged a little along the path (random, bounded) so the
 * shrapnel scatter instead of stacking at the death point: a single AOE shot
 * can't take the whole cluster, and the burst reads as a spread, not a clump.
 * Measured in normalized path progress (the movement system derives position
 * from it every frame, so the scatter persists; a one-shot x/z offset would
 * snap back to the parent's death location).
 */
const CHILD_PATH_JITTER = 0.06;

/**
 * isAtPathEnd treats progress >= 0.99 as having reached the path end. A child
 * jittered to 1 would take the reach-end branch on its first movement pass and
 * damage the base, so children are kept a little short of the exit.
 */
const CHILD_PATH_END_CLAMP = 0.98;

const clampChildProgress = (value: number) =>
  Math.min(CHILD_PATH_END_CLAMP, Math.max(0, value));

/**
 * Spawn one death-child of the parent. The child is a weaker, zero-reward
 * version of the parent and carries no `split` config, so it can never split
 * again (bounds the swarm to one generation).
 */
const buildSplitChild = (
  id: number,
  request: SplitRequestData
): Enemy => {
  const config = useGameStore.getState().enemyTypes?.[request.type];
  const name = config?.name ?? request.type;

  const health = Math.max(1, Math.round(request.health * CHILD_HEALTH_FRACTION));
  const size = request.size * CHILD_SIZE_FRACTION;
  const pathProgress = clampChildProgress(
    request.pathProgress + (Math.random() * 2 - 1) * CHILD_PATH_JITTER
  );

  return {
    id,
    type: request.type,
    name,
    health,
    maxHealth: health,
    speed: request.speed,
    reward: 0,
    color: request.color,
    size,
    healthLoss: CHILD_HEALTH_LOSS,
    pathProgress,
    pathIndex: request.pathIndex,
    x: request.x,
    z: request.z,
    upgrades: [],
  };
};

/**
 * Consumes pending `splitRequest` entities raised by the death system:
 * spawns a random number of weaker, zero-reward children and destroys the
 * request. Mirrors `runApplyEffectSystem` (collect, consume, destroy).
 */
export const runEnemySplitSystem = (
  world: World,
  getNextEnemyId: () => number
): void => {
  const pending = world.query(splitRequest);
  if (pending.length === 0) return;

  const actions = enemyActions(world);
  for (const entity of pending) {
    const request = entity.get(splitRequest);
    if (request) {
      const count = randomIntInRange(request.minChildren, request.maxChildren);
      for (let i = 0; i < count; i += 1) {
        actions.spawnEnemy(buildSplitChild(getNextEnemyId(), request));
      }
    }
    entity.destroy();
  }
};

/**
 * Inclusive random integer between the two bounds, treating them as unordered
 * (a misconfigured `min > max` is normalized to the smaller/larger value).
 */
const randomIntInRange = (min: number, max: number): number => {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return low + Math.floor(Math.random() * (high - low + 1));
};
