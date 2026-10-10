import { createActions, type Entity } from "koota";

import { useAlmanacStore } from "../../stores/useAlmanacStore";
import { useLevelStore } from "../../stores/useLevelStore";
import { useGameStore } from "../../stores/useGameStore";
import type { Enemy } from "../../types/game";
import { GameEvent } from "../../types/enums/events";
import { gameEvents } from "../../../utils/eventEmitter";
import {
  EnemyState,
  IsEnemy,
  requestEnemyDeath,
  toEnemySnapshot,
  type EnemyStateData,
} from "../traits/enemy";
import { isBase } from "../traits/base";
import { damageRequest } from "../traits/damage";

/** Enemy id → entity registry; internal to the enemy domain. */
const enemyEntitiesById = new Map<number, Entity>();

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

/** Settle a kill: reward, kill count, ENEMY_KILLED. Private to the enemy domain. */
const handleEnemyDeath = (enemy: Enemy): void => {
  const gameStatus = useGameStore.getState().gameStatus;
  useLevelStore.getState().addMoney(enemy.reward);
  if (gameStatus !== "menu") {
    useLevelStore.getState().incrementEnemiesKilled();
  }
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

export const enemyActions = createActions((world) => ({
  spawnEnemy: (enemyData: Enemy): Entity => {
    const existingEntity = enemyEntitiesById.get(enemyData.id);
    if (existingEntity) {
      existingEntity.destroy();
    }

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

    const nextState = { ...current, ...updates };

    if (nextState.health <= 0) {
      // Death is not settled here: clamp health and raise the request,
      // letting the EnemyDeathSystem own the kill.
      entity.set(EnemyState, { ...nextState, health: 0 });
      if (!entity.has(requestEnemyDeath)) {
        entity.add(requestEnemyDeath);
      }
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
      // Raise the damage as an ECS request (consumed by the ApplyDamageSystem).
      // Same-frame requests merge so no damage is lost.
      const base = world.queryFirst(isBase);
      if (base) {
        const pending = base.get(damageRequest);
        if (pending) {
          base.set(damageRequest, {
            amount: pending.amount + enemy.healthLoss,
          });
        } else {
          base.add(damageRequest({ amount: enemy.healthLoss }));
        }
      }
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

    const newHealth = enemy.health - damage;

    if (newHealth <= 0) {
      // Death is not settled here: clamp health and raise the request,
      // letting the EnemyDeathSystem own the kill.
      entity.set(EnemyState, { ...enemy, health: 0 });
      if (!entity.has(requestEnemyDeath)) {
        entity.add(requestEnemyDeath);
      }
      return true;
    }

    entity.set(EnemyState, { ...enemy, health: newHealth });
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

    entity.set(EnemyState, {
      ...enemy,
      slowMultiplier: effectiveSlowMultiplier,
      slowUntil,
    });
  },

  clearAllEnemies: (): void => {
    for (const entity of enemyEntitiesById.values()) {
      entity.destroy();
    }
    enemyEntitiesById.clear();
  },
}));
