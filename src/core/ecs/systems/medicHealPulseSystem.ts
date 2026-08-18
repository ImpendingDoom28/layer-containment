import type { World } from "koota";

import {
  computeHealPulseHealthUpdates,
  getInitialNextHealPulseAt,
} from "../../../utils/enemyMedicPulse";
import { enemyActions } from "../actions/enemyActions";
import { getEnemySnapshots } from "../selectors/enemySnapshots";

export const runMedicHealPulseSystem = (
  world: World,
  effectiveTime: number
): void => {
  const actions = enemyActions(world);
  const enemies = getEnemySnapshots(world);

  for (const enemy of enemies) {
    if (!enemy.healPulse || enemy.health <= 0) continue;

    const { healPulse } = enemy;

    if (enemy.nextHealPulseAt === undefined || enemy.nextHealPulseAt === 0) {
      actions.updateEnemy(enemy.id, {
        nextHealPulseAt: getInitialNextHealPulseAt(
          effectiveTime,
          healPulse.intervalSeconds
        ),
      });
      continue;
    }

    if (effectiveTime < enemy.nextHealPulseAt) continue;

    const updates = computeHealPulseHealthUpdates(enemy, enemies, healPulse);
    for (const update of updates) {
      actions.updateEnemy(update.enemyId, { health: update.health });
    }

    actions.updateEnemy(enemy.id, {
      nextHealPulseAt: getInitialNextHealPulseAt(
        effectiveTime,
        healPulse.intervalSeconds
      ),
    });
  }
};
