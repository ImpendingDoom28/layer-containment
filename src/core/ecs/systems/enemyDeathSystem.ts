import type { World } from "koota";

import { enemyActions } from "../actions/enemyActions";
import { EnemyState, IsEnemy, requestEnemyDeath } from "../traits/enemy";
import { EnemyLocomotion } from "../traits/locomotion";
import { Position } from "../traits/position";
import { EnemyMotion } from "../traits/enemy";
import { splitRequest } from "../traits/split";

/**
 * Consumes `requestEnemyDeath` via the enemy domain's own `removeEnemy`
 * action. A splitter raises a `splitRequest` first so the EnemySplitSystem
 * can spawn its death-children from the captured death location.
 *
 * An enemy whose `EnemyLocomotion` carries a `deathPreburstSeconds` window is
 * held back first: the killing blow stamps the request with the simulation
 * time and the dead enemy lingers (frozen, still counted by
 * `getRemainingEnemyCount`) while the renderer plays the squash-stretch
 * anticipation, so the burst (and the split shrapnel) land at the end of the
 * squash.
 */
export const runEnemyDeathSystem = (
  world: World,
  simulationTimeSeconds: number
): void => {
  const pending = world.query(IsEnemy, EnemyState, requestEnemyDeath);
  if (pending.length === 0) return;

  const actions = enemyActions(world);
  for (const entity of pending) {
    const state = entity.get(EnemyState);
    if (!state) continue;

    const preburstSeconds =
      entity.get(EnemyLocomotion)?.deathPreburstSeconds ?? 0;
    if (preburstSeconds > 0) {
      const request = entity.get(requestEnemyDeath);
      if (!request) continue;
      if (request.requestedAt < 0) {
        entity.set(requestEnemyDeath, {
          requestedAt: simulationTimeSeconds,
        });
        continue;
      }
      if (simulationTimeSeconds - request.requestedAt < preburstSeconds) {
        continue;
      }
    }

    const motion = entity.get(EnemyMotion);
    const position = entity.get(Position);
    if (state.split && motion && position) {
      world.spawn(
        splitRequest({
          type: state.type,
          color: state.color,
          health: state.maxHealth,
          speed: state.speed,
          size: state.size,
          healthLoss: state.healthLoss,
          minChildren: state.split.minChildren,
          maxChildren: state.split.maxChildren,
          x: position.x,
          z: position.z,
          pathProgress: motion.pathProgress,
          pathIndex: state.pathIndex,
        })
      );
    }

    actions.removeEnemy(state.id, false);
  }
};
