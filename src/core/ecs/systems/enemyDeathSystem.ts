import type { World } from "koota";

import { enemyActions } from "../actions/enemyActions";
import { EnemyState, IsEnemy, requestEnemyDeath } from "../traits/enemy";

/** Consumes requestEnemyDeath via the enemy domain's own removeEnemy action. */
export const runEnemyDeathSystem = (world: World): void => {
  const pending = world.query(IsEnemy, EnemyState, requestEnemyDeath);
  if (pending.length === 0) return;

  const actions = enemyActions(world);
  for (const entity of pending) {
    const state = entity.get(EnemyState);
    if (!state) continue;

    actions.removeEnemy(state.id, false);
  }
};
