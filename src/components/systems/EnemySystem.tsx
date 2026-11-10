import React, { memo } from "react";
import { Enemy } from "../entities/Enemy";
import { useQuery } from "koota/react";
import { IsEnemy } from "../../core/ecs/traits/enemy";

export const EnemySystem: React.FC = memo(() => {
  const enemyEntities = useQuery(IsEnemy);

  return (
    <group name="enemies">
      {enemyEntities.map((entity) => (
        <Enemy key={entity} entity={entity} />
      ))}
    </group>
  );
});

EnemySystem.displayName = "EnemySystem";
