import { useCallback } from "react";

import { findEnemiesInRange } from "../../utils/mathUtils";
import { gameEvents } from "../../utils/eventEmitter";
import type { Enemy, Projectile } from "../types/game";
import type { EnemyActions } from "./useEnemyActions";
import { useLevelStore } from "../stores/useLevelStore";
import { GameEvent } from "../types/enums/events";
import { world } from "../ecs/world";
import { getEnemySnapshots } from "../ecs/selectors/enemySnapshots";

export const useProjectileSystem = (enemyActions: EnemyActions) => {
  const removeProjectile = useLevelStore((state) => state.removeProjectile);
  const { damageEnemy, slowEnemy } = enemyActions;

  const onProjectileHit = useCallback(
    (projectile: Projectile, targetEnemy: Enemy, currentTime: number = 0) => {
      if (projectile.projectileType === "beam") {
        damageEnemy(targetEnemy.id, projectile.damage);
      } else if (projectile.projectileType === "chain") {
        damageEnemy(targetEnemy.id, projectile.damage);
      } else if (projectile.projectileType === "aoe" && projectile.aoeRadius) {
        // Only AOE needs the full snapshot array; allocate it lazily so the
        // far more common single/beam/chain hits don't allocate per hit.
        const enemies = getEnemySnapshots(world);
        const enemiesInRange = findEnemiesInRange(
          enemies,
          targetEnemy.x,
          targetEnemy.z,
          projectile.aoeRadius
        );

        enemiesInRange.forEach((enemy) => {
          damageEnemy(enemy.id, projectile.damage);
        });
      } else {
        damageEnemy(targetEnemy.id, projectile.damage);

        if (
          projectile.projectileType === "single" &&
          projectile.towerType === "slow" &&
          projectile.slowAmount &&
          projectile.slowDuration
        ) {
          slowEnemy(
            targetEnemy.id,
            projectile.slowAmount,
            projectile.slowDuration,
            currentTime
          );
        }
      }
      gameEvents.emit(GameEvent.PROJECTILE_HIT, {
        projectileId: projectile.id,
        enemyId: targetEnemy.id,
        projectileType: projectile.projectileType,
        towerType: projectile.towerType,
        worldPosition: {
          x: targetEnemy.x,
          y: targetEnemy.size / 2,
          z: targetEnemy.z,
        },
      });
    },
    [damageEnemy, slowEnemy]
  );

  const onProjectileRemove = useCallback(
    (projectileId: number) => {
      removeProjectile(projectileId);
    },
    [removeProjectile]
  );

  return {
    onProjectileHit,
    onProjectileRemove,
  };
};
