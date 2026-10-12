import type { World, Entity } from "koota";

import { EnemyState } from "../traits/enemy";
import { slowRequest } from "../traits/slow";

/**
 * Applies slow effects to enemies.
 *
 * Consumes pending `slowRequest` traits (raised on discrete events, e.g. a
 * slow tower's projectile hit) by writing the adjusted strength and expiry
 * onto the cold `EnemyState`, then expires any active slow whose simulation
 * timestamp has passed.
 *
 * The request-consumption phase collects entities first and settles them
 * with `entity.set`/`entity.remove` after the query iteration: writes on a
 * trait being iterated are dropped by koota. Expiry uses `updateEach`
 * in-place mutation, which persists and fires the trait's change event.
 *
 * Runs before the EnemyMovementSystem so the movement pass reads the
 * updated slow state.
 */
export const runSlowSystem = (world: World, effectiveTime: number): void => {
  const pending = world.query(EnemyState, slowRequest);
  if (pending.length > 0) {
    const targets: Entity[] = [];
    for (const entity of pending) {
      targets.push(entity);
    }

    for (const entity of targets) {
      const state = entity.get(EnemyState);
      const request = entity.get(slowRequest);
      if (!state || !request) continue;

      entity.set(EnemyState, {
        ...state,
        slowMultiplier: request.multiplier,
        slowUntil: request.expiresAt,
      });
      entity.remove(slowRequest);
    }
  }

  world.query(EnemyState).updateEach(([state]) => {
    if (
      state.slowUntil > 0 &&
      state.slowMultiplier < 1 &&
      effectiveTime >= state.slowUntil
    ) {
      state.slowMultiplier = 1;
      state.slowUntil = 0;
    }
  });
};
