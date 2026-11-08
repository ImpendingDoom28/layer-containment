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
      const source = { towerType: projectile.towerType };
      if (projectile.projectileType === "beam") {
        damageEnemy(targetEnemy.id, projectile.damage, source);
      } else if (projectile.projectileType === "chain") {
        damageEnemy(targetEnemy.id, projectile.damage, source);
      } else if (
        (projectile.projectileType === "aoe" ||
          projectile.projectileType === "rocket") &&
        projectile.aoeRadius
      ) {
        // Only AOE / the BRL rocket need the full snapshot array; allocate it
        // lazily so the far more common single/beam/chain hits don't allocate
        // per hit.
        const enemies = getEnemySnapshots(world);
        const enemiesInRange = findEnemiesInRange(
          enemies,
          targetEnemy.x,
          targetEnemy.z,
          projectile.aoeRadius
        );

        enemiesInRange.forEach((enemy) => {
          damageEnemy(enemy.id, projectile.damage, source);
        });
      } else {
        damageEnemy(targetEnemy.id, projectile.damage, source);

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
        // The blast radius and tower color: the rocket's impact FX (the
        // ground-blast ring) reads both off the hit event to size and tint
        // the area of effect.
        aoeRadius: projectile.aoeRadius,
        color: projectile.color,
        worldPosition: {
          x: targetEnemy.x,
          y: targetEnemy.size / 2,
          z: targetEnemy.z,
        },
      });
      if (
        (projectile.projectileType === "aoe" ||
          projectile.projectileType === "rocket") &&
        projectile.aoeRadius
      ) {
        // The detonation itself (not the single-target hit that triggers it):
        // the micro camera punch listens to this and kicks toward the blast.
        gameEvents.emit(GameEvent.PROJECTILE_EXPLOSION, {
          projectileId: projectile.id,
          towerType: projectile.towerType,
          worldPosition: {
            x: targetEnemy.x,
            y: 0,
            z: targetEnemy.z,
          },
        });
      }
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
