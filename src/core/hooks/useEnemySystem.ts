import { useCallback } from "react";
import { useActions } from "koota/react";

import type { Enemy } from "../types/game";
import type { LevelSystem } from "./useLevelSystem";
import { enemyActions } from "../ecs/actions/enemyActions";

export const useEnemySystem = (levelSystem: LevelSystem) => {
  const { removeEnemy, updateEnemy } = levelSystem;
  const actions = useActions(enemyActions);

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
      return actions.damageEnemy(enemyId, damage);
    },
    [actions]
  );

  const slowEnemy = useCallback(
    (
      enemyId: number,
      slowMultiplier: number,
      duration: number,
      currentTime: number
    ) => {
      actions.slowEnemy(enemyId, slowMultiplier, duration, currentTime);
    },
    [actions]
  );

  return {
    onEnemyReachEnd,
    onEnemyUpdate,
    damageEnemy,
    slowEnemy,
  };
};

export type EnemySystem = ReturnType<typeof useEnemySystem>;
