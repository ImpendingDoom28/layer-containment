import { useCallback } from "react";

import { findEnemiesInRange } from "../../utils/mathUtils";
import { gameEvents } from "../../utils/eventEmitter";
import type { Enemy, Projectile } from "../types/game";
import type { EnemySystem } from "./useEnemySystem";
import { enemiesSelector, useLevelStore } from "../stores/useLevelStore";
import { GameEvent } from "../types/enums/events";

export const useProjectileSystem = (enemySystem: EnemySystem) => {
  const enemies = useLevelStore(enemiesSelector);
  const removeProjectile = useLevelStore((state) => state.removeProjectile);
  const { damageEnemy, slowEnemy } = enemySystem;

  const onProjectileHit = useCallback(
    (projectile: Projectile, targetEnemy: Enemy, currentTime: number = 0) => {
      if (projectile.projectileType === "beam") {
        damageEnemy(targetEnemy.id, projectile.damage);
      } else if (projectile.projectileType === "aoe" && projectile.aoeRadius) {
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
    [enemies, damageEnemy, slowEnemy]
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
