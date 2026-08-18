import { createActions, type Entity, type TraitRecord } from "koota";

import { useAlmanacStore } from "../../stores/useAlmanacStore";
import { useLevelStore } from "../../stores/useLevelStore";
import { useGameStore } from "../../stores/useGameStore";
import type { Enemy } from "../../types/game";
import { GameEvent } from "../../types/enums/events";
import { gameEvents } from "../../../utils/eventEmitter";
import { EnemyState, IsEnemy, type EnemyStateData } from "../traits/enemy";

const enemyEntitiesById = new Map<number, Entity>();

type EnemyStateRecord = TraitRecord<typeof EnemyState>;

const enemyToState = (enemyData: Enemy): EnemyStateData => ({
  id: enemyData.id,
  type: enemyData.type,
  name: enemyData.name,
  health: enemyData.health,
  maxHealth: enemyData.maxHealth,
  speed: enemyData.speed,
  reward: enemyData.reward,
  color: enemyData.color,
  size: enemyData.size,
  healthLoss: enemyData.healthLoss,
  description: enemyData.description,
  pathProgress: enemyData.pathProgress,
  pathIndex: enemyData.pathIndex,
  slowUntil: enemyData.slowUntil,
  slowMultiplier: enemyData.slowMultiplier,
  x: enemyData.x,
  z: enemyData.z,
  upgrades: [...enemyData.upgrades],
  upgradeIndicatorColors: enemyData.upgradeIndicatorColors
    ? [...enemyData.upgradeIndicatorColors]
    : undefined,
  regeneration: enemyData.regeneration,
  slowResistance: enemyData.slowResistance,
  nextHealPulseAt: enemyData.nextHealPulseAt,
  healPulse: enemyData.healPulse,
});

const toEnemySnapshot = (state: EnemyStateRecord): Enemy => ({
  id: state.id,
  type: state.type,
  name: state.name,
  health: state.health,
  maxHealth: state.maxHealth,
  speed: state.speed,
  reward: state.reward,
  color: state.color,
  size: state.size,
  healthLoss: state.healthLoss,
  description: state.description,
  pathProgress: state.pathProgress,
  pathIndex: state.pathIndex,
  slowUntil: state.slowUntil,
  slowMultiplier: state.slowMultiplier,
  x: state.x,
  z: state.z,
  upgrades: state.upgrades,
  upgradeIndicatorColors: state.upgradeIndicatorColors,
  regeneration: state.regeneration,
  slowResistance: state.slowResistance,
  nextHealPulseAt: state.nextHealPulseAt,
  healPulse: state.healPulse,
});

const mergeEnemyState = (
  current: EnemyStateData,
  updates: Partial<Enemy>
): EnemyStateData => ({
  ...current,
  ...updates,
});

const emitEnemyKilled = (enemy: Enemy) => {
  gameEvents.emit(GameEvent.ENEMY_KILLED, {
    enemyId: enemy.id,
    enemyType: enemy.type,
    worldPosition: {
      x: enemy.x,
      y: enemy.size / 2,
      z: enemy.z,
    },
  });
};

const handleEnemyDeath = (enemy: Enemy) => {
  const gameStatus = useGameStore.getState().gameStatus;
  useLevelStore.getState().addMoney(enemy.reward);
  if (gameStatus !== "menu") {
    useLevelStore.getState().incrementEnemiesKilled();
  }
  emitEnemyKilled(enemy);
};

export const enemyActions = createActions((world) => ({
  spawnEnemy: (enemyData: Enemy): Entity => {
    const entity = world.spawn(IsEnemy, EnemyState);
    entity.set(EnemyState, enemyToState(enemyData));

    enemyEntitiesById.set(enemyData.id, entity);

    if (useGameStore.getState().gameStatus === "playing") {
      useAlmanacStore.getState().discoverEnemy(enemyData.type);
    }

    return entity;
  },

  updateEnemy: (enemyId: number, updates: Partial<Enemy>): boolean => {
    const entity = enemyEntitiesById.get(enemyId);
    if (!entity) return false;

    const current = entity.get(EnemyState);
    if (!current) return false;

    const updateKeys = Object.keys(updates) as Array<keyof Enemy>;
    if (updateKeys.length === 0) return false;

    const hasChanges = updateKeys.some((key) => current[key] !== updates[key]);
    if (!hasChanges) return false;

    const nextState = mergeEnemyState(current, updates);

    if (nextState.health <= 0) {
      handleEnemyDeath(toEnemySnapshot(nextState));
      enemyEntitiesById.delete(enemyId);
      entity.destroy();
      return true;
    }

    entity.set(EnemyState, nextState);
    return true;
  },

  removeEnemy: (enemyId: number, reachedEnd = false): boolean => {
    const entity = enemyEntitiesById.get(enemyId);
    if (!entity) return false;

    const state = entity.get(EnemyState);
    if (!state) return false;

    const enemy = toEnemySnapshot(state);

    if (reachedEnd) {
      useGameStore.getState().loseHealth(enemy.healthLoss);
      gameEvents.emit(GameEvent.ENEMY_REACHED_END, {
        enemyId,
        enemyType: enemy.type,
        worldPosition: {
          x: enemy.x,
          y: enemy.size / 2,
          z: enemy.z,
        },
      });
    } else {
      handleEnemyDeath(enemy);
    }

    enemyEntitiesById.delete(enemyId);
    entity.destroy();
    return true;
  },

  damageEnemy: (enemyId: number, damage: number): boolean => {
    const entity = enemyEntitiesById.get(enemyId);
    if (!entity) return false;

    const enemy = entity.get(EnemyState);
    if (!enemy) return false;

    const newHealth = Math.max(0, enemy.health - damage);

    if (newHealth <= 0) {
      enemyActions(world).removeEnemy(enemyId, false);
      return true;
    }

    entity.set(EnemyState, mergeEnemyState(enemy, { health: newHealth }));
    return false;
  },

  slowEnemy: (
    enemyId: number,
    slowMultiplier: number,
    duration: number,
    currentTime: number
  ): void => {
    const entity = enemyEntitiesById.get(enemyId);
    if (!entity) return;

    const enemy = entity.get(EnemyState);
    if (!enemy) return;

    const resistance = enemy.slowResistance ?? 0;
    if (resistance >= 1) return;

    const effectiveSlowMultiplier = 1 - (1 - slowMultiplier) * (1 - resistance);
    const slowUntil = currentTime + duration * (1 - resistance);

    entity.set(
      EnemyState,
      mergeEnemyState(enemy, {
        slowMultiplier: effectiveSlowMultiplier,
        slowUntil,
      })
    );
  },

  clearAllEnemies: (): void => {
    for (const entity of enemyEntitiesById.values()) {
      entity.destroy();
    }
    enemyEntitiesById.clear();
  },
}));

export { toEnemySnapshot };
