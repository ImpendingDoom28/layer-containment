import type { World } from "koota";

import type { Enemy } from "../../types/game";
import { EnemyState, IsEnemy } from "../traits/enemy";
import { toEnemySnapshot } from "../actions/enemyActions";

export const getEnemySnapshots = (world: World): Enemy[] => {
  const enemies: Enemy[] = [];
  world.query(IsEnemy, EnemyState).readEach(([state]) => {
    enemies.push(toEnemySnapshot(state));
  });
  return enemies;
};

export const getEnemiesById = (world: World): Map<number, Enemy> => {
  const byId = new Map<number, Enemy>();
  world.query(IsEnemy, EnemyState).readEach(([state]) => {
    const enemy = toEnemySnapshot(state);
    byId.set(enemy.id, enemy);
  });
  return byId;
};

export const getLivingEnemySnapshots = (world: World): Enemy[] =>
  getEnemySnapshots(world).filter((enemy) => enemy.health > 0);
