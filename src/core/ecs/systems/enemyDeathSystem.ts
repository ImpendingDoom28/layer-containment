import type { World } from "koota";

import { enemyActions } from "../actions/enemyActions";
import { EnemyState, IsEnemy, requestEnemyDeath } from "../traits/enemy";
import { Position } from "../traits/position";
import { EnemyMotion } from "../traits/enemy";
import { splitRequest } from "../traits/split";

/**
 * Consumes `requestEnemyDeath` via the enemy domain's own `removeEnemy`
 * action. A splitter raises a `splitRequest` first so the EnemySplitSystem
 * can spawn its death-children from the captured death location.
 */
export const runEnemyDeathSystem = (world: World): void => {
  const pending = world.query(IsEnemy, EnemyState, requestEnemyDeath);
  if (pending.length === 0) return;

  const actions = enemyActions(world);
  for (const entity of pending) {
    const state = entity.get(EnemyState);
    if (!state) continue;

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
