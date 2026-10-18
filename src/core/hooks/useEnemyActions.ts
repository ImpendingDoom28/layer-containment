import { useCallback } from "react";
import { useActions } from "koota/react";

import {
  enemyActions,
  type EnemyRuntimeUpdates,
} from "../ecs/actions/enemyActions";
import type { TowerType } from "../types/game";

export const useEnemyActions = () => {
  const actions = useActions(enemyActions);

  const onEnemyReachEnd = useCallback(
    (enemyId: number) => {
      actions.removeEnemy(enemyId, true);
    },
    [actions]
  );

  const onEnemyUpdate = useCallback(
    (enemyId: number, updates: EnemyRuntimeUpdates) => {
      actions.updateEnemy(enemyId, updates);
    },
    [actions]
  );

  const damageEnemy = useCallback(
    (
      enemyId: number,
      damage: number,
      source?: { towerType: TowerType }
    ): boolean => {
      return actions.damageEnemy(enemyId, damage, source);
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

export type EnemyActions = ReturnType<typeof useEnemyActions>;
