import { useCallback, useMemo } from "react";

import type { Enemy } from "../types/game";
import type { LevelSystem } from "./useLevelSystem";
import { enemiesSelector, useLevelStore } from "../stores/useLevelStore";

export const useEnemySystem = (levelSystem: LevelSystem) => {
  const { removeEnemy, updateEnemy } = levelSystem;
  const enemies = useLevelStore(enemiesSelector);
  const enemyById = useMemo(() => {
    return new Map(enemies.map((enemy) => [enemy.id, enemy]));
  }, [enemies]);

  const onEnemyReachEnd = useCallback(
    (enemyId: number) => {
      removeEnemy(enemyId, true);
    },
    [removeEnemy]
  );

  const onEnemyUpdate = useCallback(
    (enemyId: number, updates: Partial<Enemy>) => {
      updateEnemy(enemyId, updates);
    },
    [updateEnemy]
  );

  const damageEnemy = useCallback(
    (enemyId: number, damage: number): boolean => {
      const enemy = enemyById.get(enemyId);
      if (!enemy) return false;

      const newHealth = Math.max(0, enemy.health - damage);

      if (newHealth <= 0) {
        removeEnemy(enemyId, false);
        return true; // Enemy was killed
      } else {
        updateEnemy(enemyId, { health: newHealth });
        return false; // Enemy survived
      }
    },
    [enemyById, updateEnemy, removeEnemy]
  );

  // Apply slow debuff to enemy
  // Note: slowUntil should be set using the game clock, not Date.now()
  // This will be handled by the component that calls this
  const slowEnemy = useCallback(
    (
      enemyId: number,
      slowMultiplier: number,
      duration: number,
      currentTime: number
    ) => {
      const enemy = enemyById.get(enemyId);
      if (!enemy) return;

      // Check for slow resistance (1 = fully immune)
      const resistance = enemy.slowResistance ?? 0;
      if (resistance >= 1) return;

      // Reduce slow effectiveness based on resistance
      const effectiveSlowMultiplier =
        1 - (1 - slowMultiplier) * (1 - resistance);
      const slowUntil = currentTime + duration * (1 - resistance);

      updateEnemy(enemyId, {
        slowMultiplier: effectiveSlowMultiplier,
        slowUntil: slowUntil,
      });
    },
    [enemyById, updateEnemy]
  );

  return {
    onEnemyReachEnd,
    onEnemyUpdate,
    damageEnemy,
    slowEnemy,
  };
};

export type EnemySystem = ReturnType<typeof useEnemySystem>;
