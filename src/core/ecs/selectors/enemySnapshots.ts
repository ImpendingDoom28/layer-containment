import type { World } from "koota";

import type { Enemy } from "../../types/game";
import {
  EnemyMotion,
  EnemyState,
  IsEnemy,
  toEnemySnapshot,
} from "../traits/enemy";

export const getEnemySnapshots = (world: World): Enemy[] => {
  const enemies: Enemy[] = [];
  world.query(IsEnemy, EnemyState, EnemyMotion).readEach(
    ([state, motion]) => {
      enemies.push(toEnemySnapshot(state, motion));
    }
  );
  return enemies;
};

export const getEnemiesById = (world: World): Map<number, Enemy> => {
  const byId = new Map<number, Enemy>();
  world.query(IsEnemy, EnemyState, EnemyMotion).readEach(
    ([state, motion]) => {
      const enemy = toEnemySnapshot(state, motion);
      byId.set(enemy.id, enemy);
    }
  );
  return byId;
};

export const getLivingEnemySnapshots = (world: World): Enemy[] =>
  getEnemySnapshots(world).filter((enemy) => enemy.health > 0);
