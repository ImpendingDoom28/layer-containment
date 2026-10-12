import type { World } from "koota";

import { EnemyState } from "../traits/enemy";
import { EnemySlow, slowRequest } from "../traits/slow";

/**
 * Applies slow effects to enemies.
 *
 * Slow state lives in the standalone `EnemySlow` trait: an enemy carries it
 * only while a slow is in effect. This system
 *
 * 1. consumes pending `slowRequest` traits (raised on discrete events, e.g. a
 *    slow tower's projectile hit) by writing the `EnemySlow` and removing the
 *    request, and
 * 2. expires active slows whose simulation timestamp has passed by removing
 *    the `EnemySlow` trait.
 *
 * Both passes settle their trait writes on the entity (`set`/`remove`) inside
 * the query iteration: koota drops writes on a trait that is *being iterated*,
 * but a write on a different trait of the same entity (the request → slow, or
 * the slow's own removal) is applied, which is what the damage system relies
 * on as well. No intermediate entity list is needed.
 *
 * Runs before the EnemyMovementSystem so the movement pass reads the updated
 * slow state.
 */
export const runSlowSystem = (world: World, effectiveTime: number): void => {
  // 1) Consume pending slow requests. The request is the trait being iterated,
  // so the EnemySlow write and the request removal happen via the entity.
  // First hit on an enemy adds the trait (`add` does not notify, so a
  // manual `changed` signals it); a refresh on an already-slowed enemy
  // overwrites via `set`.
  world
    .query(EnemyState, slowRequest)
    .updateEach(([_state, request], entity) => {
      const slow = entity.get(EnemySlow);
      if (slow) {
        entity.set(EnemySlow, {
          multiplier: request.multiplier,
          until: request.expiresAt,
        });
      } else {
        entity.add(
          EnemySlow({
            multiplier: request.multiplier,
            until: request.expiresAt,
          })
        );
        entity.changed(EnemySlow);
      }
      entity.remove(slowRequest);
    });

  // 2) Expire active slows. In-place mutation would not fire the trait's
  // change events, so expiry is a trait removal instead — which also drops
  // the slow from the enemy and keeps the trait absent when unslowed.
  world.query(EnemySlow).updateEach(([slow], entity) => {
    if (slow.until > 0 && slow.multiplier < 1 && effectiveTime >= slow.until) {
      entity.remove(EnemySlow);
    }
  });
};
